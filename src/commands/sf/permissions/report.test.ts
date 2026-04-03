import { describe, it, expect, vi, beforeEach } from 'vitest';
import PermissionsReport from './report.js';

vi.mock('../../../lib/sf.js', () => ({
  getConnection: vi.fn(),
}));

vi.mock('../../../lib/files.js', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { getConnection } from '../../../lib/sf.js';
import { writeFile } from '../../../lib/files.js';

const mockGetConnection = vi.mocked(getConnection);
const mockWriteFile = vi.mocked(writeFile);

// ── Fixture data ───────────────────────────────────────────────────────────

const MOCK_PS = [
  { Id: 'ps001', Name: 'Sales_PS', Label: 'Sales', IsOwnedByProfile: false, Description: 'Sales team PS' },
  { Id: 'ps002', Name: 'Admin', Label: 'System Administrator', IsOwnedByProfile: true, Description: null },
];

const MOCK_OBJ_PERMS = [
  { ParentId: 'ps001', SobjectType: 'Account', PermissionsRead: true, PermissionsCreate: true, PermissionsEdit: true, PermissionsDelete: false, PermissionsViewAllRecords: false, PermissionsModifyAllRecords: false },
  { ParentId: 'ps002', SobjectType: 'Contact', PermissionsRead: true, PermissionsCreate: true, PermissionsEdit: true, PermissionsDelete: true, PermissionsViewAllRecords: true, PermissionsModifyAllRecords: true },
];

const MOCK_FIELD_PERMS = [
  { ParentId: 'ps001', SobjectType: 'Account', Field: 'Account.Revenue__c', PermissionsRead: true, PermissionsEdit: false },
  { ParentId: 'ps002', SobjectType: 'Contact', Field: 'Contact.Phone', PermissionsRead: true, PermissionsEdit: true },
];

function makeMockConn() {
  const query = vi.fn().mockImplementation((soql: string) => {
    if (soql.includes('FROM PermissionSet'))
      return Promise.resolve({ done: true, totalSize: MOCK_PS.length, records: MOCK_PS });
    if (soql.includes('FROM ObjectPermissions'))
      return Promise.resolve({ done: true, totalSize: MOCK_OBJ_PERMS.length, records: MOCK_OBJ_PERMS });
    if (soql.includes('FROM FieldPermissions'))
      return Promise.resolve({ done: true, totalSize: MOCK_FIELD_PERMS.length, records: MOCK_FIELD_PERMS });
    return Promise.resolve({ done: true, totalSize: 0, records: [] });
  });
  return { query, queryMore: vi.fn() };
}

type InstanceOptions = {
  username?: string;
  format?: string[];
  output?: string;
  name?: string[];
  object?: string[];
  type?: string;
};

function makeInstance(opts: InstanceOptions = {}): PermissionsReport {
  const instance = new PermissionsReport();
  instance.options = {
    username: opts.username ?? 'dev',
    format: opts.format ?? ['html'],
    output: opts.output ?? '.',
    name: opts.name,
    object: opts.object,
    type: opts.type ?? 'all',
  } as any;
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConnection.mockResolvedValue(makeMockConn() as any);
});

// ── Connection ─────────────────────────────────────────────────────────────

describe('connection', () => {
  it('calls getConnection with the provided username', async () => {
    await makeInstance({ username: 'myorg' }).run();
    expect(mockGetConnection).toHaveBeenCalledWith('myorg');
  });
});

// ── SOQL queries ───────────────────────────────────────────────────────────

describe('SOQL queries', () => {
  it('queries PermissionSet without extra WHERE when no filters set', async () => {
    const conn = makeMockConn();
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance().run();
    const psCall = conn.query.mock.calls.find(([soql]) => soql.includes('FROM PermissionSet'));
    expect(psCall).toBeDefined();
    expect(psCall![0]).not.toContain('WHERE');
  });

  it('adds IsOwnedByProfile = false when type is permissionset', async () => {
    const conn = makeMockConn();
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance({ type: 'permissionset' }).run();
    const psCall = conn.query.mock.calls.find(([soql]) => soql.includes('FROM PermissionSet'));
    expect(psCall![0]).toContain('IsOwnedByProfile = false');
  });

  it('adds IsOwnedByProfile = true when type is profile', async () => {
    const conn = makeMockConn();
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance({ type: 'profile' }).run();
    const psCall = conn.query.mock.calls.find(([soql]) => soql.includes('FROM PermissionSet'));
    expect(psCall![0]).toContain('IsOwnedByProfile = true');
  });

  it('adds Name IN clause when name filter is provided', async () => {
    const conn = makeMockConn();
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance({ name: ['Sales_PS', 'Dev_PS'] }).run();
    const psCall = conn.query.mock.calls.find(([soql]) => soql.includes('FROM PermissionSet'));
    expect(psCall![0]).toContain("Name IN ('Sales_PS','Dev_PS')");
  });

  it('adds SobjectType IN clause to ObjectPermissions query when object filter is provided', async () => {
    const conn = makeMockConn();
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance({ object: ['Account', 'Contact'] }).run();
    const objCall = conn.query.mock.calls.find(([soql]) => soql.includes('FROM ObjectPermissions'));
    expect(objCall![0]).toContain("SobjectType IN ('Account','Contact')");
  });

  it('adds SobjectType IN clause to FieldPermissions query when object filter is provided', async () => {
    const conn = makeMockConn();
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance({ object: ['Account'] }).run();
    const fieldCall = conn.query.mock.calls.find(([soql]) => soql.includes('FROM FieldPermissions'));
    expect(fieldCall![0]).toContain("SobjectType IN ('Account')");
  });

  it('includes found PS IDs in the ObjectPermissions ParentId IN clause', async () => {
    const conn = makeMockConn();
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance().run();
    const objCall = conn.query.mock.calls.find(([soql]) => soql.includes('FROM ObjectPermissions'));
    expect(objCall![0]).toContain("'ps001'");
    expect(objCall![0]).toContain("'ps002'");
  });
});

// ── Pagination ─────────────────────────────────────────────────────────────

describe('pagination', () => {
  it('calls queryMore when initial query is not done', async () => {
    const extraPS = [{ Id: 'ps003', Name: 'Extra_PS', Label: 'Extra', IsOwnedByProfile: false, Description: null }];
    const conn = {
      query: vi.fn().mockImplementation((soql: string) => {
        if (soql.includes('FROM PermissionSet'))
          return Promise.resolve({ done: false, nextRecordsUrl: '/next', records: MOCK_PS });
        return Promise.resolve({ done: true, records: [] });
      }),
      queryMore: vi.fn().mockResolvedValue({ done: true, records: extraPS }),
    };
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance().run();
    expect(conn.queryMore).toHaveBeenCalledWith('/next');
  });
});

// ── No results ─────────────────────────────────────────────────────────────

describe('no results', () => {
  it('does not write any files when no permission sets match filters', async () => {
    const conn = {
      query: vi.fn().mockResolvedValue({ done: true, totalSize: 0, records: [] }),
      queryMore: vi.fn(),
    };
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance({ name: ['NonExistent'] }).run();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

// ── HTML output ────────────────────────────────────────────────────────────

describe('HTML output', () => {
  it('writes an HTML file by default', async () => {
    await makeInstance().run();
    const htmlCall = mockWriteFile.mock.calls.find(([path]) => (path as string).endsWith('.html'));
    expect(htmlCall).toBeDefined();
  });

  it('HTML file path uses the output directory', async () => {
    await makeInstance({ output: './reports' }).run();
    const htmlCall = mockWriteFile.mock.calls.find(([path]) => (path as string).endsWith('.html'));
    expect(htmlCall![0]).toContain('reports');
  });

  it('HTML contains permission set badge for non-profile entries', async () => {
    await makeInstance().run();
    const html = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.html'))![1] as string;
    expect(html).toContain('badge-ps');
    expect(html).toContain('Permission Set');
  });

  it('HTML contains profile badge for profile entries', async () => {
    await makeInstance().run();
    const html = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.html'))![1] as string;
    expect(html).toContain('badge-profile');
    expect(html).toContain('Profile');
  });

  it('HTML contains SObject names from object permissions', async () => {
    await makeInstance().run();
    const html = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.html'))![1] as string;
    expect(html).toContain('Account');
    expect(html).toContain('Contact');
  });

  it('HTML strips the object prefix from field names', async () => {
    await makeInstance().run();
    const html = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.html'))![1] as string;
    expect(html).toContain('Revenue__c');
    expect(html).not.toContain('Account.Revenue__c');
  });

  it('HTML uses tick-danger class for Delete permission', async () => {
    await makeInstance().run();
    const html = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.html'))![1] as string;
    expect(html).toContain('tick-danger');
  });

  it('HTML summary cards show correct counts', async () => {
    await makeInstance().run();
    const html = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.html'))![1] as string;
    expect(html).toContain('>1<'); // 1 profile (Admin)
    expect(html).toContain('>2<'); // 2 obj perms, 2 field perms
  });

  it('HTML includes the org alias in the header', async () => {
    await makeInstance({ username: 'prod-org' }).run();
    const html = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.html'))![1] as string;
    expect(html).toContain('prod-org');
  });

  it('HTML includes client-side filter script', async () => {
    await makeInstance().run();
    const html = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.html'))![1] as string;
    expect(html).toContain('applyFilters');
    expect(html).toContain('switchTab');
  });
});

// ── JSON output ────────────────────────────────────────────────────────────

describe('JSON output', () => {
  it('writes a JSON file when format includes json', async () => {
    await makeInstance({ format: ['json'] }).run();
    const jsonCall = mockWriteFile.mock.calls.find(([path]) => (path as string).endsWith('.json'));
    expect(jsonCall).toBeDefined();
  });

  it('JSON is valid and has the expected top-level keys', async () => {
    await makeInstance({ format: ['json'] }).run();
    const raw = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.json'))![1] as string;
    const data = JSON.parse(raw);
    expect(data).toHaveProperty('generatedAt');
    expect(data).toHaveProperty('orgAlias', 'dev');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('entries');
  });

  it('JSON summary counts match fixture data', async () => {
    await makeInstance({ format: ['json'] }).run();
    const raw = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.json'))![1] as string;
    const { summary } = JSON.parse(raw);
    expect(summary.profiles).toBe(1);
    expect(summary.permissionSets).toBe(1);
    expect(summary.objectPerms).toBe(2);
    expect(summary.fieldPerms).toBe(2);
  });

  it('JSON entries contain objectPermissions and fieldPermissions arrays', async () => {
    await makeInstance({ format: ['json'] }).run();
    const raw = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.json'))![1] as string;
    const { entries } = JSON.parse(raw);
    expect(entries[0].objectPermissions).toBeInstanceOf(Array);
    expect(entries[0].fieldPermissions).toBeInstanceOf(Array);
  });

  it('JSON entry correctly maps permission flags', async () => {
    await makeInstance({ format: ['json'] }).run();
    const raw = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.json'))![1] as string;
    const { entries } = JSON.parse(raw);
    const salesEntry = entries.find((e: { name: string }) => e.name === 'Sales_PS');
    const accountPerm = salesEntry.objectPermissions.find((op: { sobject: string }) => op.sobject === 'Account');
    expect(accountPerm.read).toBe(true);
    expect(accountPerm.del).toBe(false);
  });

  it('JSON field entry strips object prefix from field name', async () => {
    await makeInstance({ format: ['json'] }).run();
    const raw = mockWriteFile.mock.calls.find(([p]) => (p as string).endsWith('.json'))![1] as string;
    const { entries } = JSON.parse(raw);
    const salesEntry = entries.find((e: { name: string }) => e.name === 'Sales_PS');
    expect(salesEntry.fieldPermissions[0].field).toBe('Revenue__c');
  });
});

// ── CSV output ─────────────────────────────────────────────────────────────

describe('CSV output', () => {
  it('writes two CSV files when format includes csv', async () => {
    await makeInstance({ format: ['csv'] }).run();
    const csvCalls = mockWriteFile.mock.calls.filter(([path]) => (path as string).endsWith('.csv'));
    expect(csvCalls).toHaveLength(2);
  });

  it('object permissions CSV has correct headers', async () => {
    await makeInstance({ format: ['csv'] }).run();
    const objCsv = mockWriteFile.mock.calls.find(([p]) => (p as string).includes('object-perms'))![1] as string;
    expect(objCsv.split('\n')[0]).toBe('Type,Name,Label,SObject,Read,Create,Edit,Delete,ViewAll,ModifyAll');
  });

  it('field permissions CSV has correct headers', async () => {
    await makeInstance({ format: ['csv'] }).run();
    const fieldCsv = mockWriteFile.mock.calls.find(([p]) => (p as string).includes('field-perms'))![1] as string;
    expect(fieldCsv.split('\n')[0]).toBe('Type,Name,Label,SObject,Field,Read,Edit');
  });

  it('object permissions CSV contains data rows for each permission', async () => {
    await makeInstance({ format: ['csv'] }).run();
    const objCsv = mockWriteFile.mock.calls.find(([p]) => (p as string).includes('object-perms'))![1] as string;
    expect(objCsv).toContain('PermissionSet,Sales_PS,Sales,Account');
    expect(objCsv).toContain('Profile,Admin,System Administrator,Contact');
  });

  it('field permissions CSV strips object prefix from field name', async () => {
    await makeInstance({ format: ['csv'] }).run();
    const fieldCsv = mockWriteFile.mock.calls.find(([p]) => (p as string).includes('field-perms'))![1] as string;
    expect(fieldCsv).toContain('Revenue__c');
    expect(fieldCsv).not.toContain('Account.Revenue__c');
  });

  it('CSV values with commas are properly quoted', async () => {
    const commaPS = { Id: 'x1', Name: 'PS,comma', Label: 'PS with, comma', IsOwnedByProfile: false, Description: null };
    const commaPerm = { ParentId: 'x1', SobjectType: 'Account', PermissionsRead: true, PermissionsCreate: false, PermissionsEdit: false, PermissionsDelete: false, PermissionsViewAllRecords: false, PermissionsModifyAllRecords: false };
    const conn = {
      query: vi.fn().mockImplementation((soql: string) => {
        if (soql.includes('FROM PermissionSet'))
          return Promise.resolve({ done: true, records: [commaPS] });
        if (soql.includes('FROM ObjectPermissions'))
          return Promise.resolve({ done: true, records: [commaPerm] });
        return Promise.resolve({ done: true, records: [] });
      }),
      queryMore: vi.fn(),
    };
    mockGetConnection.mockResolvedValue(conn as any);
    await makeInstance({ format: ['csv'] }).run();
    const objCsv = mockWriteFile.mock.calls.find(([p]) => (p as string).includes('object-perms'))![1] as string;
    expect(objCsv).toContain('"PS,comma"');
    expect(objCsv).toContain('"PS with, comma"');
  });
});

// ── Multiple formats ───────────────────────────────────────────────────────

describe('multiple formats', () => {
  it('writes all three outputs when format is [json, csv, html]', async () => {
    await makeInstance({ format: ['json', 'csv', 'html'] }).run();
    const paths = mockWriteFile.mock.calls.map(([p]) => p as string);
    expect(paths.some(p => p.endsWith('.json'))).toBe(true);
    expect(paths.some(p => p.endsWith('.html'))).toBe(true);
    expect(paths.filter(p => p.endsWith('.csv'))).toHaveLength(2);
  });
});
