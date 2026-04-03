import { CommandBase, FlagType } from '../../../lib/CommandBase.js';
import type { Connection } from '@jsforce/jsforce-node';

// ── Salesforce record shapes ───────────────────────────────────────────────

type PSRecord = {
  Id: string;
  Name: string;
  Label: string;
  IsOwnedByProfile: boolean;
  Description: string | null;
};

type ObjPermRecord = {
  ParentId: string;
  SobjectType: string;
  PermissionsRead: boolean;
  PermissionsCreate: boolean;
  PermissionsEdit: boolean;
  PermissionsDelete: boolean;
  PermissionsViewAllRecords: boolean;
  PermissionsModifyAllRecords: boolean;
};

type FieldPermRecord = {
  ParentId: string;
  SobjectType: string;
  Field: string;
  PermissionsRead: boolean;
  PermissionsEdit: boolean;
};

// ── Report data model ──────────────────────────────────────────────────────

type ObjectPermission = {
  sobject: string;
  read: boolean;
  create: boolean;
  edit: boolean;
  del: boolean;
  viewAll: boolean;
  modifyAll: boolean;
};

type FieldPermission = {
  sobject: string;
  field: string;
  read: boolean;
  edit: boolean;
};

type ReportEntry = {
  id: string;
  name: string;
  label: string;
  type: 'Profile' | 'PermissionSet';
  description: string;
  objectPermissions: ObjectPermission[];
  fieldPermissions: FieldPermission[];
};

type ReportData = {
  generatedAt: string;
  orgAlias: string;
  summary: { profiles: number; permissionSets: number; objectPerms: number; fieldPerms: number };
  entries: ReportEntry[];
};

// ── Flags ──────────────────────────────────────────────────────────────────

const flags = {
  username: FlagType.sfOrg({
    char: 'u',
    description: 'Org alias or username to connect to',
    required: true,
  }),
  format: FlagType.array<string>({
    char: 'f',
    description: 'Output format(s): json, csv, html',
    defaultValue: ['html'],
  }),
  output: FlagType.string({
    char: 'o',
    description: 'Output directory for generated files',
    defaultValue: '.',
  }),
  name: FlagType.array<string>({
    char: 'n',
    description: 'Filter by permission set or profile name(s)',
  }),
  object: FlagType.array<string>({
    description: 'Filter by SObject API name(s)',
  }),
  type: FlagType.string({
    char: 't',
    description: 'Type filter: all | profile | permissionset',
    defaultValue: 'all',
  }),
} as const;

// ── Command ────────────────────────────────────────────────────────────────

export default class PermissionsReport extends CommandBase<typeof flags> {
  description = 'Generate a visual permissions report for Salesforce Profiles and Permission Sets';
  flags = flags;
  examples = [
    { description: 'HTML report for all profiles and permission sets', command: 'hacerx sf permissions report -u myorg' },
    { description: 'Export JSON and CSV', command: 'hacerx sf permissions report -u myorg -f json csv' },
    { description: 'Single permission set report', command: 'hacerx sf permissions report -u myorg -n Sales_PS' },
    { description: 'Filter by specific objects', command: 'hacerx sf permissions report -u myorg --object Account Contact Opportunity' },
    { description: 'Profiles only, saved to a custom folder', command: 'hacerx sf permissions report -u myorg -t profile -o ./reports' },
    { description: 'Permission sets only, all formats', command: 'hacerx sf permissions report -u myorg -t permissionset -f json csv html' },
  ];

  async run() {
    const { getConnection } = await import('../../../lib/sf.js');
    const { writeFile } = await import('../../../lib/files.js');
    const { join } = await import('node:path');

    const { username, format, output, name: nameFilter, object: objectFilter, type: typeFilter } = this.options;

    console.log(`Connecting to ${username}...`);
    const conn = await getConnection(username);

    // ── Permission sets / profiles ─────────────────────────────────────────
    const psConds: string[] = [];
    if (typeFilter === 'permissionset') psConds.push('IsOwnedByProfile = false');
    else if (typeFilter === 'profile') psConds.push('IsOwnedByProfile = true');
    if (nameFilter?.length) psConds.push(`Name IN (${nameFilter.map(n => `'${n}'`).join(',')})`);
    const psWhere = psConds.length ? ` WHERE ${psConds.join(' AND ')}` : '';

    console.log('Fetching permission sets and profiles...');
    const permSets = await queryAll<PSRecord>(conn,
      `SELECT Id, Name, Label, IsOwnedByProfile, Description FROM PermissionSet${psWhere} ORDER BY IsOwnedByProfile DESC, Label`);

    if (permSets.length === 0) {
      console.log('No results found matching the given filters.');
      return;
    }
    console.log(`Found ${permSets.length} permission set(s)/profile(s). Fetching permissions...`);

    // ── Object & field permissions (batched to respect IN-clause limits) ───
    const allObjPerms: ObjPermRecord[] = [];
    const allFieldPerms: FieldPermRecord[] = [];

    for (const batch of chunk(permSets.map(p => p.Id), 500)) {
      const inClause = batch.map(id => `'${id}'`).join(',');
      const objConds = [`ParentId IN (${inClause})`];
      if (objectFilter?.length) objConds.push(`SobjectType IN (${objectFilter.map(o => `'${o}'`).join(',')})`);
      const where = objConds.join(' AND ');

      const [obj, field] = await Promise.all([
        queryAll<ObjPermRecord>(conn,
          `SELECT ParentId, SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ${where} ORDER BY SobjectType`),
        queryAll<FieldPermRecord>(conn,
          `SELECT ParentId, SobjectType, Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ${where} ORDER BY SobjectType, Field`),
      ]);
      allObjPerms.push(...obj);
      allFieldPerms.push(...field);
    }

    // ── Build report & write files ─────────────────────────────────────────
    const data = buildReport(username, permSets, allObjPerms, allFieldPerms);
    const formats = (format ?? ['html']).map(f => f.toLowerCase());
    const outDir = output ?? '.';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const base = `permissions-report-${stamp}`;
    const written: string[] = [];

    if (formats.includes('json')) {
      const p = join(outDir, `${base}.json`);
      await writeFile(p, JSON.stringify(data, null, 2));
      written.push(p);
    }
    if (formats.includes('csv')) {
      const objPath = join(outDir, `${base}-object-perms.csv`);
      const fieldPath = join(outDir, `${base}-field-perms.csv`);
      await writeFile(objPath, toObjectsCsv(data));
      await writeFile(fieldPath, toFieldsCsv(data));
      written.push(objPath, fieldPath);
    }
    if (formats.includes('html')) {
      const p = join(outDir, `${base}.html`);
      await writeFile(p, toHtml(data));
      written.push(p);
    }

    const { summary: s } = data;
    console.log(`\nDone — ${s.profiles} profile(s), ${s.permissionSets} permission set(s), ${s.objectPerms} obj perms, ${s.fieldPerms} field perms`);
    for (const p of written) console.log(`  ${p}`);
  }
}

// ── Query helpers ──────────────────────────────────────────────────────────

async function queryAll<T extends Record<string, unknown>>(conn: Connection, soql: string): Promise<T[]> {
  const records: T[] = [];
  let result = await conn.query<T>(soql);
  records.push(...result.records);
  while (!result.done && result.nextRecordsUrl) {
    result = await conn.queryMore<T>(result.nextRecordsUrl);
    records.push(...result.records);
  }
  return records;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Report builder ─────────────────────────────────────────────────────────

function buildReport(orgAlias: string, permSets: PSRecord[], objPerms: ObjPermRecord[], fieldPerms: FieldPermRecord[]): ReportData {
  const byId = new Map<string, { obj: ObjPermRecord[]; field: FieldPermRecord[] }>();
  for (const ps of permSets) byId.set(ps.Id, { obj: [], field: [] });
  for (const op of objPerms) byId.get(op.ParentId)?.obj.push(op);
  for (const fp of fieldPerms) byId.get(fp.ParentId)?.field.push(fp);

  const entries: ReportEntry[] = permSets.map(ps => {
    const { obj, field } = byId.get(ps.Id)!;
    return {
      id: ps.Id,
      name: ps.Name,
      label: ps.Label,
      type: ps.IsOwnedByProfile ? 'Profile' : 'PermissionSet',
      description: ps.Description ?? '',
      objectPermissions: obj.map(o => ({
        sobject: o.SobjectType,
        read: o.PermissionsRead,
        create: o.PermissionsCreate,
        edit: o.PermissionsEdit,
        del: o.PermissionsDelete,
        viewAll: o.PermissionsViewAllRecords,
        modifyAll: o.PermissionsModifyAllRecords,
      })),
      fieldPermissions: field.map(f => ({
        sobject: f.SobjectType,
        field: f.Field.includes('.') ? f.Field.split('.')[1]! : f.Field,
        read: f.PermissionsRead,
        edit: f.PermissionsEdit,
      })),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    orgAlias,
    summary: {
      profiles: entries.filter(e => e.type === 'Profile').length,
      permissionSets: entries.filter(e => e.type === 'PermissionSet').length,
      objectPerms: objPerms.length,
      fieldPerms: fieldPerms.length,
    },
    entries,
  };
}

// ── CSV ────────────────────────────────────────────────────────────────────

function csvEsc(v: string | boolean | number): string {
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function toObjectsCsv(data: ReportData): string {
  const rows = ['Type,Name,Label,SObject,Read,Create,Edit,Delete,ViewAll,ModifyAll'];
  for (const e of data.entries)
    for (const op of e.objectPermissions)
      rows.push([e.type, e.name, e.label, op.sobject, op.read, op.create, op.edit, op.del, op.viewAll, op.modifyAll].map(csvEsc).join(','));
  return rows.join('\n');
}

function toFieldsCsv(data: ReportData): string {
  const rows = ['Type,Name,Label,SObject,Field,Read,Edit'];
  for (const e of data.entries)
    for (const fp of e.fieldPermissions)
      rows.push([e.type, e.name, e.label, fp.sobject, fp.field, fp.read, fp.edit].map(csvEsc).join(','));
  return rows.join('\n');
}

// ── HTML ───────────────────────────────────────────────────────────────────

function toHtml(data: ReportData): string {
  const { summary: s, entries, orgAlias, generatedAt } = data;
  const date = new Date(generatedAt).toLocaleString();

  const entryCards = entries.map(entry => {
    const badge = entry.type === 'Profile'
      ? `<span class="badge badge-profile">Profile</span>`
      : `<span class="badge badge-ps">Permission Set</span>`;

    // Group field perms by sobject
    const fieldsBySobj = new Map<string, FieldPermission[]>();
    for (const fp of entry.fieldPermissions) {
      if (!fieldsBySobj.has(fp.sobject)) fieldsBySobj.set(fp.sobject, []);
      fieldsBySobj.get(fp.sobject)!.push(fp);
    }

    const objTable = entry.objectPermissions.length === 0
      ? `<p class="empty-msg">No object permissions.</p>`
      : `<div class="table-wrap">
          <table class="perm-table">
            <thead><tr>
              <th>SObject</th>
              <th title="Read">R</th>
              <th title="Create">C</th>
              <th title="Edit">E</th>
              <th title="Delete">D</th>
              <th title="View All">VA</th>
              <th title="Modify All">MA</th>
            </tr></thead>
            <tbody>
              ${entry.objectPermissions.map(op => `
              <tr>
                <td class="obj-name">${op.sobject}</td>
                <td>${tick(op.read)}</td>
                <td>${tick(op.create)}</td>
                <td>${tick(op.edit)}</td>
                <td>${tickDanger(op.del)}</td>
                <td>${tickWarn(op.viewAll)}</td>
                <td>${tickDanger(op.modifyAll)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

    const fieldSection = fieldsBySobj.size === 0
      ? `<p class="empty-msg">No field permissions.</p>`
      : Array.from(fieldsBySobj.entries()).map(([sobj, fields]) => `
        <details class="field-group">
          <summary><strong>${sobj}</strong> <span class="count">${fields.length} field(s)</span></summary>
          <div class="table-wrap">
            <table class="perm-table field-table">
              <thead><tr><th>Field</th><th title="Read">R</th><th title="Edit">E</th></tr></thead>
              <tbody>
                ${fields.map(f => `<tr>
                  <td class="obj-name">${f.field}</td>
                  <td>${tick(f.read)}</td>
                  <td>${tick(f.edit)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </details>`).join('');

    const objCount = entry.objectPermissions.length;
    const fieldCount = entry.fieldPermissions.length;

    return `
    <div class="entry-card" data-type="${entry.type}" data-name="${entry.name.toLowerCase()} ${entry.label.toLowerCase()}">
      <div class="entry-header" onclick="this.parentElement.classList.toggle('open')">
        <div class="entry-title">
          ${badge}
          <span class="entry-label">${entry.label}</span>
          <span class="entry-name">${entry.name}</span>
        </div>
        <div class="entry-meta">
          <span class="meta-pill">${objCount} obj</span>
          <span class="meta-pill">${fieldCount} fields</span>
          <span class="chevron">▾</span>
        </div>
      </div>
      <div class="entry-body">
        ${entry.description ? `<p class="entry-desc">${entry.description}</p>` : ''}
        <div class="section-tabs">
          <button class="tab-btn active" onclick="switchTab(this, 'obj-${entry.id}')">Object Permissions</button>
          <button class="tab-btn" onclick="switchTab(this, 'field-${entry.id}')">Field Permissions</button>
        </div>
        <div id="obj-${entry.id}" class="tab-panel active">${objTable}</div>
        <div id="field-${entry.id}" class="tab-panel">${fieldSection}</div>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Permissions Report — ${orgAlias}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --blue: #0176d3; --blue-dark: #014486; --blue-light: #d8edff;
    --green: #2e844a; --green-bg: #eaf5ea;
    --red: #c23934; --red-bg: #fde8e8;
    --orange: #a96404; --orange-bg: #fef0c7;
    --gray: #706e6b; --gray-light: #f3f2f2; --gray-border: #dddbda;
    --text: #181818; --radius: 6px;
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f2f2; color: var(--text); font-size: 14px; }

  /* ── Header ── */
  .app-header { background: var(--blue-dark); color: #fff; padding: 20px 32px; }
  .app-header h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
  .app-header .subtitle { opacity: .8; font-size: 13px; }

  /* ── Summary cards ── */
  .summary { display: flex; gap: 16px; padding: 24px 32px 0; flex-wrap: wrap; }
  .card { background: #fff; border-radius: var(--radius); padding: 16px 20px; flex: 1; min-width: 140px; border: 1px solid var(--gray-border); box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .card-value { font-size: 28px; font-weight: 700; color: var(--blue); }
  .card-label { color: var(--gray); font-size: 12px; margin-top: 2px; text-transform: uppercase; letter-spacing: .5px; }

  /* ── Filters ── */
  .filters { display: flex; gap: 12px; padding: 20px 32px; flex-wrap: wrap; align-items: center; }
  .search-box { flex: 1; min-width: 220px; padding: 8px 12px; border: 1px solid var(--gray-border); border-radius: var(--radius); font-size: 14px; outline: none; }
  .search-box:focus { border-color: var(--blue); box-shadow: 0 0 0 2px var(--blue-light); }
  .filter-group { display: flex; border: 1px solid var(--gray-border); border-radius: var(--radius); overflow: hidden; }
  .filter-btn { padding: 7px 14px; background: #fff; border: none; cursor: pointer; font-size: 13px; color: var(--gray); transition: background .15s, color .15s; }
  .filter-btn:hover { background: var(--gray-light); }
  .filter-btn.active { background: var(--blue); color: #fff; font-weight: 600; }
  .results-count { color: var(--gray); font-size: 13px; }

  /* ── Entry cards ── */
  .entries { padding: 0 32px 32px; display: flex; flex-direction: column; gap: 10px; }
  .entry-card { background: #fff; border-radius: var(--radius); border: 1px solid var(--gray-border); box-shadow: 0 1px 3px rgba(0,0,0,.05); overflow: hidden; }
  .entry-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; cursor: pointer; user-select: none; transition: background .12s; }
  .entry-header:hover { background: var(--gray-light); }
  .entry-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .entry-label { font-weight: 600; font-size: 15px; }
  .entry-name { color: var(--gray); font-size: 12px; font-family: monospace; }
  .entry-meta { display: flex; align-items: center; gap: 8px; }
  .meta-pill { background: var(--gray-light); border-radius: 12px; padding: 2px 9px; font-size: 12px; color: var(--gray); white-space: nowrap; }
  .chevron { font-size: 18px; color: var(--gray); transition: transform .2s; }
  .entry-card.open .chevron { transform: rotate(180deg); }
  .entry-body { display: none; border-top: 1px solid var(--gray-border); padding: 0; }
  .entry-card.open .entry-body { display: block; }
  .entry-desc { padding: 12px 18px; background: #fafafa; color: var(--gray); font-size: 13px; border-bottom: 1px solid var(--gray-border); }

  /* ── Badges ── */
  .badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: .4px; white-space: nowrap; }
  .badge-profile { background: #fef0c7; color: #a96404; }
  .badge-ps { background: var(--blue-light); color: var(--blue-dark); }

  /* ── Tabs ── */
  .section-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--gray-border); padding: 0 18px; }
  .tab-btn { background: none; border: none; padding: 10px 16px; font-size: 13px; font-weight: 600; color: var(--gray); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color .15s, border-color .15s; }
  .tab-btn:hover { color: var(--blue); }
  .tab-btn.active { color: var(--blue); border-bottom-color: var(--blue); }
  .tab-panel { display: none; padding: 16px 18px; }
  .tab-panel.active { display: block; }

  /* ── Tables ── */
  .table-wrap { overflow-x: auto; border-radius: 4px; border: 1px solid var(--gray-border); }
  .perm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .perm-table th { background: var(--gray-light); padding: 8px 10px; text-align: center; font-size: 11px; font-weight: 700; color: var(--gray); text-transform: uppercase; letter-spacing: .4px; white-space: nowrap; border-bottom: 1px solid var(--gray-border); }
  .perm-table th:first-child { text-align: left; }
  .perm-table td { padding: 7px 10px; text-align: center; border-bottom: 1px solid #f0f0f0; }
  .perm-table td:first-child { text-align: left; }
  .perm-table tr:last-child td { border-bottom: none; }
  .perm-table tr:hover td { background: #fafbff; }
  .obj-name { font-family: monospace; font-size: 12px; white-space: nowrap; }

  /* ── Tick marks ── */
  .tick-yes { color: var(--green); font-weight: 700; font-size: 15px; }
  .tick-no { color: #c0bfbd; font-size: 14px; }
  .tick-warn { color: var(--orange); font-weight: 700; font-size: 15px; }
  .tick-danger { color: var(--red); font-weight: 700; font-size: 15px; }

  /* ── Field groups ── */
  .field-group { border: 1px solid var(--gray-border); border-radius: 4px; margin-bottom: 8px; }
  .field-group summary { padding: 9px 12px; cursor: pointer; font-size: 13px; list-style: none; display: flex; align-items: center; gap: 8px; user-select: none; }
  .field-group summary::-webkit-details-marker { display: none; }
  .field-group summary::before { content: '▸'; color: var(--gray); font-size: 12px; transition: transform .15s; display: inline-block; }
  .field-group[open] summary::before { transform: rotate(90deg); }
  .field-group .table-wrap { border-top: 1px solid var(--gray-border); border-radius: 0 0 4px 4px; border-left: none; border-right: none; border-bottom: none; }
  .field-table { font-size: 12px; }
  .count { color: var(--gray); font-size: 12px; font-weight: 400; }

  .empty-msg { color: var(--gray); font-style: italic; font-size: 13px; padding: 8px 0; }
  .hidden { display: none !important; }

  /* ── Footer ── */
  .app-footer { text-align: center; padding: 20px 32px; color: var(--gray); font-size: 12px; border-top: 1px solid var(--gray-border); margin-top: 8px; }
</style>
</head>
<body>

<header class="app-header">
  <h1>Permissions Report</h1>
  <div class="subtitle">Org: <strong>${orgAlias}</strong> &nbsp;·&nbsp; Generated: ${date}</div>
</header>

<div class="summary">
  <div class="card"><div class="card-value">${s.profiles}</div><div class="card-label">Profiles</div></div>
  <div class="card"><div class="card-value">${s.permissionSets}</div><div class="card-label">Permission Sets</div></div>
  <div class="card"><div class="card-value">${s.objectPerms}</div><div class="card-label">Object Permissions</div></div>
  <div class="card"><div class="card-value">${s.fieldPerms}</div><div class="card-label">Field Permissions</div></div>
</div>

<div class="filters">
  <input class="search-box" type="search" placeholder="Search by name…" oninput="applyFilters()" id="search">
  <div class="filter-group">
    <button class="filter-btn active" onclick="setType('all', this)">All</button>
    <button class="filter-btn" onclick="setType('Profile', this)">Profiles</button>
    <button class="filter-btn" onclick="setType('PermissionSet', this)">Permission Sets</button>
  </div>
  <span class="results-count" id="results-count">${entries.length} shown</span>
</div>

<div class="entries" id="entries">
${entryCards}
</div>

<footer class="app-footer">
  hacerx · sf permissions report · ${date}
</footer>

<script>
  let activeType = 'all';

  function setType(type, btn) {
    activeType = type;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
  }

  function applyFilters() {
    const q = document.getElementById('search').value.toLowerCase().trim();
    const cards = document.querySelectorAll('.entry-card');
    let visible = 0;
    cards.forEach(card => {
      const typeMatch = activeType === 'all' || card.dataset.type === activeType;
      const nameMatch = !q || card.dataset.name.includes(q);
      const show = typeMatch && nameMatch;
      card.classList.toggle('hidden', !show);
      if (show) visible++;
    });
    document.getElementById('results-count').textContent = visible + ' shown';
  }

  function switchTab(btn, panelId) {
    const body = btn.closest('.entry-body');
    body.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    body.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
  }
</script>
</body>
</html>`;
}

function tick(v: boolean) {
  return v ? `<span class="tick-yes" title="Granted">✓</span>` : `<span class="tick-no" title="Denied">—</span>`;
}
function tickWarn(v: boolean) {
  return v ? `<span class="tick-warn" title="Granted">✓</span>` : `<span class="tick-no" title="Denied">—</span>`;
}
function tickDanger(v: boolean) {
  return v ? `<span class="tick-danger" title="Granted">✓</span>` : `<span class="tick-no" title="Denied">—</span>`;
}
