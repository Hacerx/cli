import { describe, it, expect, vi, beforeEach } from 'vitest';
import GenerateAdmin from './generate-admin.js';

vi.mock('../../../lib/sf.js', () => ({
  getConnection: vi.fn(),
  getAllPermissionableSobjects: vi.fn(),
  getAllPermissionableFields: vi.fn(),
}));

vi.mock('../../../lib/files.js', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import {
  getConnection,
  getAllPermissionableSobjects,
  getAllPermissionableFields,
} from '../../../lib/sf.js';
import { writeFile } from '../../../lib/files.js';

const mockGetConnection = vi.mocked(getConnection);
const mockGetAllSobjects = vi.mocked(getAllPermissionableSobjects);
const mockGetAllFields = vi.mocked(getAllPermissionableFields);
const mockWriteFile = vi.mocked(writeFile);

const MOCK_CONN = {} as Awaited<ReturnType<typeof getConnection>>;

const MOCK_SOBJECTS = ['Account', 'Contact', 'Opportunity'];
const MOCK_FIELDS = [
  { field: 'Account.Name', editable: true },
  { field: 'Contact.Email', editable: false },
];

function makeInstance(username: string, outputDir = './'): GenerateAdmin {
  const instance = new GenerateAdmin();
  instance.options = { username, outputDir } as any;
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConnection.mockResolvedValue(MOCK_CONN);
  mockGetAllSobjects.mockResolvedValue(MOCK_SOBJECTS);
  mockGetAllFields.mockResolvedValue(MOCK_FIELDS as any);
});

describe('GenerateAdmin', () => {
  it('calls getConnection with the provided username', async () => {
    await makeInstance('test@example.com').run();
    expect(mockGetConnection).toHaveBeenCalledWith('test@example.com');
  });

  it('fetches SObjects and fields using the connection returned', async () => {
    await makeInstance('test@example.com').run();
    expect(mockGetAllSobjects).toHaveBeenCalledWith(MOCK_CONN);
    expect(mockGetAllFields).toHaveBeenCalledWith(MOCK_CONN);
  });

  it('generates valid XML with a PermissionSet root element', async () => {
    await makeInstance('test@example.com').run();
    const xml: string = mockWriteFile.mock.calls[0][1] as string;
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">');
    expect(xml).toContain('</PermissionSet>');
  });

  it('generates objectPermissions for each SObject with full access', async () => {
    await makeInstance('test@example.com').run();
    const xml: string = mockWriteFile.mock.calls[0][1] as string;

    for (const sobject of MOCK_SOBJECTS) {
      expect(xml).toContain(`<object>${sobject}</object>`);
    }
    expect(xml).toContain('<allowCreate>true</allowCreate>');
    expect(xml).toContain('<allowDelete>true</allowDelete>');
    expect(xml).toContain('<allowEdit>true</allowEdit>');
    expect(xml).toContain('<allowRead>true</allowRead>');
    expect(xml).toContain('<modifyAllRecords>true</modifyAllRecords>');
    expect(xml).toContain('<viewAllRecords>true</viewAllRecords>');
  });

  it('generates fieldPermissions for each field', async () => {
    await makeInstance('test@example.com').run();
    const xml: string = mockWriteFile.mock.calls[0][1] as string;

    expect(xml).toContain('<field>Account.Name</field>');
    expect(xml).toContain('<editable>true</editable>');
    expect(xml).toContain('<field>Contact.Email</field>');
    expect(xml).toContain('<editable>false</editable>');
    expect(xml).toContain('<readable>true</readable>');
  });

  it('writes to AdminFullAccess.permissionset-meta.xml in the output dir', async () => {
    await makeInstance('test@example.com', './output/').run();
    const filePath: string = mockWriteFile.mock.calls[0][0] as string;
    expect(filePath).toContain('AdminFullAccess.permissionset-meta.xml');
    expect(filePath).toContain('output');
  });

  it('uses default output dir "./" when not specified', async () => {
    await makeInstance('test@example.com').run();
    const filePath: string = mockWriteFile.mock.calls[0][0] as string;
    expect(filePath).toContain('AdminFullAccess.permissionset-meta.xml');
  });

  it('does not throw when getConnection rejects — logs the error', async () => {
    mockGetConnection.mockRejectedValue(new Error('auth failed'));
    await expect(makeInstance('bad@user.com').run()).resolves.not.toThrow();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
