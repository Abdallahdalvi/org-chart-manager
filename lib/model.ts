export type Employee = {
  id: string;
  name: string;
  alias: string;
  title: string;
  department: string;
  managerId: string;
  managerReference: string;
  functionalIds: string[];
  functionalReference: string;
  status: 'Active' | 'Inactive' | 'Needs review';
  email: string;
  source: string;
  sourceStatus: string;
  rootConfirmed: boolean;
  notes: string;
};
export type Evidence = {
  id: string;
  version: string;
  contentId?: string;
  kind: 'HR validation' | 'Stakeholder approval';
  person: string;
  role: string;
  date: string;
  reference: string;
  note: string;
  recordedBy: string;
};
export type DocumentControlEntry = {
  contentId: string;
  /** Display sequence in the revision register. Kept editable for document-control use. */
  serialNo?: string;
  version: string;
  update: string;
  createdBy: string;
  createdDate: string;
  updatedBy: string;
  updatedDate: string;
  validatedBy: string;
  validatedDate: string;
  approvedBy: string;
  approvalDate: string;
};
export type OrgDocument = {
  schemaVersion: 1;
  company: string;
  version: string;
  versionMode?: 'automatic' | 'manual';
  contentId?: string;
  createdBy: string;
  createdDate: string;
  updatedBy: string;
  updatedDate: string;
  validatedBy: string;
  validatedDate: string;
  approvedBy: string;
  approvalDate: string;
  reviewDate: string;
  documentControlHistory?: DocumentControlEntry[];
  documentControl?: { label: string; value: string }[];
  governance?: { boardName: string; ceoId: string };
  employees: Employee[];
  proposals: { name: string; roles: string; summary: string }[];
  functions: { name: string; summary: string }[];
  approvers: { person: string; role: string; email?: string }[];
  evidence: Evidence[];
  history: { version: string; date: string; by: string; description: string }[];
};
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((v) => v[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();
export const departmentColor = (name: string) =>
  ({
    Management: '#2563eb',
    Software: '#7c3aed',
    'Product & Solution': '#ea580c',
    'Founder Office': '#16a34a',
    Admin: '#dc2626',
    Support: '#0891b2',
    'Sales & Marketing': '#db2777',
    Store: '#ca8a04',
  })[name] || '#115e59';
