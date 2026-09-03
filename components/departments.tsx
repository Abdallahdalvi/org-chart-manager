'use client';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { OrgDocument } from '@/lib/model';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@/components/ui/table';
export function Departments({
  doc,
  busy,
  onSave,
  onView,
  canEdit = true,
}: {
  doc: OrgDocument;
  busy: boolean;
  onSave: (doc: OrgDocument, reason: string) => Promise<boolean>;
  onView: (department: string) => void;
  canEdit?: boolean;
}) {
  const [name, setName] = useState(''),
    [summary, setSummary] = useState(''),
    [newName, setNewName] = useState(''),
    [newSummary, setNewSummary] = useState('');
  const departments = [
    ...new Set([
      ...doc.employees
        .filter((e) => e.status === 'Active')
        .map((e) => e.department),
      ...doc.functions.map((f) => f.name),
    ]),
  ].sort();
  return (
    <div className="content-page">
      <div className="section-intro">
        <h2>Departments & functions</h2>
        <p>
          Current employee departments are preserved. Proposed October changes
          do not move employees or change reporting lines automatically.
        </p>
      </div>
      <section className="surface">
        <Table className="editable-table department-table">
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>People</TableHead>
              <TableHead>Function / description</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((d) => (
              <TableRow key={d}>
                <TableCell>
                  <strong>{d}</strong>
                </TableCell>
                <TableCell>
                  {
                    doc.employees.filter(
                      (e) => e.status === 'Active' && e.department === d,
                    ).length
                  }
                </TableCell>
                <TableCell>
                  {name === d && canEdit ? (
                    <Textarea
                      aria-label={d + ' function'}
                      value={summary}
                      maxLength={2000}
                      rows={5}
                      onChange={(e) => setSummary(e.target.value)}
                    />
                  ) : (
                    doc.functions.find((f) => f.name === d)?.summary ||
                    'No description yet'
                  )}
                </TableCell>
                <TableCell>
                  <div className="table-actions">
                    {canEdit &&
                      (name === d ? (
                        <>
                          <Button
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await onSave(
                                  {
                                    ...doc,
                                    functions: [
                                      ...doc.functions.filter(
                                        (f) => f.name !== d,
                                      ),
                                      { name: d, summary: summary.trim() },
                                    ],
                                  },
                                  'Updated function: ' + d,
                                )
                              ) {
                                setName('');
                                setSummary('');
                              }
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setName('');
                              setSummary('');
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setName(d);
                            setSummary(
                              doc.functions.find((f) => f.name === d)
                                ?.summary || '',
                            );
                          }}
                        >
                          Edit
                        </Button>
                      ))}
                    <Button variant="ghost" onClick={() => onView(d)}>
                      View team <ArrowUpRight size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      {canEdit && (
        <section className="surface">
          <h3>Add a department function</h3>
          <form
            className="editor-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await onSave(
                  {
                    ...doc,
                    functions: [
                      ...doc.functions.filter((f) => f.name !== newName.trim()),
                      { name: newName.trim(), summary: newSummary.trim() },
                    ],
                  },
                  `Updated function definition: ${newName.trim()}`,
                )
              ) {
                setNewName('');
                setNewSummary('');
              }
            }}
          >
            <div className="form-grid">
              <label htmlFor="departments-field-1">
                Department name
                <Input
                  id="departments-field-1"
                  value={newName}
                  required
                  maxLength={250}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <label htmlFor="departments-field-2">
                Function / responsibilities
                <Textarea
                  id="departments-field-2"
                  value={newSummary}
                  required
                  maxLength={2000}
                  onChange={(e) => setNewSummary(e.target.value)}
                />
              </label>
            </div>
            <div>
              <Button disabled={busy} type="submit">
                Save function definition
              </Button>
            </div>
            <p className="muted">
              To move someone to a new department, edit their employee record or
              import updated employee rows. Editing a function definition does
              not change employees.
            </p>
          </form>
        </section>
      )}
      <section className="surface">
        <div className="section-title">
          <h3>Department change proposals</h3>
          <span className="pill">Reference only · not applied</span>
        </div>
        <p className="muted">
          From “Departments for oct changes”. Confirm effective dates and
          employee assignments with HR before applying any changes. Operations &
          Supply Chain is described as a future function in the source.
        </p>
        <div className="proposal-list">
          {doc.proposals.map((p) => (
            <div key={p.name}>
              <strong>{p.name}</strong>
              <p>{p.summary}</p>
              <small>Roles: {p.roles}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
