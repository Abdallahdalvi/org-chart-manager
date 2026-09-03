'use client';
import { useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Plus,
  FileCheck2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import type { OrgDocument, Evidence } from '@/lib/model';
import {
  approvalStatus,
  currentEvidence,
  issuesFor,
  normalize,
} from '@/lib/organization';
import { controlRows } from '@/lib/exports';
export function DocumentControl({
  doc,
  actor,
  busy,
  onSave,
  onEvidence,
}: {
  doc: OrgDocument;
  actor: string;
  busy: boolean;
  onSave: (doc: OrgDocument, description: string) => Promise<boolean>;
  onEvidence: (e: Evidence) => Promise<boolean>;
}) {
  const [company, setCompany] = useState(doc.company),
    [reviewDate, setReviewDate] = useState(doc.reviewDate),
    [approvers, setApprovers] = useState(
      doc.approvers.map((a) => a.person + ' | ' + a.role).join('\n'),
    );
  const [kind, setKind] = useState<Evidence['kind']>('HR validation'),
    [person, setPerson] = useState(''),
    [role, setRole] = useState('HR'),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [reference, setReference] = useState(''),
    [note, setNote] = useState(''),
    [error, setError] = useState('');
  const status = approvalStatus(doc),
    issues = issuesFor(doc),
    current = currentEvidence(doc);
  async function settings(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const list = approvers
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const index = line.indexOf('|');
        return {
          person: index >= 0 ? line.slice(0, index).trim() : '',
          role: index >= 0 ? line.slice(index + 1).trim() : '',
        };
      });
    if (!list.length || list.some((a) => !a.person || !a.role)) {
      setError(
        'Add each approver as “Full name | Role”, one per line. At least one is required.',
      );
      return;
    }
    if (
      new Set(list.map((a) => normalize(a.person + '|' + a.role))).size !==
      list.length
    ) {
      setError('The approver list contains duplicate entries.');
      return;
    }
    await onSave(
      { ...doc, company: company.trim(), reviewDate, approvers: list },
      'Updated document-control settings and required stakeholder list.',
    );
  }
  async function record(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!actor.trim()) {
      setError('Enter your name in the top bar before recording evidence.');
      return;
    }
    const saved = await onEvidence({
      id: crypto.randomUUID(),
      version: doc.version,
      kind,
      person,
      role,
      date,
      reference,
      note,
      recordedBy: actor,
    });
    if (saved) {
      setReference('');
      setNote('');
    }
  }
  return (
    <div className="content-page">
      <div className="section-intro">
        <h2>HR records</h2>
        <p>
          Marketing maintains the master. HR validates the data. Executives and
          department heads approve their areas.
        </p>
      </div>
      <div className="workflow">
        <div className="complete">
          <CheckCircle2 />
          <strong>1. Prepare</strong>
          <span>Editable master · v{doc.version}</span>
        </div>
        <div className={status.hr ? 'complete' : ''}>
          {status.hr ? <CheckCircle2 /> : <Clock3 />}
          <strong>2. HR validation</strong>
          <span>
            {status.hr
              ? `${status.hr.person} · ${status.hr.date}`
              : `${issues.length} review items to resolve`}
          </span>
        </div>
        <div className={status.approved ? 'complete' : ''}>
          {status.approved ? <CheckCircle2 /> : <Clock3 />}
          <strong>3. Stakeholder approval</strong>
          <span>
            {doc.approvers.length - status.pending.length} of{' '}
            {doc.approvers.length} recorded
          </span>
        </div>
      </div>
      <div className="two-column">
        <section className="surface">
          <h3>
            <FileCheck2 size={18} />
            Document register
          </h3>
          <dl className="control-register">
            {controlRows(doc)
              .slice(0, 12)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {/date/i.test(label) && Number.isFinite(Date.parse(value))
                      ? new Date(value).toLocaleDateString('en-GB')
                      : value}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
        <section className="surface">
          <h3>
            <ShieldCheck size={18} />
            Required approvals
          </h3>
          <p className="muted">
            Initial list is based on executive, manager, head and controller
            roles. HR should confirm the required stakeholders below.
          </p>
          <div className="approver-list">
            {doc.approvers.map((a) => {
              const recorded = current.find(
                (e) =>
                  e.kind === 'Stakeholder approval' &&
                  normalize(e.person) === normalize(a.person) &&
                  normalize(e.role) === normalize(a.role),
              );
              return (
                <div key={a.person + '|' + a.role}>
                  <span className={recorded ? 'green' : 'muted'}>
                    {recorded ? (
                      <CheckCircle2 size={17} />
                    ) : (
                      <Clock3 size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{a.person}</strong>
                    <small>{a.role}</small>
                  </span>
                  <span className={'pill ' + (recorded ? 'green' : '')}>
                    {recorded ? 'Recorded' : 'Pending'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <div className="two-column">
        <section className="surface">
          <h3>Document settings</h3>
          <form onSubmit={settings} className="editor-form">
            <label htmlFor="document-control-field-1">
              Company name
              <Input
                id="document-control-field-1"
                required
                maxLength={250}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
            <label htmlFor="document-control-field-2">
              Next monthly review
              <Input
                id="document-control-field-2"
                type="date"
                required
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
              />
              <small>
                Also review whenever there is a significant organizational
                change. This is a due-date tracker, not an email reminder.
              </small>
            </label>
            <label htmlFor="document-control-field-3">
              Required stakeholders
              <Textarea
                id="document-control-field-3"
                rows={10}
                value={approvers}
                onChange={(e) => setApprovers(e.target.value)}
              />
              <small>One per line: Full name | Role</small>
            </label>
            <Button type="submit" disabled={busy}>
              Save settings as a new draft
            </Button>
          </form>
        </section>
        <section className="surface">
          <h3>
            <Plus size={18} />
            Record review evidence
          </h3>
          <p className="notice">
            This records evidence received elsewhere; it does not send approval
            requests or create digital signatures. Keep original emails or
            signed documents in your official archive. Names entered here are
            not identity-verified.
          </p>
          <form className="editor-form" onSubmit={record}>
            <label htmlFor="document-control-field-4">
              Evidence type
              <NativeSelect
                id="document-control-field-4"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as Evidence['kind']);
                  setPerson('');
                  setRole(e.target.value === 'HR validation' ? 'HR' : '');
                }}
              >
                <option>HR validation</option>
                <option>Stakeholder approval</option>
              </NativeSelect>
            </label>
            {kind === 'HR validation' ? (
              <div className="form-grid">
                <label htmlFor="document-control-field-5">
                  Validated by
                  <Input
                    id="document-control-field-5"
                    required
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                  />
                </label>
                <label htmlFor="document-control-field-6">
                  Role
                  <Input
                    id="document-control-field-6"
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <label htmlFor="document-control-field-7">
                Approver
                <NativeSelect
                  id="document-control-field-7"
                  required
                  value={person + '|' + role}
                  onChange={(e) => {
                    const index = Number(
                      e.target.selectedOptions[0]?.dataset.index,
                    );
                    const a = doc.approvers[index];
                    if (a) {
                      setPerson(a.person);
                      setRole(a.role);
                    }
                  }}
                >
                  <option value="|">Choose a required stakeholder</option>
                  {doc.approvers.map((a, i) => (
                    <option
                      key={i}
                      data-index={i}
                      value={a.person + '|' + a.role}
                    >
                      {a.person} · {a.role}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
            <label htmlFor="document-control-field-8">
              Validation / approval date
              <Input
                id="document-control-field-8"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label htmlFor="document-control-field-9">
              Original evidence reference
              <Input
                id="document-control-field-9"
                required
                maxLength={2000}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Email message ID, archived file path, or workflow URL"
              />
            </label>
            <label htmlFor="document-control-field-10">
              Scope and notes
              <Textarea
                id="document-control-field-10"
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Areas reviewed, approval conditions, archive location…"
              />
            </label>
            {issues.length > 0 && (
              <p className="notice">
                Resolve the {issues.length} items in Data review before
                recording validation or approval.
              </p>
            )}
            {error && <p className="error">{error}</p>}
            <Button
              type="submit"
              disabled={
                busy ||
                issues.length > 0 ||
                (kind === 'Stakeholder approval' && !status.hr)
              }
            >
              Record evidence for v{doc.version}
            </Button>
          </form>
        </section>
      </div>
      <section className="surface">
        <h3>Evidence archive</h3>
        {!doc.evidence.length ? (
          <p className="muted">
            No evidence has been recorded. Approval fields will remain pending
            until actual evidence is provided.
          </p>
        ) : (
          doc.evidence
            .slice()
            .reverse()
            .map((e) => (
              <div className="evidence-row" key={e.id}>
                <span
                  className={
                    'pill ' + (e.version === doc.version ? 'green' : '')
                  }
                >
                  v{e.version}{' '}
                  {e.version === doc.version ? 'Current' : 'Historical'}
                </span>
                <strong>
                  {e.kind} — {e.person}
                </strong>
                <p>
                  {e.role} · {e.date} · Recorded by {e.recordedBy}
                </p>
                <p>Reference: {e.reference}</p>
                {e.note && <p>{e.note}</p>}
              </div>
            ))
        )}
      </section>
    </div>
  );
}
