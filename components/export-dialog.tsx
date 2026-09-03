'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { OrgDocument } from '@/lib/model';
import {
  download,
  filename,
  exportExcel,
  exportPdf,
  exportWord,
  exportPowerPoint,
} from '@/lib/exports';
import {
  preparePdf,
  pdfSections,
  defaultPdfSections,
  type PdfSection,
} from '@/lib/pdf-export';
import { chartSvg, type ChartDirection } from '@/lib/chart-layout';

export function ExportDialog({
  doc,
  onClose,
  direction: initialDirection = 'vertical',
}: {
  doc: OrgDocument;
  onClose: () => void;
  direction?: ChartDirection;
}) {
  const [name, setName] = useState(filename(doc, 'pdf').slice(0, -4)),
    [direction, setDirection] = useState(initialDirection);
  const [sections, setSections] = useState<PdfSection[]>(defaultPdfSections),
    [pages, setPages] = useState<{ number: number; title: string }[]>([]),
    [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [done, setDone] = useState('');
  async function run(ext: string) {
    setBusy(ext);
    setError('');
    setDone('');
    try {
      if (!name.trim()) throw new Error('Enter a file name.');
      if (ext === 'preview') {
        const result = await preparePdf(doc, { direction, sections });
        setPages(result.pages);
        setSelected(result.pages.map((p) => p.number));
        return;
      }
      const blob =
        ext === 'pdf'
          ? await exportPdf(doc, { direction, sections, pages: selected })
          : ext === 'svg'
            ? chartSvg(doc, { direction })
            : ext === 'json'
              ? JSON.stringify(doc, null, 2)
              : ext === 'docx'
                ? await exportWord(doc, undefined, { direction, sections })
                : ext === 'pptx'
                  ? await exportPowerPoint(doc, { direction })
                  : await exportExcel(doc);
      download(
        blob,
        filename(doc, ext, name),
        ext === 'svg' ? 'image/svg+xml' : 'application/json',
      );
      setDone(`${ext.toUpperCase()} download prepared.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="export-dialog">
        <DialogTitle>Export your organization</DialogTitle>
        <DialogDescription>
          Choose a file name, chart direction and the pages to include. Chart
          exports include the full organization, regardless of screen filters.
        </DialogDescription>
        <label className="export-field" htmlFor="export-file-name">
          File name
          <Input
            aria-label="Export file name"
            id="export-file-name"
            disabled={!!busy}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          <small>The correct file extension is added automatically.</small>
        </label>
        <label className="export-field" htmlFor="export-direction">
          Chart direction
          <NativeSelect
            aria-label="Export chart direction"
            id="export-direction"
            disabled={!!busy}
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as ChartDirection);
              setPages([]);
            }}
          >
            <option value="vertical">Vertical (top to bottom)</option>
            <option value="vertical-2">Vertical 2 (stacked branches)</option>
            <option value="horizontal">Horizontal (left to right)</option>
          </NativeSelect>
        </label>
        <fieldset className="pdf-sections" disabled={!!busy}>
          <legend>PDF sections</legend>
          {pdfSections.map((s) => (
            <label className="check-field" key={s.id}>
              <input
                type="checkbox"
                checked={sections.includes(s.id)}
                onChange={(e) => {
                  setSections((old) =>
                    e.target.checked
                      ? [...old, s.id]
                      : old.filter((id) => id !== s.id),
                  );
                  setPages([]);
                }}
              />
              {s.label}
            </label>
          ))}
        </fieldset>
        <Button
          disabled={!!busy || !sections.length}
          onClick={() => void run('preview')}
        >
          {busy === 'preview' ? 'Preparing pages…' : 'Choose PDF pages'}
        </Button>
        {!!pages.length && (
          <section className="pdf-page-picker">
            <div className="section-title">
              <h3>Pages to download</h3>
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  setSelected(
                    selected.length === pages.length
                      ? []
                      : pages.map((p) => p.number),
                  )
                }
              >
                {selected.length === pages.length
                  ? 'Clear selection'
                  : 'Select all'}
              </Button>
            </div>
            {pages.map((p) => (
              <label className="check-field" key={p.number}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.number)}
                  disabled={!!busy}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, p.number]
                        : old.filter((n) => n !== p.number),
                    )
                  }
                />
                <strong>Page {p.number}</strong> {p.title}
              </label>
            ))}
            <Button
              disabled={!!busy || !selected.length}
              onClick={() => void run('pdf')}
            >
              <Download size={18} />
              {busy === 'pdf'
                ? 'Preparing…'
                : `Download PDF (${selected.length} ${selected.length === 1 ? 'page' : 'pages'})`}
            </Button>
          </section>
        )}
        <p className="muted">
          PDF and Word use the same selected sections. PDF tables are readable
          snapshots; Word and Excel tables are editable. Large chart pages
          support zoom and poster printing.
        </p>
        <details>
          <summary>Other formats</summary>
          <div className="other-exports">
            {[
              ['docx', 'Word - editable tables'],
              ['pptx', 'PowerPoint - editable chart'],
              ['xlsx', 'Excel - employee data'],
              ['svg', 'SVG - vector chart'],
              ['json', 'JSON - full master backup'],
            ].map(([ext, label]) => (
              <Button
                key={ext}
                variant="outline"
                disabled={!!busy}
                onClick={() => void run(ext)}
              >
                <Download size={16} />
                {busy === ext ? 'Preparing…' : label}
              </Button>
            ))}
          </div>
        </details>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done && <output className="success">{done}</output>}
        <div className="form-actions">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
