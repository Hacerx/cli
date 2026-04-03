import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { CommandBase, FlagType } from '../../../lib/CommandBase.js';
import { apexTypeToTs, classMirrorToDts } from '../../../lib/types/apex.js';
import type { ClassMirror } from '@cparra/apex-reflection';

const flags = {
  'apex-class': FlagType.array<string>({
    char: 'c',
    description: 'Apex class name(s) to generate TypeScript types for',
    required: true,
  }),
  username: FlagType.sfOrg({
    char: 'u',
    description: 'Org alias or username — fetch class body directly from the org instead of local files',
  }),
  'base-dir': FlagType.string({
    char: 'b',
    description: 'Root directory to search for .cls files (ignored when --username is set)',
    defaultValue: process.cwd(),
  }),
  'output-dir': FlagType.string({
    char: 'o',
    description: 'Output directory for generated .d.ts files',
    defaultValue: './types',
  }),
  'aura-enabled-only': FlagType.boolean({
    description: 'Only include members annotated with @AuraEnabled',
    defaultValue: false,
  }),
  'include-methods': FlagType.boolean({
    description: 'Include public method signatures in generated types',
    defaultValue: true,
  }),
} as const;

export default class ApexTypes extends CommandBase<typeof flags> {
  description = 'Generate TypeScript type declarations from Apex classes';
  flags = flags;
  examples = [
    { description: 'Generate types from a local .cls file', command: 'hacerx sf types apex -c MyApexClass' },
    { description: 'Fetch class body directly from a Salesforce org', command: 'hacerx sf types apex -c MyApexClass -u myorg' },
    { description: 'Fetch multiple classes from an org', command: 'hacerx sf types apex -c AccountService ContactService -u myorg' },
    { description: 'Specify where to look for .cls files and where to write output', command: 'hacerx sf types apex -c MyClass -b ./force-app/main/default/classes -o ./src/types' },
    { description: 'Only emit @AuraEnabled members', command: 'hacerx sf types apex -c MyController -u myorg --aura-enabled-only' },
    { description: 'Exclude method signatures', command: 'hacerx sf types apex -c MyClass --include-methods false' },
  ];

  async run() {
    const { reflect } = await import('@cparra/apex-reflection');
    const { writeFile, format } = await import('../../../lib/files.js');

    const {
      apexClass: classNames,
      username,
      baseDir,
      outputDir,
      auraEnabledOnly,
      includeMethods,
    } = this.options;

    const opts = { auraEnabledOnly: auraEnabledOnly ?? false, includeMethods: includeMethods ?? true };
    const outDir = outputDir ?? './types';
    const names = classNames ?? [];

    // Resolve sources: org fetch (all at once) or local file per class
    const sources: Map<string, string> = username
      ? await fetchFromOrg(username, names)
      : resolveFromLocal(names, baseDir ?? process.cwd());

    for (const className of names) {
      const source = sources.get(className);
      if (!source) {
        const location = username ? `org '${username}'` : `directory '${baseDir ?? process.cwd()}'`;
        console.error(`  ✗ ${className} not found in ${location}`);
        continue;
      }

      const { typeMirror, error } = reflect(source);

      if (error) {
        console.error(`  ✗ ${className}: parse error — ${error.message}`);
        continue;
      }
      if (!typeMirror || typeMirror.type_name !== 'class') {
        console.error(`  ✗ ${className}: not a class (got ${typeMirror?.type_name ?? 'nothing'})`);
        continue;
      }

      const dts = classMirrorToDts(typeMirror as ClassMirror, opts);
      const header = `// Generated from Apex: ${className}.cls — do not edit manually.\n\n`;
      const content = await format(header + dts);
      const outPath = join(outDir, `${className}.d.ts`);
      await writeFile(outPath, content);
      console.log(`  ✓ ${className} → ${outPath}`);
    }
  }
}

// ── Source resolution ──────────────────────────────────────────────────────

type ApexClassRecord = { Name: string; Body: string };

async function fetchFromOrg(username: string, classNames: string[]): Promise<Map<string, string>> {
  const { getConnection } = await import('../../../lib/sf.js');
  const conn = await getConnection(username);
  const inClause = classNames.map(n => `'${n}'`).join(',');
  const result = await conn.tooling.query<ApexClassRecord>(
    `SELECT Name, Body FROM ApexClass WHERE Name IN (${inClause})`,
  );
  const map = new Map<string, string>();
  for (const record of result.records) map.set(record.Name, record.Body);
  return map;
}

function resolveFromLocal(classNames: string[], baseDir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const className of classNames) {
    const filePath = findClsFile(baseDir, className);
    if (filePath) map.set(className, readFileSync(filePath, 'utf-8'));
  }
  return map;
}

// ── File finder ────────────────────────────────────────────────────────────

export function findClsFile(baseDir: string, className: string): string | null {
  const target = `${className}.cls`;
  try {
    const entries = readdirSync(baseDir);
    for (const entry of entries) {
      const full = join(baseDir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        const found = findClsFile(full, className);
        if (found) return found;
      } else if (entry === target || (extname(entry) === '.cls' && entry === target)) {
        return full;
      }
    }
  } catch {
    // unreadable directory — skip
  }
  return null;
}
