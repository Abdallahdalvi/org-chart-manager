import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { emptyDocument } from '../lib/empty-document';
import { initialDocument } from '../lib/seed';
import type { OrgDocument } from '../lib/model';
import { prepareChange } from '../lib/changes';
import { authorizedChange } from '../selfhost/authorized-change';
import { emailSession } from '../lib/access';
import {
  documentSchema,
  recordEvidence,
  approvalStatus,
  currentEvidence,
} from '../lib/organization';
import { manualVersion, incrementVersion } from '../lib/versioning';
import {
  controlRows,
  documentControlHeaders,
  filename,
  exportExcel,
  exportWord,
  exportPowerPoint,
} from '../lib/exports';
import { chartSvg } from '../lib/chart-layout';
import { exportPdf } from '../lib/pdf-export';
import { Resvg } from '@resvg/resvg-js';
import ExcelJS from 'exceljs';

const registerRows = (doc: OrgDocument) => controlRows(doc, 0);

const save = (current: OrgDocument, changes: Partial<OrgDocument> = {}) =>
  prepareChange(current, {
    action: 'save',
    actor: 'Version test',
    description: 'Version test update',
    document: { ...current, ...changes },
  });
const legacy = structuredClone(initialDocument);
delete legacy.versionMode;
delete legacy.contentId;
const automatic = save(legacy);
assert.equal(automatic.version, '0.3');
assert.equal(automatic.versionMode, 'automatic');
const manual = save(automatic, {
  versionMode: 'manual',
  version: ' 2.1.3 ',
  documentControl: [
    { label: 'Version', value: 'wrong' },
    { label: 'version', value: 'duplicate' },
  ],
});
assert.equal(manual.version, '2.1.3');
assert.equal(registerRows(manual).at(-1)?.[1], '2.1.3');
assert.equal(registerRows(manual)[0].length, documentControlHeaders.length);
assert.equal(manual.history[0].version, '2.1.3');
assert.match(manual.history[0].description, /0.3 -> 2.1.3; manual mode/);
const reloaded = documentSchema.parse(JSON.parse(JSON.stringify(manual)));
const resetRegister = prepareChange(reloaded, {
  action: 'reset-document-control',
  actor: 'Version test',
});
assert.equal(resetRegister.version, '1.0');
assert.equal(controlRows(resetRegister).length, 11);
assert.equal(registerRows(resetRegister).length, 1);
assert.equal(registerRows(resetRegister)[0][0], '1');
assert.equal(registerRows(resetRegister)[0][1], '1.0');
const editedRegister = prepareChange(resetRegister, {
  action: 'document-control',
  actor: 'Version test',
  description: 'Completed initial document-control details',
  document: {
    ...resetRegister,
    documentControlHistory: [
      {
        ...resetRegister.documentControlHistory![0],
        serialNo: 'A-01',
        update: 'Initial approved register entry',
        validatedBy: 'HR test',
        validatedDate: '2026-09-03',
      },
    ],
  },
});
assert.equal(registerRows(editedRegister)[0][0], 'A-01');
assert.equal(registerRows(editedRegister)[0][2], 'Initial approved register entry');
assert.equal(registerRows(editedRegister)[0][7], 'HR test');
const edited = save(reloaded, { company: 'Version test company' });
assert.equal(edited.version, '2.1.3');
assert.notEqual(edited.contentId, manual.contentId);
assert.equal(edited.history.length, manual.history.length + 1);
assert.equal(save(edited, { version: '3.0' }).version, '3.0');
assert.equal(save(edited, { versionMode: 'automatic' }).version, '2.1.4');
assert.equal(incrementVersion('1.0'), '1.1');
assert.equal(incrementVersion('2.1.9'), '2.1.10');
assert.equal(manualVersion(' 1.0 '), '1.0');
for (const value of [
  '',
  ' ',
  'v1.0',
  '1..0',
  '../2',
  '1.2.3.4.5',
  '-1.0',
  '1'.repeat(41),
]) {
  assert.throws(() => save(manual, { version: value }), /Use a version/);
}
assert.equal(
  filename(edited, 'pdf'),
  'Version_test_company-org-chart-v2.1.3.pdf',
);
assert(chartSvg(edited).includes('Version 2.1.3'));
console.log(
  'PASS manual/automatic modes, clean editable control register, repeated saves, reload, validation, export metadata and canonical version row',
);

for (const role of ['editor', 'hr'] as const) {
  const next = authorizedChange(
    legacy,
    {
      action: 'save',
      document: { ...legacy, versionMode: 'manual', version: '4.0' },
      actor: 'Forged actor',
      description: 'Set version',
    },
    emailSession(role + '@example.com', [role]),
  );
  assert.equal(next.version, '4.0');
  assert.equal(next.updatedBy, role + '@example.com');
}
const editorReset = authorizedChange(
  manual,
  { action: 'reset-document-control' },
  emailSession('editor@example.com', ['editor']),
);
assert.equal(registerRows(editorReset).length, 1);
assert.equal(registerRows(editorReset)[0][1], '1.0');
const editorControlEdit = authorizedChange(
  editorReset,
  {
    action: 'document-control',
    description: 'Completed initial register fields',
    document: {
      ...editorReset,
      documentControlHistory: [
        {
          ...editorReset.documentControlHistory![0],
          update: 'Initial editable register entry',
        },
      ],
    },
  },
  emailSession('editor@example.com', ['editor']),
);
assert.equal(registerRows(editorControlEdit)[0][2], 'Initial editable register entry');
assert.throws(
  () =>
    authorizedChange(
      editorReset,
      {
        action: 'document-control',
        description: 'Attempt approval update',
        document: {
          ...editorReset,
          documentControlHistory: [
            {
              ...editorReset.documentControlHistory![0],
              approvedBy: 'Example authorizer',
            },
          ],
        },
      },
      emailSession('editor@example.com', ['editor']),
    ),
  /Only HR full access/,
);
assert.throws(
  () =>
    authorizedChange(
      manual,
      {
        action: 'save',
        document: { ...manual, version: '5.0' },
        description: 'Attempt',
      },
      emailSession('viewer@example.com', ['viewer']),
    ),
  /permission/,
);
assert.throws(
  () =>
    authorizedChange(
      manual,
      { action: 'reset-document-control' },
      emailSession('viewer@example.com', ['viewer']),
    ),
  /permission/,
);

const clean: OrgDocument = {
  ...structuredClone(emptyDocument),
  version: '1.0',
  approvers: [{ person: 'Test approver', role: 'Executive' }],
};
const validate = (doc: OrgDocument) =>
  recordEvidence(doc, {
    id: crypto.randomUUID(),
    version: doc.version,
    kind: 'HR validation',
    person: 'Test HR',
    role: 'HR',
    date: new Date().toISOString().slice(0, 10),
    reference: 'Test only',
    note: '',
    recordedBy: 'Test HR',
  });
const approve = (doc: OrgDocument) =>
  recordEvidence(doc, {
    id: crypto.randomUUID(),
    version: doc.version,
    kind: 'Stakeholder approval',
    person: 'Test approver',
    role: 'Executive',
    date: new Date().toISOString().slice(0, 10),
    reference: 'Test only',
    note: '',
    recordedBy: 'Test approver',
  });
const legacyApproved = approve(validate(clean));
assert(
  approvalStatus(legacyApproved).approved,
  'Legacy evidence remains readable',
);
const sameLabel = save(legacyApproved, { versionMode: 'manual' });
assert.equal(sameLabel.version, '1.0');
assert.equal(currentEvidence(sameLabel).length, 0);
assert(!approvalStatus(sameLabel).approved);
assert.equal(sameLabel.evidence.length, legacyApproved.evidence.length);
assert.throws(() => approve(sameLabel), /HR validation first/);
const freshApproved = approve(validate(sameLabel));
assert(approvalStatus(freshApproved).approved);
const approvedRegister = registerRows(freshApproved).at(-1)!;
assert.equal(approvedRegister[7], 'Test HR');
assert.equal(approvedRegister[9], 'Test approver');
const nextContent = save(freshApproved, { contentId: freshApproved.contentId });
assert.equal(nextContent.version, '1.0');
assert.notEqual(nextContent.contentId, freshApproved.contentId);
assert.equal(currentEvidence(nextContent).length, 0);
assert(!approvalStatus(nextContent).approved);
const anotherLabel = save(nextContent, { version: '2.0' });
const reused = save(anotherLabel, { version: '1.0' });
assert(!approvalStatus(reused).approved);
const restored = prepareChange(reused, {
  action: 'restore',
  actor: 'Test HR',
  description: 'Restore test',
  document: freshApproved,
});
assert.equal(restored.version, '1.0');
assert.notEqual(restored.contentId, freshApproved.contentId);
assert(!approvalStatus(restored).approved);
assert.equal(currentEvidence(restored).length, 0);
console.log(
  'PASS editor/full-access permissions, fresh evidence per save, legacy evidence and safe same-version restore',
);

await mkdir('.test-output', { recursive: true });
const pdf = await exportPdf(manual, {
  sections: ['chart', 'control'],
  direction: 'vertical-2',
});
const bytes = Buffer.from(await pdf.arrayBuffer());
assert(bytes.toString().includes('Version 2.1.3'));
assert(bytes.toString().includes('Document control'));
await writeFile('.test-output/manual-version.pdf', bytes);
const xlsx = await exportExcel(manual);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(await xlsx.arrayBuffer());
const controlSheet = workbook.getWorksheet('Document control')!;
assert.equal(controlSheet.getCell('B1').value, 'Version');
assert.equal(
  controlSheet.getCell(`B${registerRows(manual).length + 1}`).value,
  '2.1.3',
);
assert.equal(controlSheet.rowCount, registerRows(manual).length + 11);
for (const [extension, artifact] of [
  [
    'docx',
    await exportWord(manual, async (svg) => new Resvg(svg).render().asPng()),
  ],
  ['pptx', await exportPowerPoint(manual)],
] as const) {
  await writeFile(
    `.test-output/manual-version.${extension}`,
    Buffer.from(await artifact.arrayBuffer()),
  );
}
assert.equal(
  documentSchema.parse(JSON.parse(JSON.stringify(manual))).versionMode,
  'manual',
);
console.log(
  'PASS manual version exported to PDF, Excel, SVG and master JSON; Word and PowerPoint generated',
);
