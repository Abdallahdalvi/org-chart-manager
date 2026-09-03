import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { Resvg } from '@resvg/resvg-js';
import JSZip from 'jszip';
import { initialDocument } from '../lib/seed';
import {
  issuesFor,
  resolvePerson,
  evolve,
  recordEvidence,
  approvalStatus,
  documentSchema,
  descendantIds,
} from '../lib/organization';
import {
  previewImport,
  previewBatch,
  readSpreadsheet,
  importKind,
} from '../lib/importer';
import { chartLayout, chartSvg } from '../lib/chart-layout';
import {
  exportExcel,
  exportPdf,
  exportWord,
  exportPowerPoint,
} from '../lib/exports';
import type { OrgDocument, Evidence } from '../lib/model';
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('PASS ' + name);
}
const doc = structuredClone(initialDocument);
check(
  'Source reconciles: 53 active, 3 inactive, 3 review; 7 review items',
  () => {
    assert.equal(doc.employees.length, 59);
    assert.equal(doc.employees.filter((e) => e.status === 'Active').length, 53);
    assert.equal(
      doc.employees.filter((e) => e.status === 'Inactive').length,
      3,
    );
    assert.equal(
      doc.employees.filter((e) => e.status === 'Needs review').length,
      3,
    );
    assert.equal(issuesFor(doc).length, 7);
    assert.equal(
      doc.employees.reduce((n, e) => n + e.functionalIds.length, 0),
      4,
    );
  },
);
check('Names resolve deterministically; ambiguous matches do not guess', () => {
  assert.equal(resolvePerson('Ozair Khatri', doc.employees).id, '25');
  assert.equal(resolvePerson('Hetvi Shah', doc.employees).id, '1');
  assert.equal(resolvePerson('Nobody Here', doc.employees).id, '');
  assert.equal(resolvePerson('Sagar', doc.employees).method, 'ambiguous');
});
check('Cycles and self managers are rejected', () => {
  const cyclic = structuredClone(doc);
  cyclic.employees.find((e) => e.id === '4')!.managerId = '25';
  assert(issuesFor(cyclic).some((i) => i.severity === 'error'));
  assert.throws(() => evolve(doc, cyclic, 'Test editor', 'Cycle test', true));
});
check(
  'Partial spreadsheet updates preserve fields and omitted employees',
  () => {
    const preview = previewImport(doc, {
      name: 'Employees',
      source: 'test.csv',
      rows: [
        { 'Employee ID': '33', 'Job Title': 'Updated Marketing Strategist' },
      ],
    });
    assert.equal(preview.changed, 1);
    assert.equal(preview.document.employees.length, 59);
    const e = preview.document.employees.find((e) => e.id === '33')!;
    assert.equal(e.name, 'Abdallah Mubeen Dalvi');
    assert.equal(e.managerId, '7');
    assert.equal(e.title, 'Updated Marketing Strategist');
  },
);
check('Duplicate import IDs are rejected atomically', () =>
  assert.throws(
    () =>
      previewImport(doc, {
        name: 'Employees',
        source: 'test.csv',
        rows: [
          { 'Employee ID': '3', 'Full Name': 'A' },
          { 'Employee ID': '3', 'Full Name': 'B' },
        ],
      }),
    /Duplicate/,
  ),
);
check('New hires, exits, and forward manager references merge by ID', () => {
  const p = previewImport(doc, {
    name: 'Employees',
    source: 'Employees.xlsx',
    rows: [
      {
        'Employee ID': 'NEW1',
        'Full Name': 'Test Hire',
        'Job Title': 'Engineer',
        Department: 'Software',
        'Manager ID': 'NEW2',
        Status: 'Active',
      },
      {
        'Employee ID': 'NEW2',
        'Full Name': 'Test Manager',
        'Job Title': 'Manager',
        Department: 'Software',
        'Manager ID': '25',
        Status: 'Active',
      },
      { 'Employee ID': '5', Status: 'Inactive' },
    ],
  });
  assert.equal(p.added, 2);
  assert.equal(
    p.document.employees.find((e) => e.id === 'NEW1')!.managerId,
    'NEW2',
  );
  assert.equal(
    p.document.employees.find((e) => e.id === '5')!.status,
    'Inactive',
  );
});
check('Inactive-file Active status is quarantined', () => {
  const p = previewImport(doc, {
    name: 'Inactive Emp',
    source: 'Inactive Emp.csv',
    rows: [
      {
        'Employee ID': 'NEW1',
        'Full Name': 'Test Hire',
        'Job Title': 'Engineer',
        Department: 'Software',
        Status: 'Active',
      },
    ],
  });
  assert.equal(
    p.document.employees.find((e) => e.id === 'NEW1')!.status,
    'Needs review',
  );
});
check('Department proposal does not reassign anyone', () => {
  const p = previewImport(doc, {
    name: 'Departments',
    source: 'department.csv',
    rows: [
      {
        'Department / Function': 'New Division',
        'Positions / Roles': 'Manager',
        Summary: 'Proposed function',
      },
    ],
  });
  assert.deepEqual(p.document.employees, doc.employees);
  assert.equal(p.document.proposals.at(-1)!.name, 'New Division');
  assert.equal(p.document.proposals.length, doc.proposals.length + 1);
});
check(
  'Department proposals merge without deleting omitted definitions; repeated import is a no-op',
  () => {
    const table = {
      name: 'Departments',
      source: 'October.csv',
      rows: [
        {
          'department / function': 'A new function',
          'positions / roles': 'Manager',
          summary: 'Responsibilities',
        },
      ],
    };
    const first = previewImport(doc, table);
    const second = previewImport(first.document, table);
    assert.equal(first.added, 1);
    assert.equal(second.added + second.changed, 0);
    assert.equal(second.unchanged, 1);
    const live = previewImport(doc, table, 'functions');
    assert(live.document.functions.some((f) => f.name === 'A new function'));
    assert.deepEqual(live.document.employees, doc.employees);
    assert.deepEqual(live.document.proposals, doc.proposals);
  },
);
check(
  'Batch imports resolve a manager on a later sheet and reject conflicting duplicate IDs',
  () => {
    const one = {
      name: 'Team',
      source: 'Active team.csv',
      rows: [
        {
          'Employee ID': 'BATCH1',
          'Full Name': 'Batch Person',
          Designation: 'Engineer',
          Department: 'Software',
          'Reporting Manager': 'Batch Manager',
          Status: 'Active',
        },
      ],
    };
    const two = {
      name: 'Manager',
      source: 'Active managers.csv',
      rows: [
        {
          'Employee ID': 'BATCH2',
          'Full Name': 'Batch Manager',
          Designation: 'Manager',
          Department: 'Software',
          'Manager ID': '25',
          Status: 'Active',
        },
      ],
    };
    const batch = previewBatch(doc, [one, two]);
    assert.equal(
      batch.document.employees.find((e) => e.id === 'BATCH1')!.managerId,
      'BATCH2',
    );
    assert.equal(batch.added, 2);
    assert.throws(() => previewBatch(doc, [one, one]), /Duplicate/);
  },
);
const clean: OrgDocument = structuredClone(doc);
clean.employees = clean.employees
  .filter((e) => e.status !== 'Needs review')
  .map((e) => ({ ...e, rootConfirmed: !e.managerId }));
const evidence = (
  kind: Evidence['kind'],
  person: string,
  role: string,
): Evidence => ({
  id: crypto.randomUUID(),
  version: clean.version,
  kind,
  person,
  role,
  date: '2026-09-02',
  reference: 'Test evidence reference — not a real approval',
  note: 'Automated test only',
  recordedBy: 'Test recorder',
});
check('Validation blocks unresolved source data and requires evidence', () => {
  assert.throws(
    () => recordEvidence(doc, evidence('HR validation', 'Test HR', 'HR')),
    /review/,
  );
  assert.throws(() =>
    recordEvidence(clean, {
      ...evidence('HR validation', 'Test HR', 'HR'),
      reference: '',
    }),
  );
  assert.throws(
    () =>
      recordEvidence(
        clean,
        evidence(
          'Stakeholder approval',
          clean.approvers[0].person,
          clean.approvers[0].role,
        ),
      ),
    /HR validation first/,
  );
});
let approved = recordEvidence(
  clean,
  evidence('HR validation', 'Test HR', 'HR'),
);
for (const a of clean.approvers)
  approved = recordEvidence(
    approved,
    evidence('Stakeholder approval', a.person, a.role),
  );
check(
  'Approval requires all configured stakeholders for this exact version',
  () => {
    assert.equal(approvalStatus(approved).approved, true);
    assert(approved.approvedBy.includes(clean.approvers[0].person));
    assert.throws(
      () =>
        recordEvidence(
          approved,
          evidence(
            'Stakeholder approval',
            clean.approvers[0].person,
            clean.approvers[0].role,
          ),
        ),
      /already/,
    );
  },
);
check(
  'Structural edits invalidate approvals but retain evidence history',
  () => {
    const next = evolve(
      approved,
      { ...approved, company: 'Test company' },
      'Test editor',
      'Test change',
      true,
    );
    assert.equal(next.version, '0.2');
    assert.equal(approvalStatus(next).approved, false);
    assert.equal(next.validatedBy, '');
    assert.equal(next.approvedBy, '');
    assert.equal(next.evidence.length, approved.evidence.length);
  },
);
check(
  'Chart includes every active employee exactly once, without overlap',
  () => {
    const l = chartLayout(doc);
    assert.equal(l.nodes.length, 53);
    assert.equal(new Set(l.nodes.map((n) => n.employee.id)).size, 53);
    for (const a of l.nodes) {
      assert(a.y + a.height < l.height);
      for (const b of l.nodes) {
        if (a === b) continue;
        const overlap =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        assert(!overlap);
      }
    }
    assert(descendantIds('4', doc.employees).includes('5'));
  },
);
check('Invalid master data is rejected', () =>
  assert.throws(() =>
    documentSchema.parse({ ...doc, employees: [{ id: 'broken' }] }),
  ),
);
check('SQLite compare-and-swap prevents stale saves', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE documents (id TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL)',
  );
  const stmt = db.prepare(
    'INSERT INTO documents (id,revision,data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, data = excluded.data WHERE documents.revision = ?',
  );
  assert.equal(stmt.run('company', 1, 'first', 0).changes, 1);
  assert.equal(stmt.run('company', 1, 'stale', 0).changes, 0);
  assert.equal(stmt.run('company', 2, 'second', 1).changes, 1);
  db.close();
});
await mkdir('.test-output', { recursive: true });
const svg = chartSvg(doc);
await writeFile('.test-output/chart.svg', svg);
const image = new Resvg(svg, { fitTo: { mode: 'width', value: 1600 } })
  .render()
  .asPng();
await writeFile('.test-output/chart.png', image);
const spreadsheet = await exportExcel(doc);
await writeFile(
  '.test-output/workbook.xlsx',
  new Uint8Array(await spreadsheet.arrayBuffer()),
);
const tables = await readSpreadsheet(new File([spreadsheet], 'test.xlsx'));
assert(tables.some((t) => t.name === 'Employees' && t.rows.length === 59));
const roundTrip = previewImport(
  doc,
  tables.find((t) => t.name === 'Employees')!,
);
assert.equal(roundTrip.added, 0);
assert.equal(
  roundTrip.document.employees.filter((e) => e.status === 'Active').length,
  53,
);
passed++;
console.log('PASS XLSX generates and imports back with 59 employee records');
const csvText = await readFile(
  'C:/Users/CoreX/Downloads/Ubiqedge Organization chart data(Active Emp).csv',
);
const original = await readSpreadsheet(new File([csvText], 'Active Emp.csv'));
assert.equal(original[0].rows.length, 54);
passed++;
console.log(
  'PASS Original CSV ignores hundreds of blank rows but preserves incomplete Ashish row',
);
const inactiveFile = await readFile(
  'C:/Users/CoreX/Downloads/Ubiqedge Organization chart data(Inactive Emp).csv',
);
const deptFile = await readFile(
  'C:/Users/CoreX/Downloads/Ubiqedge Organization chart data(Departments for oct changes).csv',
);
const inactiveTables = await readSpreadsheet(
  new File([inactiveFile], 'Inactive Emp.csv'),
);
const departmentTables = await readSpreadsheet(
  new File([deptFile], 'Departments for oct changes.csv'),
);
check(
  'All three actual supplied sheet types import together, preserving exits, review conflicts and proposals',
  () => {
    assert.equal(importKind(inactiveTables[0]), 'inactive');
    assert.equal(importKind(departmentTables[0]), 'departments');
    const combined = previewBatch(doc, [
      ...original,
      ...inactiveTables,
      ...departmentTables,
    ]);
    assert.equal(combined.document.employees.length, 59);
    assert.equal(
      combined.document.employees.filter((e) => e.status === 'Inactive').length,
      3,
    );
    assert.equal(
      combined.document.employees.find((e) => e.id === '21')!.status,
      'Needs review',
    );
    assert.equal(
      combined.document.employees.find((e) => e.id === '49')!.status,
      'Needs review',
    );
    assert.match(
      combined.document.employees.find((e) => e.id === '41')!.notes,
      /Absconded/,
    );
    assert.equal(combined.document.proposals.length, 10);
    assert.equal(
      previewBatch(combined.document, [
        ...original,
        ...inactiveTables,
        ...departmentTables,
      ]).changed,
      0,
    );
  },
);
for (const [ext, blob] of [
  ['pdf', await exportPdf(doc)],
  [
    'docx',
    await exportWord(doc, async (svg) => new Resvg(svg).render().asPng()),
  ],
  ['pptx', await exportPowerPoint(doc)],
] as const) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile('.test-output/chart.' + ext, bytes);
  assert(bytes.length > 5000);
  if (ext === 'pdf') {
    assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF');
  } else {
    const zip = await JSZip.loadAsync(bytes),
      key = ext === 'docx' ? 'word/document.xml' : 'ppt/slides/slide1.xml';
    const xml = await zip.file(key)!.async('string');
    assert(xml.includes('Hetvi Manish Shah'));
    assert(xml.includes('Visat Subodh Patel'));
    assert(xml.includes('DRAFT'));
    if (ext === 'pptx') assert((xml.match(/<p:sp>/g) || []).length > 53);
  }
  passed++;
  console.log(
    'PASS ' +
      ext.toUpperCase() +
      ' output opens structurally and includes real chart content',
  );
}
const res = await fetch('http://localhost:3000/api/document');
assert.equal(res.status, 200);
const data = (await res.json()) as { document: OrgDocument; revision: number };
assert.equal(data.document.employees.length, 59);
const invalid = await fetch('http://localhost:3000/api/document', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
  },
  body: JSON.stringify({
    action: 'save',
    revision: data.revision,
    actor: '',
    document: data.document,
    description: 'invalid test',
  }),
});
assert.equal(invalid.status, 400);
const cross = await fetch('http://localhost:3000/api/document', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://untrusted.example',
  },
  body: '{}',
});
assert.equal(cross.status, 403);
passed++;
console.log(
  'PASS API loads saved data, rejects missing audit identity and cross-origin writes',
);
console.log(
  `\n${passed} checks passed. Test exports in .test-output (ignored by git).`,
);
