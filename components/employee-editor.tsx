'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import type { Employee, OrgDocument } from '@/lib/model';
import { descendantIds, issuesFor } from '@/lib/organization';
export function EmployeeEditor({
  employee,
  doc,
  isNew,
  onClose,
  onSave,
  busy,
  actor,
  onActor,
  saveError,
}: {
  employee: Employee;
  doc: OrgDocument;
  isNew: boolean;
  onClose: () => void;
  onSave: (e: Employee, description: string) => Promise<boolean>;
  busy: boolean;
  actor: string;
  onActor: (value: string) => void;
  saveError: string;
}) {
  const [form, setForm] = useState(employee),
    [reason, setReason] = useState(''),
    [error, setError] = useState('');
  const excluded = new Set([
    employee.id,
    ...descendantIds(employee.id, doc.employees),
  ]);
  const managers = doc.employees.filter(
    (e) => e.status === 'Active' && !excluded.has(e.id),
  );
  const set = (key: keyof Employee, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (isNew && doc.employees.some((e) => e.id === form.id.trim())) {
      setError('Employee ID already exists. Edit that person instead.');
      return;
    }
    if (
      form.status === 'Active' &&
      (!form.title.trim() || !form.department.trim())
    ) {
      setError('Active employees need a job title and department.');
      return;
    }
    if (
      form.status !== 'Active' &&
      doc.employees.some(
        (e) =>
          e.status === 'Active' &&
          (e.managerId === form.id || e.functionalIds.includes(form.id)),
      )
    ) {
      setError(
        'Reassign active direct reports and functional reporting links before marking this manager inactive.',
      );
      return;
    }
    const cleaned = {
      ...form,
      id: form.id.trim(),
      name: form.name.trim(),
      title: form.title.trim(),
      department: form.department.trim(),
      managerReference: '',
      functionalReference: '',
      rootConfirmed: form.managerId ? false : form.rootConfirmed,
    };
    const candidate = {
      ...doc,
      employees: isNew
        ? [...doc.employees, cleaned]
        : doc.employees.map((e) => (e.id === cleaned.id ? cleaned : e)),
    };
    const issues = issuesFor(candidate).filter((i) => i.severity === 'error');
    if (issues.length) {
      setError(issues[0].message);
      return;
    }
    if (
      await onSave(
        cleaned,
        reason ||
          `${isNew ? 'Added' : 'Updated'} ${cleaned.name} (${cleaned.id})`,
      )
    )
      onClose();
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="editor-dialog">
        <DialogTitle>{isNew ? 'Add employee' : 'Edit employee'}</DialogTitle>
        <DialogDescription>
          Save changes to this person in the existing chart. The change log
          updates automatically.
        </DialogDescription>
        <form onSubmit={submit} className="editor-form">
          <div className="form-grid">
            <label htmlFor="employee-editor-field-1">
              Employee ID
              <Input
                id="employee-editor-field-1"
                required
                maxLength={250}
                value={form.id}
                disabled={!isNew}
                onChange={(e) => set('id', e.target.value)}
              />
            </label>
            <label htmlFor="employee-editor-field-2">
              Full name
              <Input
                id="employee-editor-field-2"
                required
                maxLength={250}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </label>
            <label htmlFor="employee-editor-field-3">
              Job title
              <Input
                id="employee-editor-field-3"
                maxLength={250}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </label>
            <label htmlFor="employee-editor-field-4">
              Department
              <Input
                id="employee-editor-field-4"
                list="department-options"
                maxLength={250}
                value={form.department}
                onChange={(e) => set('department', e.target.value)}
              />
              <datalist id="department-options">
                {[
                  ...new Set(
                    doc.employees.map((e) => e.department).filter(Boolean),
                  ),
                ].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </datalist>
            </label>
            <label htmlFor="employee-editor-field-5">
              Direct manager
              <NativeSelect
                id="employee-editor-field-5"
                value={form.managerId}
                onChange={(e) => set('managerId', e.target.value)}
              >
                <option value="">No manager / top level</option>
                {managers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.title}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label htmlFor="employee-editor-field-6">
              Employment status
              <NativeSelect
                id="employee-editor-field-6"
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
              >
                <option>Active</option>
                <option>Inactive</option>
                <option>Needs review</option>
              </NativeSelect>
            </label>
            <label htmlFor="employee-editor-field-7">
              Email (optional)
              <Input
                id="employee-editor-field-7"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </label>
            <label htmlFor="employee-editor-field-8">
              Display alias (optional)
              <Input
                id="employee-editor-field-8"
                value={form.alias}
                onChange={(e) => set('alias', e.target.value)}
              />
            </label>
          </div>
          {!form.managerId && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.rootConfirmed}
                onChange={(e) => set('rootConfirmed', e.target.checked)}
              />
              HR has confirmed this person belongs at the top level (no direct
              manager).
            </label>
          )}
          <label htmlFor="employee-editor-field-9">
            Functional / cross-functional managers
            <NativeSelect
              id="employee-editor-field-9"
              multiple
              value={form.functionalIds}
              onChange={(e) =>
                set(
                  'functionalIds',
                  Array.from(e.target.selectedOptions, (v) => v.value),
                )
              }
            >
              {doc.employees
                .filter((e) => e.status === 'Active' && e.id !== form.id)
                .map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name} · {e.title}
                  </option>
                ))}
            </NativeSelect>
            <small>
              Hold Ctrl / Cmd to select multiple people. These links do not
              change direct reporting.
            </small>
          </label>
          <label htmlFor="employee-editor-field-10">
            Employee notes
            <Textarea
              id="employee-editor-field-10"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </label>
          <label htmlFor="employee-editor-field-11">
            Change description
            <Input
              id="employee-editor-field-11"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isNew
                  ? 'New joiner — department and reporting confirmed'
                  : 'What changed and why?'
              }
            />
          </label>
          {employee.source && (
            <p className="muted">
              Source: {employee.source} · Original status:{' '}
              {employee.sourceStatus || 'Not supplied'}
            </p>
          )}
          <label htmlFor="employee-editor-actor">
            Your name for the change log
            <Input
              id="employee-editor-actor"
              required
              value={actor}
              maxLength={150}
              onChange={(e) => onActor(e.target.value)}
              placeholder="Your name"
            />
          </label>
          {(error || saveError) && (
            <p className="error" role="alert">
              {error || saveError}
            </p>
          )}
          <div className="form-actions">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save employee'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
