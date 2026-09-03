'use client';
import { useState } from 'react';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  approvalStatus,
  currentEvidence,
  issuesFor,
  normalize,
} from '@/lib/organization';
import { controlRows } from '@/lib/exports';
import type { OrgDocument } from '@/lib/model';
import type { WorkspaceSession } from '@/lib/access';

export function AccessReview({
  doc,
  session,
  busy,
  error,
  onAction,
}: {
  doc: OrgDocument;
  session: WorkspaceSession;
  busy: boolean;
  error: string;
  onAction: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [confirmed, setConfirmed] = useState(false),
    [note, setNote] = useState('');
  const [company, setCompany] = useState(doc.company),
    [reviewDate, setReviewDate] = useState(doc.reviewDate);
  const [reviewers, setReviewers] = useState(
    doc.approvers
      .map((a) => `${a.person} | ${a.role}${a.email ? ` | ${a.email}` : ''}`)
      .join('\n'),
  );
  const [externalIndex, setExternalIndex] = useState(''),
    [reference, setReference] = useState('');
  const [externalDate, setExternalDate] = useState(
      new Date().toISOString().slice(0, 10),
    ),
    [localError, setLocalError] = useState('');
  const status = approvalStatus(doc),
    current = currentEvidence(doc),
    issues = issuesFor(doc);
  const isApproved = (person: string, role: string) =>
    current.some(
      (e) =>
        e.kind === 'Stakeholder approval' &&
        normalize(e.person) === normalize(person) &&
        normalize(e.role) === normalize(role),
    );
  const assignments = doc.approvers
    .map((a, index) => ({ ...a, index }))
    .filter((a) => a.email?.toLowerCase() === session.email);
  async function saveSettings(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError('');
    const approvers = reviewers
      .split('\n')
      .filter((v) => v.trim())
      .map((line) => {
        const [person = '', role = '', email = '', ...extra] = line
          .split('|')
          .map((v) => v.trim());
        if (!person || !role || extra.length) return null;
        return {
          person,
          role,
          ...(email ? { email: email.toLowerCase() } : {}),
        };
      });
    if (!approvers.length || approvers.some((a) => !a)) {
      setLocalError(
        'Use Full name | Role | Email, one stakeholder per line. Email is optional for external evidence.',
      );
      return;
    }
    await onAction({
      action: 'review-settings',
      settings: { company: company.trim(), reviewDate, approvers },
    });
  }
  return (
    <div className="content-page">
      <div className="section-intro">
        <h2>
          <ShieldCheck size={20} /> Review & approval
        </h2>
        <p>
          Signed in as {session.email}. Every action is recorded against this
          verified email and the current version.
        </p>
      </div>
      <div className="two-column">
        <section className="surface">
          <h3>Document register · v{doc.version}</h3>
          <dl className="control-register">
            {controlRows(doc)
              .slice(0, 12)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </section>
        <section className="surface">
          <h3>Required stakeholder approvals</h3>
          <p className="muted">
            HR validation comes first. The version becomes approved only after
            every required stakeholder is recorded. Editing the chart starts a
            new draft.
          </p>
          <div className="approver-list">
            {doc.approvers.map((a, index) => (
              <div key={index}>
                <span>
                  <strong>{a.person}</strong>
                  <small>{a.role}</small>
                  <small>
                    {a.email ||
                      'Email not assigned · external approval evidence needed'}
                  </small>
                </span>
                <span
                  className={
                    'pill ' + (isApproved(a.person, a.role) ? 'green' : '')
                  }
                >
                  {isApproved(a.person, a.role) ? 'Approved' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      {session.canValidate || session.canApprove ? (
        <section className="surface">
          <h3>Confirm your review</h3>
          {issues.length > 0 && (
            <p className="notice">
              Resolve {issues.length} items in Data review before validation or
              approval. Ask a chart editor to update the records.
            </p>
          )}
          <label className="check-field">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            I have reviewed version {doc.version} and confirm my action below.
          </label>
          <label htmlFor="access-review-note">
            Review scope / notes
            <Textarea
              id="access-review-note"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="form-actions">
            {session.canValidate && (
              <Button
                disabled={busy || !confirmed || !!issues.length || !!status.hr}
                onClick={() =>
                  void onAction({
                    action: 'validate',
                    confirm: confirmed,
                    note,
                  })
                }
              >
                {status.hr ? (
                  <>
                    <CheckCircle2 size={16} /> HR validated
                  </>
                ) : (
                  'Validate this version as HR'
                )}
              </Button>
            )}
            {session.canApprove &&
              assignments.map((a) => (
                <Button
                  key={a.index}
                  disabled={
                    busy ||
                    !confirmed ||
                    !!issues.length ||
                    !status.hr ||
                    isApproved(a.person, a.role)
                  }
                  onClick={() =>
                    void onAction({
                      action: 'approve',
                      approverIndex: a.index,
                      confirm: confirmed,
                      note,
                    })
                  }
                >
                  {isApproved(a.person, a.role) ? 'Approved' : 'Approve'} ·{' '}
                  {a.role}
                </Button>
              ))}
          </div>
          {session.canApprove && !assignments.length && (
            <p className="muted">
              No stakeholder entry is assigned to your email. HR can assign an
              email below. HR validation is separate from executive / department
              approval.
            </p>
          )}
          <p className="muted">
            The server records your verified email and the time. You cannot sign
            as another stakeholder.
          </p>
        </section>
      ) : (
        <p className="notice">
          Your account can view review records but cannot validate or approve.
          Ask HR or an assigned approver to sign in.
        </p>
      )}
      {session.canManageApprovers && (
        <details className="surface">
          <summary>HR settings · required reviewers</summary>
          <form className="editor-form" onSubmit={saveSettings}>
            <label htmlFor="access-company">
              Company name
              <Input
                id="access-company"
                value={company}
                required
                maxLength={250}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
            <label htmlFor="access-review-date">
              Next monthly review
              <Input
                id="access-review-date"
                type="date"
                value={reviewDate}
                required
                onChange={(e) => setReviewDate(e.target.value)}
              />
            </label>
            <label htmlFor="access-reviewers">
              Required stakeholders
              <Textarea
                id="access-reviewers"
                value={reviewers}
                rows={8}
                onChange={(e) => setReviewers(e.target.value)}
              />
              <small>
                Full name | Role | Email — one per line. Leave email blank for
                email/signature evidence recorded by HR. Direct approvers also
                need an approver role in the server configuration and permission
                in Cloudflare Access.
              </small>
            </label>
            <p className="notice">
              Only change required stakeholders with the appropriate business
              authorization. Saving starts a new draft and invalidates current
              approvals.
            </p>
            <Button type="submit" disabled={busy}>
              Save review settings as a new draft
            </Button>
          </form>
        </details>
      )}
      {session.canManageApprovers && (
        <details className="surface">
          <summary>
            Record stakeholder approval received outside the app
          </summary>
          <p className="notice">
            Use only for genuine email or signed approval for this version. This
            identifies you as the recorder, not the stakeholder as a signed-in
            user. Keep the original evidence in the official archive.
          </p>
          <form
            className="editor-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setLocalError('');
              const a = doc.approvers[Number(externalIndex)];
              if (!a || externalIndex === '') return;
              if (
                await onAction({
                  action: 'external-approval',
                  evidence: {
                    person: a.person,
                    role: a.role,
                    date: externalDate,
                    reference,
                    note,
                  },
                })
              )
                setReference('');
            }}
          >
            <label htmlFor="external-approver">
              Stakeholder
              <NativeSelect
                id="external-approver"
                value={externalIndex}
                required
                onChange={(e) => setExternalIndex(e.target.value)}
              >
                <option value="">Choose stakeholder</option>
                {doc.approvers.map((a, index) => (
                  <option key={index} value={index}>
                    {a.person} · {a.role}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label htmlFor="external-date">
              Original approval date
              <Input
                id="external-date"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={externalDate}
                onChange={(e) => setExternalDate(e.target.value)}
              />
            </label>
            <label htmlFor="external-reference">
              Original email / signed document reference
              <Input
                id="external-reference"
                value={reference}
                required
                maxLength={1900}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <Button
              disabled={busy || !!issues.length || !status.hr}
              type="submit"
            >
              Record external approval evidence
            </Button>
          </form>
        </details>
      )}
      {(error || localError) && (
        <p className="error" role="alert">
          {localError || error}
        </p>
      )}
      <section className="surface">
        <h3>Evidence archive</h3>
        {!doc.evidence.length && (
          <p className="muted">No review evidence recorded yet.</p>
        )}
        {doc.evidence
          .slice()
          .reverse()
          .map((e) => (
            <div className="evidence-row" key={e.id}>
              <span
                className={'pill ' + (e.version === doc.version ? 'green' : '')}
              >
                v{e.version} ·{' '}
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
          ))}
      </section>
    </div>
  );
}
