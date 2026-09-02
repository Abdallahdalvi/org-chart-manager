'use client';
import { useState } from 'react';
import { FileSpreadsheet, Upload, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  readSpreadsheet,
  previewImport,
  type ImportTable,
  type ImportPreview,
} from '@/lib/importer';
import type { OrgDocument } from '@/lib/model';
import { download, exportExcel } from '@/lib/exports';
export function ImportDialog({
  doc,
  onClose,
  onApply,
  busy,
}: {
  doc: OrgDocument;
  onClose: () => void;
  onApply: (next: OrgDocument, description: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [tables, setTables] = useState<ImportTable[]>([]),
    [selected, setSelected] = useState(0),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [error, setError] = useState(''),
    [reading, setReading] = useState(false);
  async function choose(file?: File) {
    if (!file) return;
    setReading(true);
    setError('');
    setPreview(null);
    setTables([]);
    try {
      const read = await readSpreadsheet(file);
      if (!read.length)
        throw new Error('No supported employee or department sheets found.');
      setTables(read);
      setSelected(0);
      setPreview(previewImport(doc, read[0]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File could not be read.');
    } finally {
      setReading(false);
    }
  }
  function select(index: number) {
    setSelected(index);
    setError('');
    setPreview(null);
    try {
      setPreview(previewImport(doc, tables[index]));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="import-dialog">
        <DialogTitle>Import & update your chart</DialogTitle>
        <DialogDescription>
          Merge by employee ID. Check the changes before applying; existing
          employees are never removed just because a row is absent.
        </DialogDescription>
        <div
          role="presentation"
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void choose(e.dataTransfer.files[0]);
          }}
        >
          <span className="upload-icon">
            <FileSpreadsheet size={27} />
          </span>
          <strong>
            {reading
              ? 'Reading your spreadsheet…'
              : 'Drop your Excel or CSV file here'}
          </strong>
          <span>or click to browse · .xlsx / .csv · up to 5 MB</span>
          <input
            type="file"
            aria-label="Choose an Excel or CSV file"
            accept=".xlsx,.csv"
            onChange={(e) => void choose(e.target.files?.[0])}
            disabled={reading || busy}
          />
        </div>
        <div className="import-hint">
          <span>Start with the right columns.</span>
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
            Download Excel template <ArrowRight size={14} />
          </Button>
        </div>
        {tables.length > 1 && (
          <label>
            Worksheet
            <NativeSelect
              value={selected}
              onChange={(e) => select(Number(e.target.value))}
            >
              {tables.map((t, i) => (
                <option key={t.name} value={i}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <>
            <div className="import-stats">
              <span>
                <b>{preview.added}</b>new people
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
                <div key={c.id || i}>
                  <span className={'pill ' + (c.type === 'New' ? 'green' : '')}>
                    {c.type}
                  </span>
                  <div>
                    <strong>{c.name}</strong>
                    <p>{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <details open>
              <summary>Import notes ({preview.messages.length})</summary>
              <ul className="import-notes">
                {preview.messages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </details>
            <p className="muted">
              Only the selected sheet will be imported. Repeat for other sheets
              if needed. Excel imports update employee data, not
              document-control or approval records.
            </p>
          </>
        )}
        <div className="form-actions">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !preview ||
              reading ||
              busy ||
              (!preview.added && !preview.changed)
            }
            onClick={async () => {
              if (
                preview &&
                (await onApply(
                  preview.document,
                  `Imported ${tables[selected].source}: ${preview.added} added, ${preview.changed} updated; absent employees retained.`,
                ))
              )
                onClose();
            }}
          >
            <Upload size={15} />
            {busy ? 'Saving…' : 'Apply reviewed changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
