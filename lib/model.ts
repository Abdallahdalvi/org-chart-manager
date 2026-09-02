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
  kind: 'HR validation' | 'Stakeholder approval';
  person: string;
  role: string;
  date: string;
  reference: string;
  note: string;
  recordedBy: string;
};
export type OrgDocument = {
  schemaVersion: 1;
  company: string;
  version: string;
  createdBy: string;
  createdDate: string;
  updatedBy: string;
  updatedDate: string;
  validatedBy: string;
  validatedDate: string;
  approvedBy: string;
  approvalDate: string;
  reviewDate: string;
  employees: Employee[];
  proposals: { name: string; roles: string; summary: string }[];
  functions: { name: string; summary: string }[];
  approvers: { person: string; role: string }[];
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
    Management: '#487ab4',
    Software: '#7163b0',
    'Product & Solution': '#bf8347',
    'Founder Office': '#438a81',
    Admin: '#8f709b',
    Support: '#658da6',
    'Sales & Marketing': '#b76f85',
    Store: '#8b9464',
  })[name] || '#548b83';
