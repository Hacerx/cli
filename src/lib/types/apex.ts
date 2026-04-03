import type {
  ClassMirror,
  ReferencedType,
  PropertyMirror,
  FieldMirror,
  MethodMirror,
  Annotation,
} from '@cparra/apex-reflection';

// ── Type mapping ───────────────────────────────────────────────────────────

const PRIMITIVES: Record<string, string> = {
  string: 'string',
  id: 'string',
  integer: 'number',
  long: 'number',
  double: 'number',
  decimal: 'number',
  boolean: 'boolean',
  void: 'void',
  date: 'string',
  datetime: 'string',
  time: 'string',
  blob: 'string',
  object: 'unknown',
  sobject: 'Record<string, unknown>',
};

export function apexTypeToTs(ref: ReferencedType): string {
  const lower = ref.type.toLowerCase();

  const primitive = PRIMITIVES[lower];
  if (primitive) return primitive;

  if (lower === 'list' && 'ofType' in ref) return `${apexTypeToTs(ref.ofType)}[]`;
  if (lower === 'set' && 'ofType' in ref) return `${apexTypeToTs(ref.ofType)}[]`;
  if (lower === 'map' && 'keyType' in ref)
    return `Record<${apexTypeToTs(ref.keyType)}, ${apexTypeToTs(ref.valueType)}>`;

  // Generic wrapper (e.g. Database.SaveResult<Foo>) — fall through to rawDeclaration name
  if ('ofType' in ref) return ref.rawDeclaration;

  // Custom type or inner class — keep as-is
  return ref.type;
}

// ── Code generation ────────────────────────────────────────────────────────

export type GenerateOpts = {
  auraEnabledOnly: boolean;
  includeMethods: boolean;
};

function isAuraEnabled(annotations: Annotation[]): boolean {
  return annotations.some(a => a.name === 'auraenabled');
}

function isPublic(accessModifier: string): boolean {
  return accessModifier === 'public' || accessModifier === 'global';
}

function memberFilter(
  member: PropertyMirror | FieldMirror | MethodMirror,
  opts: GenerateOpts,
): boolean {
  if (!isPublic(member.access_modifier)) return false;
  if (opts.auraEnabledOnly && !isAuraEnabled(member.annotations)) return false;
  return true;
}

function renderJsDoc(description?: string): string {
  if (!description?.trim()) return '';
  return `/** ${description.trim()} */\n  `;
}

function renderMembers(mirror: ClassMirror, opts: GenerateOpts): string {
  const lines: string[] = [];

  for (const m of [...mirror.properties, ...mirror.fields]) {
    if (!memberFilter(m, opts)) continue;
    const doc = renderJsDoc(m.docComment?.description);
    lines.push(`  ${doc}${m.name}: ${apexTypeToTs(m.typeReference)};`);
  }

  if (opts.includeMethods) {
    for (const m of mirror.methods) {
      if (!memberFilter(m, opts)) continue;
      const params = m.parameters
        .map(p => `${p.name}: ${apexTypeToTs(p.typeReference)}`)
        .join(', ');
      const ret = apexTypeToTs(m.typeReference);
      const doc = renderJsDoc(m.docComment?.description);
      lines.push(`  ${doc}${m.name}(${params}): ${ret};`);
    }
  }

  return lines.join('\n');
}

export function classMirrorToDts(mirror: ClassMirror, opts: GenerateOpts): string {
  const parts: string[] = [];

  // Main type
  const base = mirror.extended_class ? `${mirror.extended_class} & {\n` : '{\n';
  const members = renderMembers(mirror, opts);
  const docHeader = mirror.docComment?.description
    ? `/** ${mirror.docComment.description.trim()} */\n`
    : '';
  parts.push(`${docHeader}export type ${mirror.name} = ${base}${members}\n};`);

  // Inner classes as namespace
  if (mirror.classes.length > 0) {
    const innerBlocks = mirror.classes
      .filter(ic => isPublic(ic.access_modifier))
      .map(ic => {
        const inner = classMirrorToDts(ic, opts)
          .split('\n')
          .map(l => `  ${l}`)
          .join('\n');
        return inner;
      });

    if (innerBlocks.length > 0) {
      parts.push(`export namespace ${mirror.name} {\n${innerBlocks.join('\n\n')}\n}`);
    }
  }

  return parts.join('\n\n');
}
