'use client';
import { useState } from 'react';
import {
  FileText,
  Presentation,
  FileSpreadsheet,
  Braces,
  Download,
  Image,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { OrgDocument } from '@/lib/model';
import {
  download,
  filename,
  exportExcel,
  exportPdf,
  exportWord,
  exportPowerPoint,
} from '@/lib/exports';
import { chartSvg } from '@/lib/chart-layout';
export function ExportDialog({
  doc,
  onClose,
}: {
  doc: OrgDocument;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [done, setDone] = useState('');
  const formats = [
    {
      ext: 'pdf',
      title: 'PDF document',
      description:
        'Vector chart poster + readable register, document control, history and evidence.',
      icon: FileText,
    },
    {
      ext: 'docx',
      title: 'Word document',
      description:
        'Chart overview image with editable employee and document-control tables.',
      icon: FileText,
    },
    {
      ext: 'pptx',
      title: 'PowerPoint chart',
      description:
        'Editable text, cards and connectors. Includes document-control slides.',
      icon: Presentation,
    },
    {
      ext: 'xlsx',
      title: 'Excel employee data',
      description:
        'Editable data workbook. Re-import Employees to update the chart.',
      icon: FileSpreadsheet,
    },
    {
      ext: 'json',
      title: 'Editable master backup',
      description:
        'Full working data, functions, revision history and approval references.',
      icon: Braces,
    },
    {
      ext: 'svg',
      title: 'Scalable chart image',
      description:
        'Vector diagram for design tools. Does not contain the audit register.',
      icon: Image,
    },
  ];
  async function run(ext: string) {
    setBusy(ext);
    setError('');
    setDone('');
    try {
      const blob =
        ext === 'json'
          ? JSON.stringify(doc, null, 2)
          : ext === 'svg'
            ? chartSvg(doc)
            : ext === 'pdf'
              ? await exportPdf(doc)
              : ext === 'docx'
                ? await exportWord(doc)
                : ext === 'pptx'
                  ? await exportPowerPoint(doc)
                  : await exportExcel(doc);
      download(
        blob,
        filename(doc, ext),
        ext === 'svg' ? 'image/svg+xml' : 'application/json',
      );
      setDone(`${ext.toUpperCase()} download prepared.`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Export failed. Please try another format.',
      );
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="export-dialog">
        <DialogTitle>Export your organization</DialogTitle>
        <DialogDescription>
          Exports include the complete organization, regardless of current
          filters or collapsed branches. Unapproved versions are labeled Draft.
        </DialogDescription>
        <div className="export-options">
          {formats.map((f) => (
            <button
              disabled={!!busy}
              key={f.ext}
              onClick={() => void run(f.ext)}
            >
              <span className="file-icon">
                <f.icon size={22} />
              </span>
              <span>
                <strong>{f.title}</strong>
                <small>
                  {busy === f.ext ? 'Preparing your download…' : f.description}
                </small>
              </span>
              <Download size={16} />
            </button>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <output className="success" aria-live="polite">
            {done}
          </output>
        )}
        <p className="muted">
          The PDF chart uses a large-format first page; use digital zoom or
          poster printing. Word also provides a readable, paginated register.
          Keep original approval emails/signatures alongside the master backup.
        </p>
        <div className="form-actions">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
