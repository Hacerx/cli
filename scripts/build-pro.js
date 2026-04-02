import { build } from 'esbuild';
import { readdirSync, existsSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const projectRoot = join(__dirname, '..');
const srcCommandsDir = join(projectRoot, 'src', 'commands');
const entryFile = join(projectRoot, 'src', '_pro_entry.ts');
const outFile = join(projectRoot, 'dist', 'index.js');
function collectCommandFiles(dir, prefix) {
    const results = [];
    if (!existsSync(dir))
        return results;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, item.name);
        if (item.isDirectory()) {
            results.push(...collectCommandFiles(fullPath, [...prefix, item.name]));
        }
        else if (item.isFile() &&
            item.name.endsWith('.ts') &&
            !item.name.endsWith('.test.ts') &&
            !item.name.endsWith('.d.ts')) {
            results.push({
                path: [...prefix, item.name.replace(/\.ts$/, '')],
                srcPath: fullPath,
            });
        }
    }
    return results;
}
function generateEntry(commands) {
    const imports = commands
        .map((cmd, i) => {
        const rel = relative(join(projectRoot, 'src'), cmd.srcPath)
            .replace(/\\/g, '/')
            .replace(/\.ts$/, '.js');
        return `import _cmd${i} from './${rel}';`;
    })
        .join('\n');
    const entries = commands
        .map((cmd, i) => `  { path: ${JSON.stringify(cmd.path)}, CommandClass: _cmd${i} },`)
        .join('\n');
    return `${imports}\nimport { registerCommandsStatic } from './cli.js';\n\nregisterCommandsStatic([\n${entries}\n]);\n`;
}
const commands = collectCommandFiles(srcCommandsDir, []);
if (commands.length === 0) {
    console.error('No commands found in src/commands/');
    process.exit(1);
}
// Clean dist/
const distDir = join(projectRoot, 'dist');
if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
    console.log('Cleaned dist/');
}
console.log(`Found ${commands.length} command(s). Generating entry point...`);
writeFileSync(entryFile, generateEntry(commands), 'utf-8');
try {
    console.log('Bundling with esbuild...');
    await build({
        entryPoints: [entryFile],
        bundle: true,
        minify: true,
        platform: 'node',
        format: 'esm',
        outfile: outFile,
        // Polyfill require() for bundled CJS deps that use it at runtime
        banner: { js: "#!/usr/bin/env node\nimport{createRequire}from'module';const require=createRequire(import.meta.url);" },
    });
    console.log('Built: dist/index.js');
}
finally {
    unlinkSync(entryFile);
}
