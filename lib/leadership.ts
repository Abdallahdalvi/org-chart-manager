import type { Employee, OrgDocument } from './model';
import { issuesFor } from './organization';

// Explicit user action only: never infer or rewrite reporting lines on load/import.
export function configureLeadership(
  doc: OrgDocument,
  boardName: string,
  ceoId: string,
  executiveIds: string[],
): OrgDocument {
  const active = new Set(
    doc.employees.filter((e) => e.status === 'Active').map((e) => e.id),
  );
  if (
    !boardName.trim() ||
    !active.has(ceoId) ||
    executiveIds.some((id) => id === ceoId || !active.has(id))
  )
    throw new Error(
      'Choose a Board name, an active CEO, and active direct reports other than the CEO.',
    );
  const next: OrgDocument = {
    ...doc,
    governance: { boardName: boardName.trim(), ceoId },
    employees: doc.employees.map((e) =>
      e.id === ceoId
        ? { ...e, managerId: '', managerReference: '', rootConfirmed: true }
        : executiveIds.includes(e.id)
          ? {
              ...e,
              managerId: ceoId,
              managerReference: '',
              rootConfirmed: false,
            }
          : e,
    ),
  };
  const error = issuesFor(next).find((i) => i.severity === 'error');
  if (error) throw new Error(error.message);
  return next;
}

export function directManagerLabel(doc: OrgDocument, employee: Employee) {
  if (doc.governance?.ceoId === employee.id && !employee.managerId)
    return doc.governance.boardName;
  return (
    doc.employees.find((e) => e.id === employee.managerId)?.name ||
    employee.managerReference ||
    (employee.rootConfirmed ? 'Top level' : 'Not confirmed')
  );
}
