'use client';
import { useState } from 'react';
import { LeadershipSetup } from './leadership-setup';
import type { DocumentControlEntry, OrgDocument } from '@/lib/model';
import {
  CONTROL_REGISTER_EMPTY_ROWS,
  documentControlHeaders,
} from '@/lib/exports';
import { documentControlEntries } from '@/lib/organization';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { incrementVersion, VERSION_PATTERN } from '@/lib/versioning';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@/components/ui/table';

const fields: (keyof Pick<
  DocumentControlEntry,
  | 'serialNo'
  | 'version'
  | 'update'
  | 'createdBy'
  | 'createdDate'
  | 'updatedBy'
  | 'updatedDate'
  | 'validatedBy'
  | 'validatedDate'
  | 'approvedBy'
  | 'approvalDate'
>)[] = [
  'serialNo',
  'version',
  'update',
  'createdBy',
  'createdDate',
  'updatedBy',
  'updatedDate',
  'validatedBy',
  'validatedDate',
  'approvedBy',
  'approvalDate',
];

const toEditableRegister = (doc: OrgDocument) =>
  [
    ...documentControlEntries(doc)
      .slice()
      .reverse()
      .map((entry, index) => ({
        ...entry,
        serialNo: entry.serialNo || String(index + 1),
        createdDate: entry.createdDate.slice(0, 10),
        updatedDate: entry.updatedDate.slice(0, 10),
        validatedDate: entry.validatedDate.slice(0, 10),
        approvalDate: entry.approvalDate.slice(0, 10),
      })),
    ...Array.from({ length: CONTROL_REGISTER_EMPTY_ROWS }, () => ({
      contentId: '',
      serialNo: '',
      version: '',
      update: '',
      createdBy: '',
      createdDate: '',
      updatedBy: '',
      updatedDate: '',
      validatedBy: '',
      validatedDate: '',
      approvedBy: '',
      approvalDate: '',
    })),
  ];

export function DocumentTable({
  doc,
  canEdit,
  canManageApprovals,
  busy,
  onSave,
  onSaveControl,
  onResetRegister,
}: {
  doc: OrgDocument;
  canEdit: boolean;
  canManageApprovals: boolean;
  busy: boolean;
  onSave: (doc: OrgDocument, reason: string) => Promise<boolean>;
  onSaveControl: (doc: OrgDocument, reason: string) => Promise<boolean>;
  onResetRegister: () => Promise<boolean>;
}) {
  const [version, setVersion] = useState(doc.version);
  const [versionMode, setVersionMode] = useState<'automatic' | 'manual'>(
    doc.versionMode || 'automatic',
  );
  const [reason, setReason] = useState('Updated document-control version');
  const [editing, setEditing] = useState(false);
  const [register, setRegister] = useState<DocumentControlEntry[]>(() =>
    toEditableRegister(doc),
  );
  const [registerReason, setRegisterReason] = useState(
    'Updated document-control register',
  );
  const [resetConfirm, setResetConfirm] = useState(false);
  const editCell = (
    rowIndex: number,
    field: (typeof fields)[number],
    value: string,
  ) =>
    setRegister((rows) =>
      rows.map((row, index) =>
        index === rowIndex ? { ...row, [field]: value } : row,
      ),
    );

  return (
    <div className="content-page">
      <LeadershipSetup
        key={doc.contentId || doc.version}
        doc={doc}
        canEdit={canEdit}
        busy={busy}
        onSave={onSave}
      />
      <section className="surface">
        <div className="section-title">
          <div>
            <h2>Document control register</h2>
            <p className="muted">
              One row is recorded for every saved version update. Full access
              can edit every field; Editors can edit non-approval fields.
              V1.0 starts at the top and later versions continue downward.
            </p>
          </div>
          {canEdit && (
            <div className="document-control-actions">
              {!editing && (
                <Button disabled={busy} onClick={() => setEditing(true)}>
                  Add version update
                </Button>
              )}
              {!resetConfirm ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setResetConfirm(true)}
                >
                  Reset to V1.0
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onResetRegister()}
                  >
                    Confirm reset to V1.0
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setResetConfirm(false)}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        {editing && (
          <form
            className="control-version-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canEdit || busy) return;
              if (
                await onSave(
                  { ...doc, version: version.trim(), versionMode },
                  reason,
                )
              )
                setEditing(false);
            }}
          >
            <label className="export-field">
              Versioning
              <NativeSelect
                aria-label="Versioning mode"
                value={versionMode}
                disabled={busy}
                onChange={(event) =>
                  setVersionMode(event.target.value as 'automatic' | 'manual')
                }
              >
                <option value="automatic">
                  Automatic — increase on each save
                </option>
                <option value="manual">Manual — set the version yourself</option>
              </NativeSelect>
            </label>
            <label className="export-field">
              Version number
              {versionMode === 'manual' ? (
                <Input
                  aria-label="Document version"
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  required
                  maxLength={40}
                  pattern={VERSION_PATTERN}
                  disabled={busy}
                  placeholder="e.g. 1.0"
                  title="Use numbers separated by dots, e.g. 1.0 or 2.1.3"
                />
              ) : (
                <Input
                  disabled
                  value={incrementVersion(doc.version)}
                  aria-label="Next automatic version"
                />
              )}
            </label>
            <label className="export-field control-version-reason">
              Update / change
              <Input
                aria-label="Document-control update description"
                value={reason}
                required
                maxLength={2000}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <p className="muted control-version-help">
              Every version update creates a new editable register row and a
              recovery copy.
            </p>
            <div className="form-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setVersion(doc.version);
                  setVersionMode(doc.versionMode || 'automatic');
                  setReason('Updated document-control version');
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Save version update
              </Button>
            </div>
          </form>
        )}
        <div className="document-control-table-wrap">
          <Table className="editable-table document-control-table">
            <TableHeader>
              <TableRow>
                {documentControlHeaders.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {register.length ? (
                register.map((row, rowIndex) => (
                  <TableRow key={row.contentId || `new-register-row-${rowIndex}`}>
                    {fields.map((field, columnIndex) => (
                      <TableCell key={field}>
                        {canEdit ? (
                          <Input
                            aria-label={`${documentControlHeaders[columnIndex]} for row ${rowIndex + 1}`}
                            value={row[field] || ''}
                            disabled={
                              busy ||
                              (!canManageApprovals &&
                                [
                                  'validatedBy',
                                  'validatedDate',
                                  'approvedBy',
                                  'approvalDate',
                                ].includes(field))
                            }
                            maxLength={field === 'update' ? 2000 : 250}
                            onChange={(event) =>
                              editCell(rowIndex, field, event.target.value)
                            }
                          />
                        ) : (
                          row[field] || '—'
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={documentControlHeaders.length}>
                    No saved version updates yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {canEdit && (
          <form
            className="document-control-save"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!busy)
                await onSaveControl(
                  {
                    ...doc,
                    documentControlHistory: register
                      .filter((row) =>
                        fields.some((field) => (row[field] || '').trim()),
                      )
                      .reverse(),
                  },
                  registerReason,
                );
            }}
          >
            <label className="export-field control-register-reason">
              Register change note
              <Input
                aria-label="Document-control register change note"
                value={registerReason}
                required
                disabled={busy}
                maxLength={2000}
                onChange={(event) => setRegisterReason(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={busy}>
              Save register changes
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
