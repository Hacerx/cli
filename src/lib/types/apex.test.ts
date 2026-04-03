import { describe, it, expect } from 'vitest';
import { apexTypeToTs, classMirrorToDts } from './apex.js';
import type { ClassMirror, ReferencedType } from '@cparra/apex-reflection';

// ── Helpers ────────────────────────────────────────────────────────────────

function ref(type: string, rawDeclaration = type): ReferencedType {
  return { type, rawDeclaration };
}

function listRef(inner: ReferencedType): ReferencedType {
  return { type: 'List', rawDeclaration: `List<${inner.rawDeclaration}>`, ofType: inner } as any;
}

function setRef(inner: ReferencedType): ReferencedType {
  return { type: 'Set', rawDeclaration: `Set<${inner.rawDeclaration}>`, ofType: inner } as any;
}

function mapRef(key: ReferencedType, value: ReferencedType): ReferencedType {
  return { type: 'Map', rawDeclaration: `Map<${key.rawDeclaration}, ${value.rawDeclaration}>`, keyType: key, valueType: value } as any;
}

function makeClass(overrides: Partial<ClassMirror> = {}): ClassMirror {
  return {
    name: 'MyClass',
    type_name: 'class',
    access_modifier: 'public',
    annotations: [],
    properties: [],
    fields: [],
    methods: [],
    classes: [],
    enums: [],
    interfaces: [],
    constructors: [],
    implemented_interfaces: [],
    ...overrides,
  };
}

function makeProp(name: string, type: ReferencedType, overrides: Record<string, unknown> = {}) {
  return { name, typeReference: type, access_modifier: 'public', annotations: [], memberModifiers: [], ...overrides };
}

function makeMethod(name: string, returnType: ReferencedType, params: { name: string; typeReference: ReferencedType }[] = [], overrides: Record<string, unknown> = {}) {
  return {
    name,
    typeReference: returnType,
    parameters: params.map(p => ({ ...p, memberModifiers: [], docComment: undefined })),
    access_modifier: 'public',
    annotations: [],
    memberModifiers: [],
    ...overrides,
  };
}

const DEFAULT_OPTS = { auraEnabledOnly: false, includeMethods: true };

// ── apexTypeToTs ───────────────────────────────────────────────────────────

describe('apexTypeToTs — primitives', () => {
  it.each([
    ['String', 'string'],
    ['Id', 'string'],
    ['Integer', 'number'],
    ['Long', 'number'],
    ['Double', 'number'],
    ['Decimal', 'number'],
    ['Boolean', 'boolean'],
    ['void', 'void'],
    ['Date', 'string'],
    ['Datetime', 'string'],
    ['Time', 'string'],
    ['Blob', 'string'],
    ['Object', 'unknown'],
    ['SObject', 'Record<string, unknown>'],
  ])('%s → %s', (apexType, expected) => {
    expect(apexTypeToTs(ref(apexType))).toBe(expected);
  });

  it('unknown custom type passes through unchanged', () => {
    expect(apexTypeToTs(ref('AccountWrapper'))).toBe('AccountWrapper');
  });
});

describe('apexTypeToTs — collections', () => {
  it('List<String> → string[]', () => {
    expect(apexTypeToTs(listRef(ref('String')))).toBe('string[]');
  });

  it('List<Integer> → number[]', () => {
    expect(apexTypeToTs(listRef(ref('Integer')))).toBe('number[]');
  });

  it('Set<Boolean> → boolean[]', () => {
    expect(apexTypeToTs(setRef(ref('Boolean')))).toBe('boolean[]');
  });

  it('List<CustomType> → CustomType[]', () => {
    expect(apexTypeToTs(listRef(ref('MyWrapper')))).toBe('MyWrapper[]');
  });

  it('Map<String, Integer> → Record<string, number>', () => {
    expect(apexTypeToTs(mapRef(ref('String'), ref('Integer')))).toBe('Record<string, number>');
  });

  it('Map<String, List<Id>> → Record<string, string[]>', () => {
    expect(apexTypeToTs(mapRef(ref('String'), listRef(ref('Id'))))).toBe('Record<string, string[]>');
  });

  it('nested List<List<String>> → string[][]', () => {
    expect(apexTypeToTs(listRef(listRef(ref('String'))))).toBe('string[][]');
  });
});

// ── classMirrorToDts ───────────────────────────────────────────────────────

describe('classMirrorToDts — basic output', () => {
  it('generates export type block', () => {
    const cls = makeClass({ name: 'Foo', properties: [makeProp('bar', ref('String'))] });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).toContain('export type Foo = {');
    expect(dts).toContain('bar: string;');
  });

  it('includes fields alongside properties', () => {
    const cls = makeClass({ fields: [makeProp('myField', ref('Integer'))] });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).toContain('myField: number;');
  });

  it('includes public method signatures when includeMethods is true', () => {
    const cls = makeClass({ methods: [makeMethod('doWork', ref('Boolean'), [{ name: 'input', typeReference: ref('String') }])] });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).toContain('doWork(input: string): boolean;');
  });

  it('excludes methods when includeMethods is false', () => {
    const cls = makeClass({ methods: [makeMethod('doWork', ref('void'))] });
    const dts = classMirrorToDts(cls, { ...DEFAULT_OPTS, includeMethods: false });
    expect(dts).not.toContain('doWork');
  });
});

describe('classMirrorToDts — access modifier filtering', () => {
  it('excludes private members', () => {
    const cls = makeClass({ properties: [makeProp('secret', ref('String'), { access_modifier: 'private' })] });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).not.toContain('secret');
  });

  it('excludes protected members', () => {
    const cls = makeClass({ properties: [makeProp('inner', ref('Integer'), { access_modifier: 'protected' })] });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).not.toContain('inner');
  });

  it('includes global members', () => {
    const cls = makeClass({ properties: [makeProp('globalProp', ref('Boolean'), { access_modifier: 'global' })] });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).toContain('globalProp: boolean;');
  });
});

describe('classMirrorToDts — auraEnabledOnly', () => {
  const auraAnnotation = { name: 'auraenabled', rawDeclaration: '@AuraEnabled', type: 'marker' };

  it('excludes non-annotated members when auraEnabledOnly is true', () => {
    const cls = makeClass({
      properties: [
        makeProp('visible', ref('String'), { annotations: [auraAnnotation] }),
        makeProp('hidden', ref('String'), { annotations: [] }),
      ],
    });
    const dts = classMirrorToDts(cls, { ...DEFAULT_OPTS, auraEnabledOnly: true });
    expect(dts).toContain('visible: string;');
    expect(dts).not.toContain('hidden');
  });

  it('includes all public members when auraEnabledOnly is false', () => {
    const cls = makeClass({ properties: [makeProp('a', ref('String')), makeProp('b', ref('Integer'))] });
    const dts = classMirrorToDts(cls, { ...DEFAULT_OPTS, auraEnabledOnly: false });
    expect(dts).toContain('a: string;');
    expect(dts).toContain('b: number;');
  });
});

describe('classMirrorToDts — inheritance', () => {
  it('uses intersection type for extended classes', () => {
    const cls = makeClass({ name: 'Child', extended_class: 'Parent' });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).toContain('export type Child = Parent & {');
  });
});

describe('classMirrorToDts — inner classes', () => {
  it('emits a namespace block for inner classes', () => {
    const inner = makeClass({ name: 'Inner', properties: [makeProp('val', ref('Integer'))] });
    const cls = makeClass({ name: 'Outer', classes: [inner] });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).toContain('export namespace Outer {');
    expect(dts).toContain('export type Inner = {');
    expect(dts).toContain('val: number;');
  });

  it('does not emit namespace block when there are no public inner classes', () => {
    const inner = makeClass({ name: 'Inner', access_modifier: 'private' });
    const cls = makeClass({ name: 'Outer', classes: [inner] });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).not.toContain('namespace');
  });
});

describe('classMirrorToDts — JSDoc', () => {
  it('adds JSDoc comment for class description', () => {
    const cls = makeClass({ docComment: { description: 'Service class', descriptionLines: [], paramAnnotations: [], returnAnnotation: null, exampleAnnotation: null, throwsAnnotations: [], annotations: [] } });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).toContain('/** Service class */');
  });

  it('adds inline JSDoc for property description', () => {
    const prop = makeProp('amount', ref('Decimal'));
    prop.docComment = { description: 'Total amount', descriptionLines: [], paramAnnotations: [], returnAnnotation: null, exampleAnnotation: null, throwsAnnotations: [], annotations: [] };
    const cls = makeClass({ properties: [prop] });
    const dts = classMirrorToDts(cls, DEFAULT_OPTS);
    expect(dts).toContain('/** Total amount */');
  });
});
