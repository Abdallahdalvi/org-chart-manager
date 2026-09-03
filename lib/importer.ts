import Papa from 'papaparse';
import {
  emptyEmployee,
  normalize,
  resolvePerson,
  issuesFor,
} from './organization';
import type { OrgDocument, Employee } from './model';
export type ImportTable = {
  name: string;
  source: string;
  rows: Record<string, string>[];
  rowSources?: string[];
};
export type ImportKind = 'active' | 'inactive' | 'employees' | 'departments';
export function importKind(table: ImportTable): ImportKind {
  if (
    Object.keys(table.rows[0] || {}).some(
      (k) => normalize(k) === 'department / function',
    )
  )
    return 'departments';
  if (/inactive/i.test(table.source)) return 'inactive';
  if (/active/i.test(table.source)) return 'active';
  return 'employees';
}
export type ImportPreview = {
  document: OrgDocument;
  added: number;
  changed: number;
  unchanged: number;
  messages: string[];
  changes: { id: string; name: string; type: string; detail: string }[];
};
export async function readSpreadsheet(file: File): Promise<ImportTable[]> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error('Choose a CSV or XLSX file smaller than 5 MB.');
  if (/\.csv$/i.test(file.name)) {
    let source = await file.text();
    if (source.includes('\ufffd'))
      source = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
    const result = Papa.parse<string[]>(source, { skipEmptyLines: 'greedy' });
    if (result.errors.length)
      throw new Error(`CSV could not be read: ${result.errors[0].message}`);
    return [{ name: file.name, source: file.name, rows: toRows(result.data) }];
  }
  if (!/\.xlsx$/i.test(file.name))
    throw new Error(
      'Supported formats: .xlsx and .csv. Save older .xls files as .xlsx first.',
    );
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook.worksheets
    .map((sheet) => {
      const data: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        data.push(
          Array.from(
            { length: Math.min(sheet.columnCount, 100) },
            (_, i) => row.getCell(i + 1).text,
          ),
        );
      });
      return {
        name: sheet.name,
        source: file.name + ' / ' + sheet.name,
        rows: data.some((row) =>
          row.some((v) =>
            /^(emp code|employee id|department \/ function)$/i.test(v.trim()),
          ),
        )
          ? toRows(data)
          : [],
      };
    })
    .filter((t) => t.rows.length);
}
function toRows(data: string[][]) {
  const header = data.findIndex((row) =>
    row.some((v) =>
      /^(emp code|employee id|department \/ function)$/i.test(v.trim()),
    ),
  );
  if (header < 0)
    throw new Error(
      'Expected an “Emp Code” or “Employee ID” column, or a “Department / Function” column. Download the template for the supported format.',
    );
  const keys = data[header];
  return data
    .slice(header + 1)
    .filter((r) => r.some((v) => v.trim()))
    .map((row) =>
      Object.fromEntries(
        keys
          .map((key, i) => [key.trim(), (row[i] || '').trim()])
          .filter(([key]) => key),
      ),
    );
}
const aliases: Record<string, string[]> = {
  id: ['employee id', 'emp code'],
  name: ['full name', 'employee name', 'name'],
  alias: ['first name', 'display name'],
  title: ['designation', 'job title', 'title'],
  department: ['department', 'team'],
  managerId: ['manager id', 'reporting manager id'],
  managerReference: ['reporting manager', 'direct manager'],
  functionalIds: ['functional manager ids'],
  functionalReference: ['functional reporting', 'functional manager'],
  status: ['status', 'status- active/ resigned'],
  email: ['email id', 'email'],
  rootConfirmed: ['top level confirmed'],
  notes: ['notes', 'remarks'],
};
export function previewImport(
  current: OrgDocument,
  table: ImportTable,
  departmentMode: 'proposals' | 'functions' = 'proposals',
): ImportPreview {
  if (table.rows.length > 500)
    throw new Error('At most 500 non-empty records are supported per import.');
  const next = structuredClone(current),
    messages: string[] = [],
    changes: ImportPreview['changes'] = [];
  let added = 0,
    changed = 0,
    unchanged = 0;
  if (
    table.rows[0] &&
    Object.keys(table.rows[0]).some(
      (k) => normalize(k) === 'department / function',
    )
  ) {
    const seen = new Set<string>();
    for (const row of table.rows) {
      const r = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [normalize(k), v.trim()]),
      );
      const proposal = {
        name: r['department / function'] || '',
        roles: r['positions / roles'] || '',
        summary: r.summary || '',
      };
      if (!proposal.name) continue;
      const key = normalize(proposal.name);
      if (seen.has(key))
        throw new Error(
          `Duplicate department ${proposal.name}. Select just one version of each department.`,
        );
      seen.add(key);
      const list =
        departmentMode === 'functions' ? next.functions : next.proposals;
      const index = list.findIndex((p) => normalize(p.name) === key);
      const value =
        departmentMode === 'functions'
          ? { name: proposal.name, summary: proposal.summary }
          : proposal;
      if (index < 0) {
        added++;
        list.push(value as (typeof list)[number]);
      } else if (JSON.stringify(list[index]) !== JSON.stringify(value)) {
        changed++;
        list[index] = value as (typeof list)[number];
      } else {
        unchanged++;
        continue;
      }
      changes.push({
        id: proposal.name,
        name: proposal.name,
        type: index < 0 ? 'New department' : 'Department update',
        detail: `${departmentMode === 'functions' ? 'Current function' : 'Proposal'}: ${proposal.summary}`,
      });
    }
    return {
      document: next,
      added,
      changed,
      unchanged,
      messages: [
        departmentMode === 'functions'
          ? 'Current function descriptions will be updated. Employee departments and reporting lines stay unchanged.'
          : 'Department definitions will be saved as proposals. No employee will be moved automatically.',
      ],
      changes,
    };
  }
  const pending: {
      employee: Employee;
      manager: boolean;
      functional: boolean;
      explicitManager: boolean;
      explicitFunctional: boolean;
    }[] = [],
    ids = new Set<string>();
  for (let i = 0; i < table.rows.length; i++) {
    const source = table.rowSources?.[i] || table.source;
    const raw = Object.fromEntries(
      Object.entries(table.rows[i]).map(([k, v]) => [
        normalize(k),
        v.trim().replace(/\s+/g, ' '),
      ]),
    );
    const values: Record<string, string> = {};
    for (const [key, names] of Object.entries(aliases)) {
      const header = names.find((n) => Object.hasOwn(raw, n));
      if (header) values[key] = raw[header];
    }
    if (!values.id) {
      if (Object.values(raw).some(Boolean))
        messages.push(`Row ${i + 2}: ignored because Employee ID is blank.`);
      continue;
    }
    if (ids.has(values.id))
      throw new Error(
        `Duplicate Employee ID ${values.id} in this file. Nothing has been applied.`,
      );
    ids.add(values.id);
    const old = current.employees.find((e) => e.id === values.id),
      e: Employee = old ? structuredClone(old) : emptyEmployee();
    for (const key of [
      'id',
      'name',
      'alias',
      'title',
      'department',
      'email',
      'notes',
    ] as const)
      if (key in values) e[key] = values[key];
    if (!e.name) throw new Error(`Employee ${e.id}: Full Name is required.`);
    if ('status' in values) {
      const val = normalize(values.status);
      e.sourceStatus = values.status;
      e.status =
        val === 'active'
          ? 'Active'
          : /^(inactive|resigned|abscond|absconded|exited|terminated)$/.test(
                val,
              )
            ? 'Inactive'
            : 'Needs review';
    } else if (!old)
      e.status = /inactive/i.test(source)
        ? 'Needs review'
        : /active/i.test(source)
          ? 'Active'
          : 'Needs review';
    if (/inactive/i.test(source) && e.status === 'Active') {
      e.status = 'Needs review';
      messages.push(
        `${e.name}: Active status in an inactive sheet; queued for HR review.`,
      );
    }
    if (!e.title || !e.department) {
      e.status = 'Needs review';
      messages.push(
        `${e.name}: missing title or department; queued for HR review.`,
      );
    }
    if ('rootConfirmed' in values)
      e.rootConfirmed = /^(yes|true|1)$/i.test(values.rootConfirmed);
    if ('managerId' in values) {
      e.managerId = values.managerId.replace(/^(NA|N\/A|none|-)$/i, '');
      e.managerReference = '';
      e.rootConfirmed = e.managerId ? false : e.rootConfirmed;
    } else if ('managerReference' in values) {
      e.managerReference = values.managerReference.replace(
        /^(NA|N\/A|none|-)$/i,
        '',
      );
      e.managerId = '';
    }
    if ('functionalIds' in values) {
      e.functionalIds = values.functionalIds
        .split(/[;,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      e.functionalReference = '';
    } else if ('functionalReference' in values) {
      e.functionalReference = values.functionalReference.replace(
        /^(NA|N\/A|none|-)$/i,
        '',
      );
      e.functionalIds = [];
    }
    if (!old) e.source = source;
    pending.push({
      employee: e,
      manager: 'managerReference' in values,
      functional: 'functionalReference' in values,
      explicitManager: 'managerId' in values,
      explicitFunctional: 'functionalIds' in values,
    });
  }
  const merged = [
    ...current.employees.filter((e) => !ids.has(e.id)),
    ...pending.map((p) => p.employee),
  ];
  for (const p of pending) {
    const e = p.employee;
    if (p.manager && !p.explicitManager) {
      const result = resolvePerson(e.managerReference, merged);
      e.managerId = result.id;
      if (result.method === 'first and last name')
        messages.push(
          `${e.name}: “${e.managerReference}” matched to ${merged.find((m) => m.id === result.id)?.name}. Check this in the preview.`,
        );
    }
    if (p.functional && !p.explicitFunctional) {
      const refs = e.functionalReference
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const resolved = refs.map((r) => ({
        ref: r,
        ...resolvePerson(r, merged),
      }));
      e.functionalIds = resolved.map((r) => r.id).filter(Boolean);
      if (resolved.some((r) => !r.id)) {
        e.status = 'Needs review';
        messages.push(`${e.name}: a functional manager is unresolved.`);
      }
    }
    const old = current.employees.find((o) => o.id === e.id);
    if (!old) {
      added++;
      changes.push({
        id: e.id,
        name: e.name,
        type: 'New',
        detail: `${e.title || 'Title missing'} · ${e.department || 'Department missing'}`,
      });
    } else {
      const fields = (Object.keys(e) as (keyof Employee)[]).filter(
        (k) => JSON.stringify(old[k]) !== JSON.stringify(e[k]),
      );
      if (fields.length) {
        changed++;
        changes.push({
          id: e.id,
          name: e.name,
          type: 'Update',
          detail: fields
            .map(
              (k) =>
                `${k}: ${String(old[k]) || 'blank'} → ${String(e[k]) || 'blank'}`,
            )
            .join('; '),
        });
      } else unchanged++;
    }
  }
  if (!pending.length)
    throw new Error('No employee rows with valid IDs were found.');
  next.employees = merged;
  if (merged.length > 500)
    throw new Error('The workspace supports up to 500 employees.');
  const errors = issuesFor(next).filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(errors[0].message);
  messages.push(
    'Employees absent from this file are retained. To record an exit, explicitly set Status to Inactive.',
  );
  return { document: next, added, changed, unchanged, messages, changes };
}

/** Resolve selected employee sheets together, including managers on later sheets. */
export function previewBatch(
  current: OrgDocument,
  tables: ImportTable[],
  departmentMode: 'proposals' | 'functions' = 'proposals',
): ImportPreview {
  if (!tables.length) throw new Error('Select at least one sheet.');
  const employees = tables.filter((t) => importKind(t) !== 'departments');
  const departments = tables.filter((t) => importKind(t) === 'departments');
  let result: ImportPreview = {
    document: structuredClone(current),
    added: 0,
    changed: 0,
    unchanged: 0,
    messages: [],
    changes: [],
  };
  for (const group of [employees, departments]) {
    if (!group.length) continue;
    const next = previewImport(
      result.document,
      {
        name: 'Selected sheets',
        source: 'Selected sheets',
        rows: group.flatMap((t) => t.rows),
        rowSources: group.flatMap((t) => t.rows.map(() => t.source)),
      },
      departmentMode,
    );
    result = {
      document: next.document,
      added: result.added + next.added,
      changed: result.changed + next.changed,
      unchanged: result.unchanged + next.unchanged,
      messages: [...result.messages, ...next.messages],
      changes: [...result.changes, ...next.changes],
    };
  }
  return result;
}
