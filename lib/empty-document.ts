import type { OrgDocument } from './model';
// No employee data in the browser bundle; load records from the protected API.
export const emptyDocument: OrgDocument = {
  schemaVersion: 1,
  company: 'Ubiqedge',
  version: '0.0',
  createdBy: '',
  createdDate: '',
  updatedBy: '',
  updatedDate: '',
  validatedBy: '',
  validatedDate: '',
  approvedBy: '',
  approvalDate: '',
  reviewDate: '',
  employees: [],
  proposals: [],
  functions: [],
  approvers: [],
  evidence: [],
  history: [],
};
