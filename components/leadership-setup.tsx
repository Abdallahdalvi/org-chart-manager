'use client';
import { useState } from 'react';
import type { OrgDocument } from '@/lib/model';
import { configureLeadership } from '@/lib/leadership';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { NativeSelect } from './ui/native-select';

export function LeadershipSetup({
  doc,
  canEdit,
  busy,
  onSave,
}: {
  doc: OrgDocument;
  canEdit: boolean;
  busy: boolean;
  onSave: (doc: OrgDocument, reason: string) => Promise<boolean>;
}) {
  const active = doc.employees.filter((e) => e.status === 'Active');
  const candidates = active.filter(
    (e) => e.title.trim().toUpperCase() === 'CEO',
  );
  const [editing, setEditing] = useState(false),
    [error, setError] = useState('');
  const [board, setBoard] = useState(
    doc.governance?.boardName || 'Company Board',
  );
  const [ceo, setCeo] = useState(
    doc.governance?.ceoId || (candidates.length === 1 ? candidates[0].id : ''),
  );
  const [executives, setExecutives] = useState(
    active
      .filter((e) =>
        ['CTO', 'COO', 'CSO'].includes(e.title.trim().toUpperCase()),
      )
      .map((e) => e.id),
  );
  return (
    <section className="surface leadership-setup">
      <div className="section-title">
        <h2>Leadership setup</h2>
        {canEdit && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit leadership
          </Button>
        )}
      </div>
      <p className="muted">
        The Board is a governing body, not an employee. Reporting changes are
        saved in the change log.
      </p>
      {!editing ? (
        <p>
          {doc.governance
            ? `${doc.governance.boardName} → ${active.find((e) => e.id === doc.governance?.ceoId)?.name || 'CEO'}`
            : 'No Board configured. Use Edit leadership to connect the CEO and executive team.'}
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            try {
              const next = configureLeadership(doc, board, ceo, executives);
              const names = active
                .filter((p) => executives.includes(p.id))
                .map((p) => `${p.name} (${p.title})`)
                .join('; ');
              if (
                await onSave(
                  next,
                  `Leadership updated: ${board.trim()} → ${active.find((p) => p.id === ceo)?.name}; assigned direct reports: ${names || 'none'}. Other reporting lines preserved.`,
                )
              )
                setEditing(false);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : 'Could not save leadership.',
              );
            }
          }}
        >
          <div className="form-grid">
            <label htmlFor="leadership-board-name">
              Board name
              <Input
                id="leadership-board-name"
                value={board}
                onChange={(e) => setBoard(e.target.value)}
                required
                maxLength={250}
              />
            </label>
            <label htmlFor="leadership-ceo">
              CEO
              <NativeSelect
                id="leadership-ceo"
                value={ceo}
                required
                onChange={(e) => {
                  setCeo(e.target.value);
                  setExecutives((ids) =>
                    ids.filter((id) => id !== e.target.value),
                  );
                }}
              >
                <option value="">Select CEO</option>
                {active.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.title}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <label className="export-field" htmlFor="leadership-direct-reports">
            Assign direct reports to CEO
            <NativeSelect
              id="leadership-direct-reports"
              multiple
              value={executives}
              onChange={(e) =>
                setExecutives(
                  Array.from(e.target.selectedOptions, (o) => o.value),
                )
              }
            >
              {active
                .filter((e) => e.id !== ceo)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.title}
                  </option>
                ))}
            </NativeSelect>
          </label>
          <p className="muted">
            CTO, COO and CSO are preselected. Hold Ctrl / Cmd to change the
            selection. Only selected people are assigned to the CEO; everyone
            else keeps their existing manager. To move someone away from the
            CEO, edit their employee card.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save leadership
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
