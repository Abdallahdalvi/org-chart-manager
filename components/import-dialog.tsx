'use client';
import { useMemo, useState } from 'react';
import { FileSpreadsheet, Upload, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import {
  readSpreadsheet,
  previewBatch,
  importKind,
  type ImportTable,
} from '@/lib/importer';
import type { OrgDocument } from '@/lib/model';
import { download, exportExcel } from '@/lib/exports';
const kindLabels = {
  active: 'Active employees',
  inactive: 'Inactive employees',
  employees: 'Employee updates',
  departments: 'Departments / functions',
};
export function ImportDialog({
  doc,
  onClose,
  onApply,
  busy,
  actor,
  actorReadOnly = false,
  onActor,
  saveError,
}: {
  doc: OrgDocument;
  onClose: () => void;
  onApply: (next: OrgDocument, description: string) => Promise<boolean>;
  busy: boolean;
  actor: string;
  actorReadOnly?: boolean;
  onActor: (value: string) => void;
  saveError: string;
}) {
  const [tables, setTables] = useState<ImportTable[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [mode, setMode] = useState<'proposals' | 'functions'>('proposals');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const { preview, previewError } = useMemo(() => {
    if (!selected.length) return { preview: null, previewError: '' };
    try {
      return {
        preview: previewBatch(
          doc,
          selected.map((i) => tables[i]),
          mode,
        ),
        previewError: '',
      };
    } catch (e) {
      return {
        preview: null,
        previewError:
          e instanceof Error ? e.message : 'Could not preview these sheets.',
      };
    }
  }, [doc, tables, selected, mode]);
  async function choose(files: File[]) {
    if (!files.length || busy || reading) return;
    setReading(true);
    setError('');
    setTables([]);
    setSelected([]);
    try {
      if (files.length > 10)
        throw new Error('Select up to 10 files at a time.');
      const read = (await Promise.all(files.map(readSpreadsheet))).flat();
      if (!read.length)
        throw new Error('No supported employee or department sheets found.');
      setTables(read);
      setSelected(read.map((_, i) => i));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File could not be read.');
    } finally {
      setReading(false);
    }
  }
  const hasDepartments = selected.some(
    (i) => importKind(tables[i]) === 'departments',
  );
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="import-dialog">
        <DialogTitle>Import spreadsheets</DialogTitle>
        <DialogDescription>
          Select active employees, inactive employees, department changes—or all
          three together. Review the changes, then save once.
        </DialogDescription>
        <div className="import-types">
          <span>Active employees</span>
          <span>Inactive employees</span>
          <span>Departments</span>
        </div>
        <div
          role="presentation"
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void choose(Array.from(e.dataTransfer.files));
          }}
        >
          <span className="upload-icon">
            <FileSpreadsheet size={27} />
          </span>
          <strong>
            {reading
              ? 'Reading your files…'
              : 'Drop one or more Excel / CSV files here'}
          </strong>
          <span>or browse files · .xlsx / .csv · up to 5 MB each</span>
          <input
            type="file"
            multiple
            aria-label="Choose Excel or CSV files"
            accept=".xlsx,.csv"
            onChange={(e) => {
              void choose(Array.from(e.target.files || []));
              e.target.value = '';
            }}
            disabled={reading || busy}
          />
        </div>
        <div className="import-hint">
          <span>Your supplied files work as they are.</span>
          <Button
            variant="link"
            onClick={async () => {
              try {
                download(
                  await exportExcel(doc, true),
                  'org-chart-import-template.xlsx',
                );
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Excel template <ArrowRight size={14} />
          </Button>
        </div>
        {tables.length > 0 && (
          <section className="import-sheets" aria-label="Sheets to import">
            <strong>1. Choose sheets</strong>
            {tables.map((t, i) => (
              <label
                key={`${t.source}-${i}`}
                className="import-sheet"
                htmlFor={`import-sheet-${i}`}
              >
                <Checkbox
                  id={`import-sheet-${i}`}
                  disabled={busy}
                  checked={selected.includes(i)}
                  onCheckedChange={(checked) =>
                    setSelected((s) =>
                      checked
                        ? [...s, i].sort((a, b) => a - b)
                        : s.filter((j) => j !== i),
                    )
                  }
                />
                <span>
                  <strong>{t.source}</strong>
                  <small>
                    {kindLabels[importKind(t)]} · {t.rows.length} rows
                  </small>
                </span>
              </label>
            ))}
          </section>
        )}
        {hasDepartments && (
          <label htmlFor="import-department-mode">
            Use department descriptions as
            <NativeSelect
              id="import-department-mode"
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="proposals">
                Proposals for review (recommended for October changes)
              </option>
              <option value="functions">
                Current department / function descriptions
              </option>
            </NativeSelect>
            <small>
              Neither option moves employees or changes managers. Use employee
              rows for those changes.
            </small>
          </label>
        )}
        {(error || previewError || saveError) && (
          <p className="error" role="alert">
            {error || previewError || saveError}
          </p>
        )}
        {preview && (
          <>
            <strong>2. Review changes</strong>
            <div className="import-stats">
              <span>
                <b>{preview.added}</b>new records
              </span>
              <span>
                <b>{preview.changed}</b>updates
              </span>
              <span>
                <b>{preview.unchanged}</b>unchanged
              </span>
            </div>
            <div className="preview-list">
              {preview.changes.map((c, i) => (
                <div key={`${c.id}-${i}`}>
                  <span
                    className={
                      'pill ' + (c.type.startsWith('New') ? 'green' : '')
                    }
                  >
                    {c.type}
                  </span>
                  <div>
                    <strong>{c.name}</strong>
                    <p>{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            {!preview.added && !preview.changed && (
              <p className="notice">
                These records are already up to date. Nothing needs to be saved.
              </p>
            )}
            <details>
              <summary>Import notes ({preview.messages.length})</summary>
              <ul className="import-notes">
                {preview.messages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </details>
            <p className="muted">
              Unlisted employees stay in your chart. Inactive people are kept in
              the employee register, not on the chart. Conflicting statuses go
              to Data review.
            </p>
            <label htmlFor="import-editor-name">
              3. Your name for the change log
              <Input
                id="import-editor-name"
                value={actor}
                readOnly={actorReadOnly}
                onChange={(e) => onActor(e.target.value)}
                maxLength={150}
                placeholder="Your name"
              />
            </label>
          </>
        )}
        <div className="form-actions">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !preview ||
              reading ||
              busy ||
              !actor.trim() ||
              (!preview.added && !preview.changed)
            }
            onClick={async () => {
              if (
                preview &&
                (await onApply(
                  preview.document,
                  `Imported ${selected.length} sheet(s): ${selected.map((i) => tables[i].source).join('; ')}. ${preview.added} added, ${preview.changed} updated; absent employees retained.`,
                ))
              )
                onClose();
            }}
          >
            <Upload size={15} />
            {busy
              ? 'Saving…'
              : `Import ${selected.length || ''} selected sheet${selected.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
