import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApexTypes, { findClsFile } from './apex.js';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@cparra/apex-reflection', () => ({
  reflect: vi.fn(),
}));

vi.mock('../../../lib/files.js', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  format: vi.fn().mockImplementation((content: string) => Promise.resolve(content)),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('public class MyClass {}'),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
}));

vi.mock('../../../lib/sf.js', () => ({
  getConnection: vi.fn(),
}));

import { reflect } from '@cparra/apex-reflection';
import { writeFile, format } from '../../../lib/files.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { getConnection } from '../../../lib/sf.js';

const mockReflect = vi.mocked(reflect);
const mockWriteFile = vi.mocked(writeFile);
const mockFormat = vi.mocked(format);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockStatSync = vi.mocked(statSync);
const mockGetConnection = vi.mocked(getConnection);

// ── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_CLASS_MIRROR = {
  name: 'MyClass',
  type_name: 'class' as const,
  access_modifier: 'public',
  annotations: [],
  properties: [
    {
      name: 'accountId',
      access_modifier: 'public',
      annotations: [],
      memberModifiers: [],
      typeReference: { type: 'Id', rawDeclaration: 'Id' },
    },
  ],
  fields: [],
  methods: [],
  classes: [],
  enums: [],
  interfaces: [],
  constructors: [],
  implemented_interfaces: [],
  extended_class: undefined,
  docComment: undefined,
};

function makeInstance(opts: {
  apexClass?: string[];
  username?: string;
  baseDir?: string;
  outputDir?: string;
  auraEnabledOnly?: boolean;
  includeMethods?: boolean;
} = {}): ApexTypes {
  const instance = new ApexTypes();
  instance.options = {
    apexClass: opts.apexClass ?? ['MyClass'],
    username: opts.username,
    baseDir: opts.baseDir ?? '/project/classes',
    outputDir: opts.outputDir ?? './types',
    auraEnabledOnly: opts.auraEnabledOnly ?? false,
    includeMethods: opts.includeMethods ?? true,
  } as any;
  return instance;
}

function makeOrgConn(records: { Name: string; Body: string }[]) {
  return { tooling: { query: vi.fn().mockResolvedValue({ records }) } };
}

function setupFoundFile(fileName = 'MyClass.cls') {
  mockReaddirSync.mockReturnValue([fileName] as any);
  mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
  mockReadFileSync.mockReturnValue('public class MyClass {}' as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFormat.mockImplementation((c: string) => Promise.resolve(c));
  mockWriteFile.mockResolvedValue(undefined);
  mockReflect.mockReturnValue({ typeMirror: MOCK_CLASS_MIRROR });
  mockGetConnection.mockResolvedValue(
    makeOrgConn([{ Name: 'MyClass', Body: 'public class MyClass {}' }]) as any,
  );
});

// ── findClsFile ────────────────────────────────────────────────────────────

describe('findClsFile', () => {
  it('returns file path when the .cls file is found in the root', () => {
    mockReaddirSync.mockReturnValue(['MyClass.cls', 'OtherClass.cls'] as any);
    mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
    const result = findClsFile('/classes', 'MyClass');
    expect(result).toContain('MyClass.cls');
  });

  it('returns null when the file does not exist', () => {
    mockReaddirSync.mockReturnValue(['Other.cls'] as any);
    mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
    const result = findClsFile('/classes', 'Missing');
    expect(result).toBeNull();
  });

  it('searches recursively into subdirectories', () => {
    mockReaddirSync
      .mockReturnValueOnce(['subdir'] as any)
      .mockReturnValueOnce(['MyClass.cls'] as any);
    mockStatSync
      .mockReturnValueOnce({ isDirectory: () => true } as any)
      .mockReturnValueOnce({ isDirectory: () => false } as any);
    const result = findClsFile('/classes', 'MyClass');
    expect(result).toContain('subdir');
    expect(result).toContain('MyClass.cls');
  });

  it('returns null and does not throw on unreadable directories', () => {
    mockReaddirSync.mockImplementation(() => { throw new Error('EACCES'); });
    expect(findClsFile('/restricted', 'MyClass')).toBeNull();
  });
});

// ── Command.run ────────────────────────────────────────────────────────────

describe('run — file discovery', () => {
  it('reads the .cls file when found', async () => {
    setupFoundFile();
    await makeInstance().run();
    expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('MyClass.cls'), 'utf-8');
  });

  it('skips class and logs error when .cls file is not found', async () => {
    mockReaddirSync.mockReturnValue([] as any);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await makeInstance({ apexClass: ['Missing'] }).run();
    expect(mockWriteFile).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('run — reflect', () => {
  it('passes file source to reflect()', async () => {
    setupFoundFile();
    mockReadFileSync.mockReturnValue('public class MyClass { public Id accountId; }' as any);
    await makeInstance().run();
    expect(mockReflect).toHaveBeenCalledWith('public class MyClass { public Id accountId; }');
  });

  it('skips class and logs error when reflect() returns a parse error', async () => {
    setupFoundFile();
    mockReflect.mockReturnValue({ error: { message: 'Unexpected token' } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await makeInstance().run();
    expect(mockWriteFile).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('skips class when typeMirror is not a class (e.g. enum)', async () => {
    setupFoundFile();
    mockReflect.mockReturnValue({ typeMirror: { ...MOCK_CLASS_MIRROR, type_name: 'enum' as any } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await makeInstance().run();
    expect(mockWriteFile).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('run — output', () => {
  it('writes a .d.ts file per class', async () => {
    setupFoundFile();
    await makeInstance().run();
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [path] = mockWriteFile.mock.calls[0]!;
    expect(path).toMatch(/MyClass\.d\.ts$/);
  });

  it('uses the outputDir in the written path', async () => {
    setupFoundFile();
    await makeInstance({ outputDir: './my-types' }).run();
    expect(mockWriteFile.mock.calls[0]![0]).toContain('my-types');
  });

  it('prepends a generated header to the output', async () => {
    setupFoundFile();
    await makeInstance().run();
    const content = mockWriteFile.mock.calls[0]![1] as string;
    expect(content).toContain('Generated from Apex: MyClass.cls');
  });

  it('passes content through format() before writing', async () => {
    setupFoundFile();
    await makeInstance().run();
    expect(mockFormat).toHaveBeenCalledTimes(1);
  });

  it('handles multiple classes writing one file each', async () => {
    mockReaddirSync.mockImplementation((dir) => {
      if (String(dir).includes('project')) return ['AccountService.cls', 'ContactService.cls'] as any;
      return [] as any;
    });
    mockStatSync.mockReturnValue({ isDirectory: () => false } as any);
    mockReflect.mockReturnValue({ typeMirror: { ...MOCK_CLASS_MIRROR } });
    await makeInstance({ apexClass: ['AccountService', 'ContactService'] }).run();
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });

  it('generated content includes mapped TypeScript types', async () => {
    setupFoundFile();
    await makeInstance().run();
    const content = mockWriteFile.mock.calls[0]![1] as string;
    // Id → string from MOCK_CLASS_MIRROR.properties[0]
    expect(content).toContain('accountId: string;');
  });
});

describe('run — options forwarding', () => {
  it('passes auraEnabledOnly to the generator (only @AuraEnabled members emitted)', async () => {
    const auraAnnotation = { name: 'auraenabled', rawDeclaration: '@AuraEnabled', type: 'marker' };
    const mirrorWithMixed = {
      ...MOCK_CLASS_MIRROR,
      properties: [
        { name: 'visible', access_modifier: 'public', annotations: [auraAnnotation], memberModifiers: [], typeReference: { type: 'String', rawDeclaration: 'String' } },
        { name: 'hidden', access_modifier: 'public', annotations: [], memberModifiers: [], typeReference: { type: 'Integer', rawDeclaration: 'Integer' } },
      ],
    };
    mockReflect.mockReturnValue({ typeMirror: mirrorWithMixed });
    setupFoundFile();
    await makeInstance({ auraEnabledOnly: true }).run();
    const content = mockWriteFile.mock.calls[0]![1] as string;
    expect(content).toContain('visible: string;');
    expect(content).not.toContain('hidden');
  });

  it('excludes methods when includeMethods is false', async () => {
    const mirrorWithMethod = {
      ...MOCK_CLASS_MIRROR,
      methods: [{ name: 'execute', access_modifier: 'public', annotations: [], memberModifiers: [], parameters: [], typeReference: { type: 'void', rawDeclaration: 'void' } }],
    };
    mockReflect.mockReturnValue({ typeMirror: mirrorWithMethod });
    setupFoundFile();
    await makeInstance({ includeMethods: false }).run();
    const content = mockWriteFile.mock.calls[0]![1] as string;
    expect(content).not.toContain('execute');
  });
});

// ── Org fetch ──────────────────────────────────────────────────────────────

describe('run — org fetch (--username)', () => {
  it('calls getConnection with the provided username', async () => {
    await makeInstance({ username: 'myorg' }).run();
    expect(mockGetConnection).toHaveBeenCalledWith('myorg');
  });

  it('does not read any local file when username is set', async () => {
    await makeInstance({ username: 'myorg' }).run();
    expect(mockReadFileSync).not.toHaveBeenCalled();
    expect(mockReaddirSync).not.toHaveBeenCalled();
  });

  it('queries ApexClass via the Tooling API with the correct class names', async () => {
    const conn = makeOrgConn([{ Name: 'MyClass', Body: 'public class MyClass {}' }]);
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance({ username: 'myorg', apexClass: ['MyClass'] }).run();
    expect(conn.tooling.query).toHaveBeenCalledWith(
      expect.stringContaining("Name IN ('MyClass')"),
    );
    expect(conn.tooling.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM ApexClass'),
    );
  });

  it('queries multiple class names in a single Tooling API call', async () => {
    const conn = makeOrgConn([
      { Name: 'AccountService', Body: 'public class AccountService {}' },
      { Name: 'ContactService', Body: 'public class ContactService {}' },
    ]);
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance({ username: 'myorg', apexClass: ['AccountService', 'ContactService'] }).run();
    expect(conn.tooling.query).toHaveBeenCalledTimes(1);
    const [soql] = conn.tooling.query.mock.calls[0]!;
    expect(soql).toContain("'AccountService'");
    expect(soql).toContain("'ContactService'");
  });

  it('passes the fetched class body to reflect()', async () => {
    const body = 'public class MyClass { public String name; }';
    mockGetConnection.mockResolvedValue(makeOrgConn([{ Name: 'MyClass', Body: body }]) as any);
    await makeInstance({ username: 'myorg' }).run();
    expect(mockReflect).toHaveBeenCalledWith(body);
  });

  it('writes a .d.ts file for the fetched class', async () => {
    await makeInstance({ username: 'myorg' }).run();
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(mockWriteFile.mock.calls[0]![0]).toMatch(/MyClass\.d\.ts$/);
  });

  it('logs an error and skips when a requested class is not found in the org', async () => {
    mockGetConnection.mockResolvedValue(makeOrgConn([]) as any);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await makeInstance({ username: 'myorg', apexClass: ['Missing'] }).run();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Missing'));
    spy.mockRestore();
  });

  it('writes one file per class found in the org', async () => {
    const conn = makeOrgConn([
      { Name: 'ClassA', Body: 'public class ClassA {}' },
      { Name: 'ClassB', Body: 'public class ClassB {}' },
    ]);
    mockGetConnection.mockResolvedValue(conn as any);
    mockReflect.mockReturnValue({ typeMirror: MOCK_CLASS_MIRROR });
    await makeInstance({ username: 'myorg', apexClass: ['ClassA', 'ClassB'] }).run();
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });

  it('still skips on parse error even when source came from the org', async () => {
    mockReflect.mockReturnValue({ error: { message: 'syntax error' } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await makeInstance({ username: 'myorg' }).run();
    expect(mockWriteFile).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
