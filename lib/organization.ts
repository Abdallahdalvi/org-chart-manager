import { z } from 'zod';
import type {
  Employee,
  OrgDocument,
  Evidence,
  DocumentControlEntry,
} from './model';
import { incrementVersion, manualVersion } from './versioning';
const s = z.string().max(2000),
  short = z.string().max(250);
export const employeeSchema = z.object({
  id: short.min(1),
  name: short.min(1),
  alias: short,
  title: short,
  department: short,
  managerId: short,
  managerReference: short,
  functionalIds: z.array(short).max(20),
  functionalReference: short,
  status: z.enum(['Active', 'Inactive', 'Needs review']),
  email: short,
  source: short,
  sourceStatus: short,
  rootConfirmed: z.boolean(),
  notes: s,
});
const evidenceSchema = z.object({
  id: short,
  version: short,
  contentId: z.uuid().optional(),
  kind: z.enum(['HR validation', 'Stakeholder approval']),
  person: short.min(1),
  role: short.min(1),
  date: short.min(1),
  reference: s.min(1),
  note: s,
  recordedBy: short.min(1),
});
const documentControlEntrySchema = z.object({
  contentId: z.string().min(1).max(250),
  serialNo: short.optional(),
  version: short,
  update: s,
  createdBy: short,
  createdDate: short,
  updatedBy: short,
  updatedDate: short,
  validatedBy: short,
  validatedDate: short,
  approvedBy: s,
  approvalDate: short,
});
export const documentSchema = z.object({
  schemaVersion: z.literal(1),
  company: short.min(1),
  version: short,
  versionMode: z.enum(['automatic', 'manual']).optional(),
  contentId: z.uuid().optional(),
  createdBy: short,
  createdDate: short,
  updatedBy: short,
  updatedDate: short,
  validatedBy: short,
  validatedDate: short,
  approvedBy: s,
  approvalDate: short,
  reviewDate: short,
  documentControlHistory: z
    .array(documentControlEntrySchema)
    .max(4000)
    .optional(),
  governance: z
    .object({ boardName: short.trim().min(1), ceoId: short.min(1) })
    .optional(),
  documentControl: z
    .array(z.object({ label: short.min(1), value: s }))
    .max(50)
    .optional(),
  employees: z.array(employeeSchema).max(500),
  proposals: z.array(z.object({ name: short, roles: s, summary: s })).max(100),
  functions: z.array(z.object({ name: short, summary: s })).max(100),
  approvers: z
    .array(
      z.object({
        person: short.min(1),
        role: short.min(1),
        email: z.email().max(150).optional(),
      }),
    )
    .max(100),
  evidence: z.array(evidenceSchema).max(2000),
  history: z
    .array(z.object({ version: short, date: short, by: short, description: s }))
    .max(4000),
});
export const normalize = (s: string) =>
  s.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function resolvePerson(
  reference: string,
  employees: Employee[],
): { id: string; method: string } {
  const value = normalize(reference);
  if (!value || /^(na|n\/a|none|-)$/.test(value))
    return { id: '', method: 'empty' };
  const exact = employees.filter((e) =>
    [e.id, e.name, e.alias].filter(Boolean).some((n) => normalize(n) === value),
  );
  if (exact.length === 1) return { id: exact[0].id, method: 'exact' };
  if (exact.length > 1) return { id: '', method: 'ambiguous' };
  const shortened = employees.filter(
    (e) =>
      normalize([e.name.split(' ')[0], e.name.split(' ').at(-1)].join(' ')) ===
      value,
  );
  return shortened.length === 1
    ? { id: shortened[0].id, method: 'first and last name' }
    : { id: '', method: shortened.length ? 'ambiguous' : 'missing' };
}
export type Issue = {
  id: string;
  employeeId?: string;
  message: string;
  severity: 'error' | 'review';
};
export function issuesFor(doc: OrgDocument): Issue[] {
  const issues: Issue[] = [],
    seen = new Set<string>(),
    map = new Map(doc.employees.map((e) => [e.id, e]));
  if (doc.governance) {
    const ceo = map.get(doc.governance.ceoId);
    if (
      !ceo ||
      ceo.status !== 'Active' ||
      ceo.managerId ||
      ceo.managerReference
    )
      issues.push({
        id: 'governance',
        employeeId: ceo?.id,
        severity: 'error',
        message:
          'Leadership setup: the CEO must be active and report only to the Board. Update Leadership setup in Document control before changing or deactivating the CEO.',
      });
  }
  for (const e of doc.employees) {
    const add = (
      key: string,
      message: string,
      severity: Issue['severity'] = 'review',
    ) =>
      issues.push({
        id: e.id + key,
        employeeId: e.id,
        message: `${e.name} (${e.id}): ${message}`,
        severity,
      });
    if (seen.has(e.id)) add('duplicate', 'duplicate employee ID.', 'error');
    seen.add(e.id);
    if (e.status === 'Needs review')
      add(
        'status',
        `record needs HR review (source: ${e.source}; source status: ${e.sourceStatus || 'blank'}).`,
      );
    if (e.status !== 'Active') continue;
    if (!e.title || !e.department)
      add('fields', 'designation and department are required.');
    if (e.managerId === e.id)
      add('self', 'cannot report to themselves.', 'error');
    else if (
      e.managerId &&
      (!map.has(e.managerId) || map.get(e.managerId)?.status !== 'Active')
    )
      add('manager', 'direct manager is missing or inactive.');
    else if (!e.managerId && e.managerReference)
      add(
        'reference',
        `manager “${e.managerReference}” could not be resolved uniquely.`,
      );
    else if (!e.managerId && !e.rootConfirmed && doc.governance?.ceoId !== e.id)
      add(
        'root',
        'no direct manager provided. Confirm top-level status or assign a manager.',
      );
    for (const id of e.functionalIds)
      if (id === e.id || !map.has(id) || map.get(id)?.status !== 'Active')
        add(
          'functional' + id,
          'functional manager is missing, inactive, or self.',
        );
    if (e.functionalReference && !e.functionalIds.length)
      add(
        'functionalref',
        `functional manager “${e.functionalReference}” is unresolved.`,
      );
    const chain = new Set<string>([e.id]);
    let id = e.managerId;
    while (id && map.has(id)) {
      if (chain.has(id)) {
        add('cycle', 'reporting cycle detected.', 'error');
        break;
      }
      chain.add(id);
      id = map.get(id)!.managerId;
    }
  }
  return issues;
}
export const currentEvidence = (doc: OrgDocument) =>
  doc.evidence.filter(
    (e) =>
      e.version === doc.version &&
      (doc.contentId ? e.contentId === doc.contentId : !e.contentId),
  );
export function approvalStatus(doc: OrgDocument) {
  const current = currentEvidence(doc),
    hr = current.find((e) => e.kind === 'HR validation');
  const pending = doc.approvers.filter(
    (a) =>
      !current.some(
        (e) =>
          e.kind === 'Stakeholder approval' &&
          normalize(e.person) === normalize(a.person) &&
          normalize(e.role) === normalize(a.role),
      ),
  );
  return {
    hr,
    pending,
    approved:
      !!hr &&
      doc.approvers.length > 0 &&
      !pending.length &&
      !issuesFor(doc).length,
  };
}
function legacyControlEntries(doc: OrgDocument): DocumentControlEntry[] {
  return doc.history.map((history, index) => ({
    contentId: `legacy-${index}-${history.date}-${history.version}`,
    serialNo: String(doc.history.length - index),
    version: history.version,
    update: history.description,
    createdBy: doc.createdBy,
    createdDate: doc.createdDate,
    updatedBy: history.by,
    updatedDate: history.date,
    validatedBy: history.version === doc.version ? doc.validatedBy : '',
    validatedDate: history.version === doc.version ? doc.validatedDate : '',
    approvedBy: history.version === doc.version ? doc.approvedBy : '',
    approvalDate: history.version === doc.version ? doc.approvalDate : '',
  }));
}
export function documentControlEntries(doc: OrgDocument) {
  return doc.documentControlHistory?.length
    ? doc.documentControlHistory
    : legacyControlEntries(doc);
}
/**
 * Stores edits made to the document-control register without changing the
 * organization chart itself. The first (current) row also drives the document
 * metadata used by downloads, while each older row remains independently
 * editable as a historic register entry.
 */
export function updateDocumentControl(
  current: OrgDocument,
  next: OrgDocument,
  actor: string,
  description: string,
): OrgDocument {
  if (!actor.trim() || !description.trim())
    throw new Error('Your name and a change description are required.');
  const submitted = next.documentControlHistory || [];
  if (!submitted.length)
    throw new Error('Keep at least one document-control register row.');
  const entries = submitted.map((entry) => ({
    ...entry,
    contentId: entry.contentId || crypto.randomUUID(),
    serialNo: entry.serialNo || '',
  }));
  const currentRow = entries[0];
  const result: OrgDocument = {
    ...current,
    version: manualVersion(currentRow.version),
    versionMode: 'manual',
    createdBy: currentRow.createdBy,
    createdDate: currentRow.createdDate,
    updatedBy: currentRow.updatedBy,
    updatedDate: currentRow.updatedDate,
    validatedBy: currentRow.validatedBy,
    validatedDate: currentRow.validatedDate,
    approvedBy: currentRow.approvedBy,
    approvalDate: currentRow.approvalDate,
    documentControlHistory: entries,
    history: [
      {
        version: currentRow.version,
        date: new Date().toISOString(),
        by: actor.trim(),
        description: description.trim(),
      },
      ...current.history,
    ],
  };
  return documentSchema.parse(result);
}

/** Starts a clean controlled register without touching the employee chart. */
export function resetDocumentControl(
  current: OrgDocument,
  actor: string,
): OrgDocument {
  if (!actor.trim()) throw new Error('Your name is required.');
  const now = new Date().toISOString();
  const entry: DocumentControlEntry = {
    contentId: crypto.randomUUID(),
    serialNo: '1',
    version: '1.0',
    update: 'Initial controlled register',
    createdBy: actor.trim(),
    createdDate: now.slice(0, 10),
    updatedBy: actor.trim(),
    updatedDate: now.slice(0, 10),
    validatedBy: '',
    validatedDate: '',
    approvedBy: '',
    approvalDate: '',
  };
  return documentSchema.parse({
    ...current,
    version: entry.version,
    versionMode: 'manual',
    contentId: entry.contentId,
    createdBy: entry.createdBy,
    createdDate: entry.createdDate,
    updatedBy: entry.updatedBy,
    updatedDate: entry.updatedDate,
    validatedBy: '',
    validatedDate: '',
    approvedBy: '',
    approvalDate: '',
    documentControlHistory: [entry],
    history: [
      {
        version: entry.version,
        date: now,
        by: actor.trim(),
        description: 'Reset document-control register to V1.0.',
      },
      ...current.history,
    ],
  });
}
export function evolve(
  current: OrgDocument,
  next: OrgDocument,
  actor: string,
  description: string,
  structural: boolean,
): OrgDocument {
  if (!actor.trim() || !description.trim())
    throw new Error('Your name and a change description are required.');
  const now = new Date().toISOString();
  const errors = issuesFor(next).filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(errors[0].message);
  const result: OrgDocument = {
    ...next,
    createdBy:
      current.createdBy === 'Initial source import'
        ? actor.trim()
        : current.createdBy,
    createdDate: current.createdDate,
    updatedBy: actor.trim(),
    updatedDate: now,
    version: current.version,
    versionMode: next.versionMode ?? current.versionMode ?? 'automatic',
    contentId: current.contentId,
    evidence: current.evidence,
    history: current.history,
    validatedBy: current.validatedBy,
    validatedDate: current.validatedDate,
    approvedBy: current.approvedBy,
    approvalDate: current.approvalDate,
  };
  if (structural) {
    result.version =
      result.versionMode === 'manual'
        ? manualVersion(next.version)
        : incrementVersion(current.version);
    // A display version may be reused. Evidence must still belong to this exact
    // saved content, never to an older chart with the same version label.
    result.contentId = crypto.randomUUID();
    result.validatedBy = '';
    result.validatedDate = '';
    result.approvedBy = '';
    result.approvalDate = '';
  }
  // Keep untouched audit fields current while preserving explicitly customized
  // report metadata. These values never grant approval or replace evidence.
  const auditFields: [
    string,
    keyof Pick<
      OrgDocument,
      | 'version'
      | 'createdBy'
      | 'createdDate'
      | 'updatedBy'
      | 'updatedDate'
      | 'validatedBy'
      | 'validatedDate'
      | 'approvedBy'
      | 'approvalDate'
      | 'reviewDate'
    >,
  ][] = [
    ['Version', 'version'],
    ['Created by', 'createdBy'],
    ['Created date', 'createdDate'],
    ['Updated by', 'updatedBy'],
    ['Updated date', 'updatedDate'],
    ['Validated by', 'validatedBy'],
    ['Validated date', 'validatedDate'],
    ['Approved by', 'approvedBy'],
    ['Approval date', 'approvalDate'],
    ['Next review', 'reviewDate'],
  ];
  if (result.documentControl)
    result.documentControl = result.documentControl.map((row) => {
      const field = auditFields.find(([label]) => label === row.label)?.[1];
      if (!field) return row;
      const display = (value: string) =>
        field.endsWith('Date') ? value.slice(0, 10) : value;
      return row.value === display(current[field])
        ? { ...row, value: display(result[field]) }
        : row;
    });
  if (result.documentControl)
    result.documentControl = [
      { label: 'Version', value: result.version },
      ...result.documentControl.filter(
        (row) => normalize(row.label) !== 'version',
      ),
    ];
  const versionChange =
    structural &&
    ((current.versionMode || 'automatic') !== result.versionMode ||
      (result.versionMode === 'manual' && current.version !== result.version))
      ? ` Version: ${current.version} -> ${result.version}; ${result.versionMode} mode.`
      : '';
  result.history = [
    {
      version: result.version,
      date: now,
      by: actor.trim(),
      description:
        description.trim().slice(0, 2000 - versionChange.length) +
        versionChange,
    },
    ...current.history,
  ];
  const update = result.history[0].description;
  result.documentControlHistory = [
    {
      contentId: result.contentId || crypto.randomUUID(),
      serialNo: String(
        Math.max(
          0,
          ...documentControlEntries(current).map((entry, index) =>
            Number.parseInt(entry.serialNo || String(documentControlEntries(current).length - index), 10) || 0,
          ),
        ) + 1,
      ),
      version: result.version,
      update,
      createdBy: result.createdBy,
      createdDate: result.createdDate,
      updatedBy: result.updatedBy,
      updatedDate: result.updatedDate,
      validatedBy: result.validatedBy,
      validatedDate: result.validatedDate,
      approvedBy: result.approvedBy,
      approvalDate: result.approvalDate,
    },
    ...documentControlEntries(current),
  ];
  return documentSchema.parse(result);
}
export function recordEvidence(
  current: OrgDocument,
  record: Evidence,
): OrgDocument {
  // The caller cannot bind an approval to an arbitrary historic content ID.
  record = { ...record, contentId: current.contentId };
  evidenceSchema.parse(record);
  if (record.version !== current.version)
    throw new Error('Approval must refer to the current version.');
  if (issuesFor(current).length)
    throw new Error(
      'Resolve all HR review items before validating or approving.',
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
    record.date > new Date().toISOString().slice(0, 10) ||
    !Number.isFinite(Date.parse(record.date))
  )
    throw new Error('Use a valid approval date that is not in the future.');
  if (!record.reference.trim())
    throw new Error(
      'An original email, signature file reference, or approval-workflow link is required.',
    );
  if (record.kind === 'Stakeholder approval') {
    if (!currentEvidence(current).some((e) => e.kind === 'HR validation'))
      throw new Error('Record HR validation first.');
    if (
      !current.approvers.some(
        (a) =>
          normalize(a.person) === normalize(record.person) &&
          normalize(a.role) === normalize(record.role),
      )
    )
      throw new Error('Choose a stakeholder from the required approver list.');
  }
  if (
    currentEvidence(current).some(
      (e) =>
        e.kind === record.kind &&
        normalize(e.person) === normalize(record.person) &&
        normalize(e.role) === normalize(record.role),
    )
  )
    throw new Error(
      'This approval is already recorded for the current version.',
    );
  const doc: OrgDocument = {
    ...current,
    evidence: [...current.evidence, record],
    updatedBy: record.recordedBy,
    updatedDate: new Date().toISOString(),
  };
  if (record.kind === 'HR validation') {
    doc.validatedBy = record.person;
    doc.validatedDate = record.date;
  }
  if (approvalStatus(doc).approved) {
    doc.approvedBy = doc.approvers.map((a) => a.person).join('; ');
    doc.approvalDate = record.date;
  }
  doc.documentControlHistory = documentControlEntries(doc).map((entry) =>
    entry.contentId === doc.contentId
      ? {
          ...entry,
          validatedBy: doc.validatedBy,
          validatedDate: doc.validatedDate,
          approvedBy: doc.approvedBy,
          approvalDate: doc.approvalDate,
        }
      : entry,
  );
  doc.history = [
    {
      version: doc.version,
      date: doc.updatedDate,
      by: record.recordedBy,
      description: `Recorded ${record.kind.toLowerCase()} from ${record.person}; evidence: ${record.reference}`,
    },
    ...doc.history,
  ];
  return doc;
}
export function activeForest(doc: OrgDocument) {
  const all = doc.employees.filter((e) => e.status === 'Active'),
    ids = new Set(all.map((e) => e.id));
  const roots = all.filter((e) => !e.managerId || !ids.has(e.managerId));
  const rank = (e: Employee) =>
    ({ CEO: 0, COO: 1, CTO: 2, CSO: 3 })[e.title] ?? 5;
  roots.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { all, roots };
}
export function descendantIds(id: string, employees: Employee[]): string[] {
  const seen = new Set<string>([id]);
  const out: string[] = [];
  for (let i = 0, queue = [id]; i < queue.length; i++)
    for (const e of employees)
      if (e.managerId === queue[i] && !seen.has(e.id)) {
        seen.add(e.id);
        out.push(e.id);
        queue.push(e.id);
      }
  return out;
}
export function emptyEmployee(): Employee {
  return {
    id: '',
    name: '',
    alias: '',
    title: '',
    department: '',
    managerId: '',
    managerReference: '',
    functionalIds: [],
    functionalReference: '',
    status: 'Active',
    email: '',
    source: 'Manual entry',
    sourceStatus: 'Active',
    rootConfirmed: false,
    notes: '',
  };
}
