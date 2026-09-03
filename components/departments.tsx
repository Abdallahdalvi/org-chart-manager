'use client';
import { useState } from 'react';
import { Layers3, ArrowUpRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { departmentColor, type OrgDocument } from '@/lib/model';
export function Departments({
  doc,
  busy,
  onSave,
  onView,
}: {
  doc: OrgDocument;
  busy: boolean;
  onSave: (doc: OrgDocument, reason: string) => Promise<boolean>;
  onView: (department: string) => void;
}) {
  const [name, setName] = useState(''),
    [summary, setSummary] = useState('');
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
      <div className="department-grid">
        {departments.map((d) => (
          <section
            className="department-card"
            key={d}
            style={{ '--dept': departmentColor(d) } as React.CSSProperties}
          >
            <div>
              <span className="department-symbol">
                <Layers3 size={19} />
              </span>
              <span className="pill">
                {
                  doc.employees.filter(
                    (e) => e.status === 'Active' && e.department === d,
                  ).length
                }{' '}
                people
              </span>
            </div>
            <h3>{d}</h3>
            <p>
              {doc.functions.find((f) => f.name === d)?.summary ||
                'Function description awaiting HR input.'}
            </p>
            <footer>
              <Button
                variant="link"
                onClick={() => {
                  setName(d);
                  setSummary(
                    doc.functions.find((f) => f.name === d)?.summary || '',
                  );
                }}
              >
                Edit function
              </Button>
              <Button variant="ghost" onClick={() => onView(d)}>
                View team <ArrowUpRight size={14} />
              </Button>
            </footer>
          </section>
        ))}
      </div>
      <section className="surface">
        <h3>Add or edit a function</h3>
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await onSave(
                {
                  ...doc,
                  functions: [
                    ...doc.functions.filter((f) => f.name !== name.trim()),
                    { name: name.trim(), summary: summary.trim() },
                  ],
                },
                `Updated function definition: ${name.trim()}`,
              )
            ) {
              setName('');
              setSummary('');
            }
          }}
        >
          <div className="form-grid">
            <label htmlFor="departments-field-1">
              Department name
              <Input
                id="departments-field-1"
                value={name}
                required
                maxLength={250}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label htmlFor="departments-field-2">
              Function / responsibilities
              <Textarea
                id="departments-field-2"
                value={summary}
                required
                maxLength={2000}
                onChange={(e) => setSummary(e.target.value)}
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
            import updated employee rows. Editing a function definition does not
            change employees.
          </p>
        </form>
      </section>
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
