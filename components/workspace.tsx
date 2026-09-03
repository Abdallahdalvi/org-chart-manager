/* oxlint-disable react/react-compiler -- This workspace is not compiled with React Compiler; its optional lint analysis crashes on the nested async loader. Standard hook checks remain enabled. */
/* oxlint-disable next/no-html-link-for-pages -- Authentication links need full navigation through Cloudflare; the standalone build has no Next router. */
'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Network,
  Users,
  Layers3,
  History,
  Upload,
  Plus,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Minus,
  Maximize2,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { emptyDocument } from '@/lib/empty-document';
import {
  initials,
  departmentColor,
  type Employee,
  type OrgDocument,
} from '@/lib/model';
import {
  activeForest,
  issuesFor,
  approvalStatus,
  emptyEmployee,
  documentSchema,
} from '@/lib/organization';
import { download, filename } from '@/lib/exports';
import { EmployeeEditor } from './employee-editor';
import { ImportDialog } from './import-dialog';
import { ExportDialog } from './export-dialog';
import { DocumentControl } from './document-control';
import { Departments } from './departments';
import { AccessReview } from './access-review';
import { legacySession, type WorkspaceSession } from '@/lib/access';
type Page =
  | 'Organization chart'
  | 'Employees'
  | 'Departments'
  | 'Change log'
  | 'Review & approval';
const navigation = [
  { icon: Network, label: 'Organization chart' },
  { icon: Users, label: 'Employees' },
  { icon: Layers3, label: 'Departments' },
  { icon: History, label: 'Change log' },
] as const;
export default function Workspace({
  requireSession = false,
}: {
  requireSession?: boolean;
}) {
  const [session, setSession] = useState<WorkspaceSession | null>(
    requireSession ? null : legacySession,
  );
  const canEdit = !!session?.canEdit;
  const verified = session?.mode === 'cloudflare';
  const [doc, setDoc] = useState<OrgDocument>(emptyDocument),
    [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState<Page>('Organization chart'),
    [actor, setActor] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [department, setDepartment] = useState(''),
    [statusFilter, setStatusFilter] = useState('Active'),
    [editing, setEditing] = useState<{
      employee: Employee;
      isNew: boolean;
    } | null>(null),
    [importOpen, setImportOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [reviewOpen, setReviewOpen] = useState(false),
    [restore, setRestore] = useState<OrgDocument | null>(null),
    [revisions, setRevisions] = useState<
      { revision: number; version: string; date: string }[]
    >([]);
  const restoreInput = useRef<HTMLInputElement>(null),
    actorInput = useRef<HTMLInputElement>(null),
    stateRef = useRef({ doc, page, canEdit });
  stateRef.current = { doc, page, canEdit };
  const issues = useMemo(() => issuesFor(doc), [doc]),
    status = approvalStatus(doc),
    { all } = activeForest(doc),
    departments = [...new Set(all.map((e) => e.department))].sort(),
    functionalCount = all.reduce((n, e) => n + e.functionalIds.length, 0);
  const load = useCallback(async () => {
    try {
      if (requireSession) {
        const response = await fetch('/api/session', {
          cache: 'no-store',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!response.ok)
          throw new Error(
            'Sign-in expired or access denied. Reload this page to sign in again.',
          );
        const identity = (await response.json()) as WorkspaceSession;
        setSession(identity);
        if (identity.mode === 'cloudflare') setActor(identity.email);
      }
      const r = await fetch('/api/document', {
          cache: 'no-store',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        }),
        data = (await r.json()) as {
          document: OrgDocument;
          revision: number;
          error: string;
        };
      if (!r.ok) throw new Error(data.error);
      setDoc(documentSchema.parse(data.document));
      setRevision(data.revision);
      setLoaded(true);
      setError('');
    } catch (e) {
      setLoaded(false);
      setError(
        e instanceof Error
          ? e.message
          : 'Your saved chart could not be loaded. Retry to reconnect; no data has been changed.',
      );
    }
  }, [requireSession]);
  useEffect(() => {
    try {
      setActor(localStorage.getItem('ubiqedge-editor-name') || '');
    } catch {}
    void load();
  }, [load]);
  useEffect(() => {
    if (page === 'Change log' && loaded)
      fetch('/api/revisions', {
        cache: 'no-store',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error('Unable to load revisions.');
          setRevisions(
            data as { revision: number; version: string; date: string }[],
          );
        })
        .catch(() =>
          setError('Saved versions could not be loaded. Please retry.'),
        );
  }, [page, revision, loaded]);
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    for (const tool of [
      {
        name: 'read_organization_summary',
        title: 'Read organization summary',
        description:
          'Read active counts, current version, approval state and unresolved HR review items in the visible workspace.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: (input: unknown) => {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw new Error('No parameters accepted.');
          const d = stateRef.current.doc;
          return {
            company: d.company,
            version: d.version,
            active: d.employees.filter((e) => e.status === 'Active').length,
            approved: approvalStatus(d).approved,
            reviewItems: issuesFor(d),
          };
        },
      },
      {
        name: 'start_employee_edit',
        title: 'Open an employee editor',
        description:
          'Open the visible employee edit dialog by stable employee ID. This only starts editing; it does not save changes.',
        inputSchema: {
          type: 'object',
          properties: { employeeId: { type: 'string' } },
          required: ['employeeId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          if (!stateRef.current.canEdit)
            throw new Error('Your account cannot edit this chart.');
          if (
            !input ||
            typeof input !== 'object' ||
            !('employeeId' in input) ||
            typeof input.employeeId !== 'string' ||
            Object.keys(input).length !== 1
          )
            throw new Error('A single employeeId is required.');
          const e = stateRef.current.doc.employees.find(
            (e) => e.id === input.employeeId,
          );
          if (!e) throw new Error('Employee not found.');
          setEditing({ employee: e, isNew: false });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          return { employeeId: e.id, editorOpened: true, saved: false };
        },
      },
    ])
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    return () => lifecycle.abort();
  }, []);
  async function persist(payload: Record<string, unknown>) {
    if (!loaded) {
      setError('Load the saved workspace before editing.');
      return false;
    }
    if (!actor.trim()) {
      setError(
        'Please enter your name in the top bar for the change log, then save again.',
      );
      actorInput.current?.focus();
      return false;
    }
    if (['save', 'restore'].includes(String(payload.action)) && !canEdit) {
      setError('Your account cannot edit or restore this chart.');
      return false;
    }
    if (busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/document', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({ ...payload, revision, actor }),
        }),
        data = (await response.json()) as {
          document: OrgDocument;
          revision: number;
          error: string;
        };
      if (!response.ok)
        throw new Error(
          data.error ||
            'Unable to save. Your session may have expired; reload to sign in again.',
        );
      setDoc(documentSchema.parse(data.document));
      setRevision(data.revision);
      setNotice(`Saved to the workspace · v${data.document.version}`);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The change was not saved. Please retry.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const save = (next: OrgDocument, description: string) =>
    persist({ action: 'save', document: next, description });
  function updateActor(value: string) {
    if (verified) return;
    setActor(value);
    try {
      localStorage.setItem('ubiqedge-editor-name', value);
    } catch {}
  }
  async function saveEmployee(e: Employee, description: string) {
    const employees = editing?.isNew
      ? [...doc.employees, e]
      : doc.employees.map((p) => (p.id === e.id ? e : p));
    return save({ ...doc, employees }, description);
  }
  async function readMaster(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1500000)
        throw new Error(
          'Master backup exceeds the 1.5 MB supported workspace size.',
        );
      setRestore(documentSchema.parse(JSON.parse(await file.text())));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'This is not a valid master backup.',
      );
    }
  }
  const filtered = doc.employees.filter(
    (e) =>
      (!department || e.department === department) &&
      (!statusFilter || e.status === statusFilter) &&
      `${e.name} ${e.title} ${e.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const navigate = (p: Page) => {
    setPage(p);
    setSearch('');
    setDepartment('');
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand company-brand">
          {/* Native image is shared with the standalone CasaOS build, which has no Next image runtime. */}
          {/* oxlint-disable-next-line next/no-img-element */}
          <img
            src="/ubiqedge-logo.jpg"
            width="180"
            height="129"
            alt="Ubiqedge Technology Pvt Ltd"
          />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            ...navigation,
            ...(verified
              ? [{ icon: ShieldCheck, label: 'Review & approval' } as const]
              : []),
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              className={page === label ? 'active' : ''}
              onClick={() => navigate(label)}
              title={label}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Employees' && <small>{doc.employees.length}</small>}
            </button>
          ))}
        </nav>
        <div className="nav-label">TOOLS</div>
        <nav>
          <button onClick={() => setReviewOpen(true)} title="Data review">
            <ShieldCheck size={18} />
            <span>Data review</span>
            <small className={issues.length ? 'count-alert' : ''}>
              {issues.length}
            </small>
          </button>
        </nav>
        <details className="sidebar-tools">
          <summary>Backup & restore</summary>
          <nav>
            <button
              onClick={() =>
                download(JSON.stringify(doc, null, 2), filename(doc, 'json'))
              }
              title="Save master backup"
              disabled={!loaded || busy}
            >
              <Download size={18} />
              <span>Save master backup</span>
            </button>
            <button
              onClick={() => restoreInput.current?.click()}
              disabled={!loaded || busy || !canEdit}
              title="Restore master"
            >
              <FolderOpen size={18} />
              <span>Restore master</span>
            </button>
          </nav>
        </details>
        <input
          ref={restoreInput}
          type="file"
          accept=".json"
          className="sr-only"
          onChange={(e) => {
            void readMaster(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="sidebar-bottom">
          <ShieldCheck size={18} />
          <div>
            Editable company chart
            <small>Import → review → save</small>
            <small>Changes are recorded automatically</small>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span> <strong>{page}</strong>
          </span>
          <div className="top-meta">
            <span
              className={'status-dot ' + (status.approved ? 'approved' : '')}
            />
            <span>
              {status.approved
                ? 'Approved'
                : status.hr
                  ? 'HR validated'
                  : 'Draft'}{' '}
              · v{doc.version}
            </span>
            {verified ? (
              <div className="signed-in-identity">
                <span>
                  <strong>{session.email}</strong>
                  <small>
                    {session.roles
                      .map((r) => (r === 'hr' ? 'HR reviewer' : r))
                      .join(' · ')}
                  </small>
                </span>
                <a
                  href="/cdn-cgi/access/logout"
                  title="Signs you out of Cloudflare Access across your apps"
                >
                  Sign out
                </a>
              </div>
            ) : (
              <label htmlFor="workspace-field-1" className="editor-identity">
                <span>Your name</span>
                <Input
                  id="workspace-field-1"
                  ref={actorInput}
                  aria-label="Your name for the change log"
                  maxLength={150}
                  value={actor}
                  placeholder="Enter your name"
                  onChange={(e) => updateActor(e.target.value)}
                />
              </label>
            )}
          </div>
        </header>
        {error && (
          <div className="global-alert" role="alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
            {!loaded && (
              <Button variant="outline" onClick={() => void load()}>
                <RefreshCw size={14} />
                Retry
              </Button>
            )}
            {requireSession && <a href="/">Sign in / reload</a>}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss error"
              onClick={() => setError('')}
            >
              <X size={15} />
            </Button>
          </div>
        )}
        {notice && (
          <output className="save-notice" aria-live="polite">
            <CheckCircle2 size={14} />
            {notice}
            <button
              onClick={() => setNotice('')}
              aria-label="Dismiss save message"
            >
              <X size={12} />
            </button>
          </output>
        )}
        <section className="page-heading">
          <div>
            <h1>{page}</h1>
            <p>
              {page === 'Organization chart'
                ? 'A clear view of our people, teams, and how we work together.'
                : page === 'Employees'
                  ? 'One employee record. Always connected to the right team.'
                  : page === 'Departments'
                    ? 'A clear purpose for every team.'
                    : page === 'Review & approval'
                      ? 'Review the current version and sign in with the right permissions.'
                      : 'Who changed what, when—with previous versions kept safely.'}
            </p>
          </div>
          <div className="actions">
            <Button
              variant="outline"
              disabled={!loaded || busy || !canEdit}
              onClick={() => {
                setError('');
                setImportOpen(true);
              }}
            >
              <Upload />
              Import sheets
            </Button>
            <Button
              disabled={!loaded || busy || !canEdit}
              onClick={() => {
                setError('');
                setEditing({ employee: emptyEmployee(), isNew: true });
              }}
            >
              <Plus />
              Add employee
            </Button>
          </div>
        </section>
        <div className="summary-row">
          <span>
            <Users size={17} />
            <b>{all.length}</b>active employees
          </span>
          <span>
            <Layers3 size={17} />
            <b>{departments.length}</b>departments
          </span>
          <span>
            <Network size={17} />
            <b>{functionalCount}</b>functional links
          </span>
          <button className="summary-note" onClick={() => setReviewOpen(true)}>
            {issues.length ? (
              <>
                <AlertTriangle size={13} />
                {issues.length} items for HR review <ArrowRight size={12} />
              </>
            ) : (
              <>
                <CheckCircle2 size={13} />
                No hierarchy issues
              </>
            )}
          </button>
        </div>
        {page === 'Organization chart' && (
          <Chart
            doc={doc}
            search={search}
            setSearch={setSearch}
            department={department}
            setDepartment={setDepartment}
            onEdit={(e) => setEditing({ employee: e, isNew: false })}
            canEdit={canEdit}
            onExport={() => setExportOpen(true)}
            onDirectory={() => navigate('Employees')}
          />
        )}
        {page === 'Employees' && (
          <div className="content-page">
            <section className="surface employee-table">
              <div className="list-toolbar">
                <label htmlFor="workspace-field-2" className="search-field">
                  <Search size={16} />
                  <Input
                    id="workspace-field-2"
                    aria-label="Search employees"
                    placeholder="Search name, role, or ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <NativeSelect
                  aria-label="Department filter"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  <option value="">All departments</option>
                  {[
                    ...new Set(
                      doc.employees.map((e) => e.department).filter(Boolean),
                    ),
                  ]
                    .sort()
                    .map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Employee status filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                  <option>Needs review</option>
                  <option value="">All records</option>
                </NativeSelect>
                <span className="muted">{filtered.length} records</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      'Employee',
                      'Designation',
                      'Department',
                      'Reports to',
                      'Status',
                      '',
                    ].map((h, i) => (
                      <TableHead key={i}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="employee-cell">
                          <span className="mini-avatar">
                            {initials(e.name)}
                          </span>
                          <span>
                            <strong>{e.name}</strong>
                            <small>Employee ID {e.id}</small>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{e.title || 'Not supplied'}</TableCell>
                      <TableCell>{e.department || 'Not supplied'}</TableCell>
                      <TableCell>
                        {doc.employees.find((p) => p.id === e.managerId)
                          ?.name ||
                          e.managerReference ||
                          (e.rootConfirmed ? 'Top level' : 'Not confirmed')}
                        {e.functionalIds.length > 0 && (
                          <small className="functional-text">
                            Functional:{' '}
                            {e.functionalIds
                              .map(
                                (id) =>
                                  doc.employees.find((p) => p.id === id)
                                    ?.name || id,
                              )
                              .join('; ')}
                          </small>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            'pill ' +
                            (e.status === 'Active'
                              ? 'green'
                              : e.status === 'Needs review'
                                ? 'amber'
                                : '')
                          }
                        >
                          {e.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          disabled={!canEdit}
                          onClick={() =>
                            setEditing({ employee: e, isNew: false })
                          }
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!filtered.length && (
                <div className="empty-state">
                  <Users />
                  <h3>No matching employees</h3>
                  <p>Try another search, department, or status.</p>
                </div>
              )}
            </section>
          </div>
        )}
        {page === 'Departments' && (
          <Departments
            key={doc.version}
            doc={doc}
            busy={busy || !loaded || !canEdit}
            canEdit={canEdit}
            onSave={save}
            onView={(d) => {
              setDepartment(d);
              setSearch('');
              setStatusFilter('Active');
              setPage('Employees');
            }}
          />
        )}
        {page === 'Review & approval' && verified && (
          <AccessReview
            key={doc.version + doc.evidence.length}
            doc={doc}
            session={session}
            busy={busy || !loaded}
            error={error}
            onAction={persist}
          />
        )}
        {page === 'Change log' && (
          <div className="content-page">
            <section className="surface">
              <div className="section-title">
                <h3>Revision history</h3>
                <Button variant="outline" onClick={() => setExportOpen(true)}>
                  <Download size={15} />
                  Export register
                </Button>
              </div>
              <p className="muted">
                Every saved edit includes a version, date, description, and the
                person who updated it.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Updated by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.history.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="pill">v{h.version}</span>
                      </TableCell>
                      <TableCell>{formatDate(h.date)}</TableCell>
                      <TableCell className="wrap-cell">
                        {h.description}
                      </TableCell>
                      <TableCell>{h.by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
            <details className="surface">
              <summary>Previous versions & recovery</summary>
              <p className="muted">
                Each successful save is stored as a separate snapshot. Download
                an earlier snapshot for reference or restore it as a new draft.
              </p>
              <div className="saved-versions">
                {revisions.map((r) => (
                  <div key={r.revision}>
                    <span>
                      <strong>v{r.version}</strong>
                      <small>
                        {formatDate(r.date)} · Save {r.revision}
                      </small>
                    </span>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await fetch(
                            '/api/revisions?revision=' + r.revision,
                            {
                              headers: { 'X-Requested-With': 'XMLHttpRequest' },
                            },
                          );
                          if (!response.ok)
                            throw new Error(
                              'This snapshot could not be downloaded.',
                            );
                          download(
                            await response.text(),
                            `${doc.company}-v${r.version}-save${r.revision}.json`,
                          );
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      <Download size={14} />
                      Master
                    </Button>
                  </div>
                ))}
              </div>
              {!revisions.length && (
                <p className="muted">
                  Your first saved edit will create the first stored snapshot.
                </p>
              )}
            </details>
            {!verified && (
              <details className="surface hr-details">
                <summary>
                  HR validation & approvals{' '}
                  <span className="muted">
                    Required by HR · expand when ready
                  </span>
                </summary>
                <p className="muted">
                  HR requested these records in sections 5 and 6. They do not
                  stop you editing or downloading a draft. New changes need
                  fresh validation; previous evidence is retained.
                </p>
                <DocumentControl
                  key={doc.version + doc.evidence.length}
                  doc={doc}
                  actor={actor}
                  busy={busy || !loaded}
                  onSave={save}
                  onEvidence={(e) =>
                    persist({ action: 'evidence', evidence: e })
                  }
                />
              </details>
            )}
          </div>
        )}
        <div className="workspace-footer">
          <span>
            {loaded
              ? busy
                ? 'Saving changes…'
                : 'Workspace connected · changes save on confirmation'
              : 'Connecting to saved workspace…'}
          </span>
          <span>
            Next review:{' '}
            {doc.reviewDate ? formatDate(doc.reviewDate) : 'To be set'}
            {doc.reviewDate &&
            doc.reviewDate < new Date().toISOString().slice(0, 10)
              ? ' · OVERDUE'
              : ''}
          </span>
        </div>
      </main>
      {editing && canEdit && (
        <EmployeeEditor
          employee={editing.employee}
          isNew={editing.isNew}
          doc={doc}
          busy={busy || !loaded}
          actor={actor}
          actorReadOnly={verified}
          onActor={updateActor}
          saveError={error}
          onClose={() => setEditing(null)}
          onSave={saveEmployee}
        />
      )}
      {importOpen && canEdit && (
        <ImportDialog
          doc={doc}
          busy={busy || !loaded}
          actor={actor}
          actorReadOnly={verified}
          onActor={updateActor}
          saveError={error}
          onClose={() => setImportOpen(false)}
          onApply={save}
        />
      )}
      {exportOpen && (
        <ExportDialog doc={doc} onClose={() => setExportOpen(false)} />
      )}
      {reviewOpen && (
        <Dialog open onOpenChange={(open) => !open && setReviewOpen(false)}>
          <DialogContent className="review-dialog">
            <DialogTitle>HR data review</DialogTitle>
            <DialogDescription>
              No reporting relationship is guessed. Resolve these items before
              validating or approving the chart.
            </DialogDescription>
            {issues.length ? (
              <div className="issue-list">
                {issues.map((issue) => (
                  <div key={issue.id}>
                    <AlertTriangle size={17} />
                    <p>{issue.message}</p>
                    <Button
                      variant="outline"
                      disabled={!canEdit}
                      onClick={() => {
                        const e = doc.employees.find(
                          (e) => e.id === issue.employeeId,
                        );
                        if (e) {
                          setReviewOpen(false);
                          setEditing({ employee: e, isNew: false });
                        }
                      }}
                    >
                      Resolve
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <CheckCircle2 />
                <h3>Ready for HR validation</h3>
                <p>
                  No missing managers, cycles, or unresolved records detected.
                  HR must still validate the underlying facts.
                </p>
              </div>
            )}
            <div className="notice">
              Current data keeps four executives at separate roots because their
              source manager is “NA”. The inactive-tab entries for Meer and
              Shyaan and the incomplete Ashish record are not treated as
              confirmed active employees.
            </div>
          </DialogContent>
        </Dialog>
      )}
      {restore && canEdit && (
        <Dialog open onOpenChange={(open) => !open && setRestore(null)}>
          <DialogContent className="restore-dialog">
            <DialogTitle>Restore master as a new draft?</DialogTitle>
            <DialogDescription>
              This replaces the current employee data and settings with the
              selected backup. The current master remains in saved history.
              Imported evidence is retained as historical references and needs
              fresh validation.
              {verified &&
                ' The current HR-controlled reviewer list is kept; backups cannot replace it.'}
            </DialogDescription>
            <p>
              <strong>
                {restore.company} · v{restore.version}
              </strong>
              <br />
              {restore.employees.length} employee records ·{' '}
              {restore.history.length} history entries
            </p>
            <label htmlFor="restore-editor-name">
              Your name for the change log
              <Input
                id="restore-editor-name"
                value={actor}
                readOnly={verified}
                onChange={(e) => updateActor(e.target.value)}
                maxLength={150}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button variant="outline" onClick={() => setRestore(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy || !loaded || !actor.trim()}
                onClick={async () => {
                  if (
                    await persist({
                      action: 'restore',
                      document: restore,
                      description: `Restored master backup ${restore.company} v${restore.version} as a new draft.`,
                    })
                  )
                    setRestore(null);
                }}
              >
                Restore as new draft
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : value;
};
function Chart({
  doc,
  search,
  setSearch,
  department,
  setDepartment,
  onEdit,
  onExport,
  onDirectory,
  canEdit,
}: {
  doc: OrgDocument;
  search: string;
  setSearch: (s: string) => void;
  department: string;
  setDepartment: (s: string) => void;
  onEdit: (e: Employee) => void;
  onExport: () => void;
  onDirectory: () => void;
  canEdit: boolean;
}) {
  const { all, roots } = useMemo(() => activeForest(doc), [doc]),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [zoom, setZoom] = useState(0.9),
    [functional, setFunctional] = useState(true),
    [paths, setPaths] = useState<string[]>([]);
  const canvas = useRef<HTMLDivElement>(null),
    grid = useRef<HTMLDivElement>(null);
  const filtered = !!search || !!department;
  const visible = new Set<string>();
  for (const e of all)
    if (
      (!department || e.department === department) &&
      `${e.name} ${e.title} ${e.id}`
        .toLowerCase()
        .includes(search.toLowerCase())
    ) {
      let current: Employee | undefined = e;
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        visible.add(current.id);
        current = all.find((p) => p.id === current!.managerId);
      }
    }
  const displayedRoots = roots.filter((e) => visible.has(e.id)),
    rootWidth = Math.max(260, displayedRoots.length * 260 + 10);
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    function measure() {
      if (!functional) {
        setPaths([]);
        return;
      }
      const root = element!.getBoundingClientRect(),
        cards = Array.from(
          element!.querySelectorAll<HTMLElement>('[data-employee]'),
        );
      const map = new Map(
        cards.map((el) => [el.dataset.employee!, el.getBoundingClientRect()]),
      );
      const lines: string[] = [];
      for (const e of all) {
        const child = map.get(e.id);
        if (!child) continue;
        for (const id of e.functionalIds) {
          const parent = map.get(id);
          if (!parent) continue;
          const sx = (parent.right - root.left) / zoom,
            sy = (parent.top + parent.height / 2 - root.top) / zoom,
            tx = (child.right - root.left) / zoom,
            ty = (child.top + child.height / 2 - root.top) / zoom;
          const bend = Math.max(sx, tx) + 14;
          lines.push(
            `M ${sx} ${sy} C ${bend} ${sy}, ${bend} ${ty}, ${tx} ${ty}`,
          );
        }
      }
      setPaths(lines);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const frame = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [doc, all, expanded, zoom, search, department, functional]);
  function card(e: Employee, head: boolean) {
    const isMatch =
      (!department || e.department === department) &&
      `${e.name} ${e.title} ${e.id}`
        .toLowerCase()
        .includes(search.toLowerCase());
    return (
      <button
        data-employee={e.id}
        className={
          'person-card ' +
          (head ? 'executive ' : '') +
          (filtered && !isMatch ? 'ancestor-card' : '')
        }
        style={
          { '--dept': departmentColor(e.department) } as React.CSSProperties
        }
        onClick={() => onEdit(e)}
        disabled={!canEdit}
        title={`${canEdit ? 'Edit' : 'View'} ${e.name}`}
      >
        <span className="avatar">{initials(e.name)}</span>
        <span className="person-info">
          <span className="person-title">{e.title}</span>
          <strong>{e.name}</strong>
          <span className="department-tag">{e.department}</span>
          {head && !e.rootConfirmed && (
            <span className="root-note">Reporting line to be confirmed</span>
          )}
          {functional && e.functionalIds.length > 0 && (
            <span className="functional-text">
              ↗{' '}
              {e.functionalIds
                .map((id) => doc.employees.find((p) => p.id === id)?.name || id)
                .join('; ')}
            </span>
          )}
        </span>
      </button>
    );
  }
  function children(
    id: string,
    depth: number,
    seen: Set<string>,
  ): React.ReactNode {
    if (seen.has(id) || depth > 30) return null;
    const nextSeen = new Set(seen).add(id);
    const reports = all.filter((e) => e.managerId === id && visible.has(e.id));
    if (!reports.length) return null;
    return (
      <div className="reports">
        {reports.map((e) => {
          const count = all.filter((p) => p.managerId === e.id).length;
          const open = expanded.has(e.id) || filtered;
          return (
            <div className="report" key={e.id}>
              {card(e, false)}
              {count > 0 && (
                <button
                  className="report-count"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(e.id)) next.delete(e.id);
                      else next.add(e.id);
                      return next;
                    })
                  }
                  aria-expanded={open}
                >
                  {count} direct reports{' '}
                  {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
              {open && children(e.id, depth + 1, nextSeen)}
            </div>
          );
        })}
      </div>
    );
  }
  const fit = () =>
    setZoom(
      Math.max(
        0.35,
        Math.min(1, ((canvas.current?.clientWidth || 1000) - 70) / rootWidth),
      ),
    );
  return (
    <section className="chart-panel">
      <div className="chart-toolbar">
        <div className="view-tabs">
          <button className="selected">
            <Network size={16} />
            Hierarchy
          </button>
          <button onClick={onDirectory}>
            <Users size={16} />
            Directory
          </button>
        </div>
        <div className="chart-tools">
          <label htmlFor="workspace-field-3" className="search-field">
            <Search size={15} />
            <Input
              id="workspace-field-3"
              aria-label="Find a person in the chart"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a person…"
            />
          </label>
          <NativeSelect
            aria-label="Chart department filter"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">All departments</option>
            {[...new Set(all.map((e) => e.department))].sort().map((d) => (
              <option key={d}>{d}</option>
            ))}
          </NativeSelect>
          <Button variant="outline" onClick={onExport}>
            <Download />
            Export chart
          </Button>
        </div>
      </div>
      <div className="chart-options">
        <label className="check-field">
          <input
            type="checkbox"
            checked={functional}
            onChange={(e) => setFunctional(e.target.checked)}
          />
          Functional reporting
        </label>
        <span>
          {canEdit
            ? 'Click a person to edit'
            : 'Read-only chart · editing requires an editor role'}
        </span>
        <Button
          variant="ghost"
          onClick={() => setExpanded(new Set(all.map((e) => e.id)))}
        >
          Expand all
        </Button>
        <Button variant="ghost" onClick={() => setExpanded(new Set())}>
          Collapse teams
        </Button>
        <div className="zoom-controls">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
          >
            <Minus size={14} />
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
          >
            <Plus size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Fit chart to width"
            onClick={fit}
          >
            <Maximize2 size={14} />
          </Button>
        </div>
      </div>
      <div className="chart-canvas" ref={canvas}>
        <div className="chart-title">
          <span className="company-icon">
            <Building2 size={21} />
          </span>
          <h2>{doc.company}</h2>
          <p>
            Organizational structure <span>•</span>{' '}
            {formatDate(doc.updatedDate)}
          </p>
          <span className="draft-label">
            {approvalStatus(doc).approved
              ? 'APPROVED COMPANY RECORD'
              : 'DRAFT · PENDING FINAL APPROVAL'}
          </span>
        </div>
        {displayedRoots.length ? (
          <div
            className="chart-scaled"
            style={{ zoom, width: rootWidth, minWidth: rootWidth }}
          >
            <div
              className="executive-grid"
              ref={grid}
              style={{ minWidth: rootWidth }}
            >
              <svg className="functional-overlay" aria-hidden="true">
                {paths.map((path, i) => (
                  <path
                    key={i}
                    d={path}
                    stroke="#9d86bc"
                    strokeWidth="1.4"
                    strokeDasharray="5 5"
                    fill="none"
                  />
                ))}
              </svg>
              {displayedRoots.map((e) => (
                <div className="branch" key={e.id}>
                  {card(e, true)}
                  {children(e.id, 0, new Set())}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <Search />
            <h3>No matching people</h3>
            <p>Try a different search or department.</p>
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setDepartment('');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
      <footer className="chart-footer">
        <span>
          <i className="line-sample" />
          Direct reporting <i className="line-sample dashed" />
          Functional reporting (visible cards)
        </span>
        <span>
          {filtered
            ? 'Filtered view · ancestors retained for context'
            : 'Current departments · no October changes applied'}
        </span>
      </footer>
    </section>
  );
}
