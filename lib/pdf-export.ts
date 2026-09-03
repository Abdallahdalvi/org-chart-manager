import { chartLayout, chartPages, type ChartDirection } from './chart-layout';
import type { OrgDocument } from './model';
import {
  legendItems,
  FILL_NOTE,
  CARD_TEXT,
  REPORTING_NOTE,
} from './chart-style';
import {
  controlRows,
  documentControlHeaders,
  departmentRows,
  employeeRows,
} from './exports';
import { issuesFor } from './organization';
export const pdfSections = [
  { id: 'chart', label: 'Organization chart' },
  { id: 'branches', label: 'Individual leadership branches' },
  { id: 'control', label: 'Document control table' },
  { id: 'departments', label: 'Current department functions table' },
  { id: 'employees', label: 'Employee register' },
  { id: 'history', label: 'Change log' },
  { id: 'issues', label: 'Data review items' },
] as const;
export type PdfSection = (typeof pdfSections)[number]['id'];
export type PdfOptions = {
  direction?: ChartDirection;
  sections?: PdfSection[];
  pages?: number[];
};
export const defaultPdfSections: PdfSection[] = [
  'chart',
  'control',
  'departments',
];
const safe = (s: string) =>
  s
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replaceAll('·', '|');

export async function preparePdf(doc: OrgDocument, options: PdfOptions = {}) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pages: { number: number; title: string }[] = [];
  const selected = new Set(options.sections || defaultPdfSections);
  if (!selected.size) throw new Error('Select at least one PDF section.');
  let first = true;
  function page(
    title: string,
    format: string | number[] = 'a4',
    landscape = false,
  ) {
    pdf.addPage(format, landscape ? 'landscape' : 'portrait');
    if (first) {
      pdf.deletePage(1);
      first = false;
    }
    pages.push({ number: pages.length + 1, title });
    pdf.setTextColor('#12233d');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(21);
    pdf.text(safe(title), 40, 43);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.setTextColor('#334155');
    pdf.text(
      safe(
        `${doc.company} | Version ${doc.version} | ${doc.updatedDate.slice(0, 10)}`,
      ),
      40,
      66,
    );
  }
  function chart(l: ReturnType<typeof chartLayout>, title: string) {
    // PDF viewers cap page dimensions; preserve all nodes even for very large organizations.
    const s = Math.min(
      1,
      14000 / l.width,
      (14000 - l.top) / (l.height - l.top),
    );
    const y = (value: number) => l.top + (value - l.top) * s;
    const width = Math.max(800, l.width * s),
      height = y(l.height);
    page(title, [width, height], width > height);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor('#12233d');
    pdf.setFontSize(14);
    pdf.text('Department color legend', 40, 125);
    pdf.setFont('helvetica', 'normal');
    for (const item of legendItems(doc)) {
      pdf.setFillColor(item.color);
      pdf.rect(item.x, item.y - 13, 18, 16, 'F');
      item.lines.forEach((line, i) =>
        pdf.text(line, item.x + 26, item.y + i * 18),
      );
    }
    pdf.setFontSize(13);
    pdf.text(FILL_NOTE, 40, l.top - 46);
    pdf.text(REPORTING_NOTE, 40, l.top - 24);
    for (const c of l.connections) {
      pdf.setLineWidth(2 * s);
      pdf.setDrawColor('#64748b');
      for (let i = 1; i < c.points.length; i++)
        pdf.line(
          c.points[i - 1][0] * s,
          y(c.points[i - 1][1]),
          c.points[i][0] * s,
          y(c.points[i][1]),
        );
    }
    pdf.setLineDashPattern([], 0);
    for (const n of l.nodes) {
      pdf.setFillColor(n.fill);
      pdf.setDrawColor(n.color);
      pdf.setLineWidth(1.5 * s);
      pdf.roundedRect(
        n.x * s,
        y(n.y),
        n.width * s,
        n.height * s,
        8 * s,
        8 * s,
        'FD',
      );
      pdf.setFillColor(n.color);
      pdf.roundedRect(
        n.x * s,
        y(n.y + 5),
        6 * s,
        (n.height - 10) * s,
        2 * s,
        2 * s,
        'F',
      );
      for (const line of n.lines) {
        pdf.setFont('helvetica', line.kind === 'name' ? 'bold' : 'normal');
        pdf.setFontSize(line.size * s);
        pdf.setTextColor(CARD_TEXT);
        pdf.text(safe(line.text), (n.x + 20) * s, y(n.y + line.y));
      }
    }
    if (!l.nodes.length) {
      pdf.setFontSize(16);
      pdf.setTextColor('#12233d');
      pdf.text('No active employees to display.', 40, l.top + 20);
    }
  }
  function table(
    title: string,
    headers: string[],
    rows: string[][],
    widths: number[],
    landscape = false,
    bodyFontSize = 13,
  ) {
    let y = 0;
    const bottom = () => pdf.internal.pageSize.getHeight() - 45;
    function next() {
      page(title, 'a4', landscape);
      y = 92;
      const headerFontSize = headers.length > 6 ? 9 : 12;
      const headerCells = headers.map(
        (header, index) =>
          pdf.splitTextToSize(safe(header), widths[index] - 12) as string[],
      );
      const headerHeight = Math.max(
        30,
        Math.max(...headerCells.map((lines) => lines.length)) *
          (headerFontSize + 2) +
          12,
      );
      pdf.setFillColor('#12233d');
      pdf.rect(
        40,
        y,
        widths.reduce((a, b) => a + b, 0),
        headerHeight,
        'F',
      );
      pdf.setTextColor('#ffffff');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(headerFontSize);
      let x = 40;
      headerCells.forEach((lines, i) => {
        pdf.text(lines, x + 6, y + headerFontSize + 5, {
          lineHeightFactor: (headerFontSize + 2) / headerFontSize,
        });
        x += widths[i];
      });
      y += headerHeight;
    }
    next();
    for (const row of rows.length
      ? rows
      : [headers.map((_, i) => (i === 0 ? 'No records' : ''))]) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(bodyFontSize);
      const cells = row.map(
        (value, i) =>
          pdf.splitTextToSize(safe(value || ''), widths[i] - 12) as string[],
      );
      let offset = 0;
      const max = Math.max(1, ...cells.map((lines) => lines.length));
      while (offset < max) {
        if (y + 38 > bottom()) next();
        let count = Math.min(
          max - offset,
          Math.floor((bottom() - y - 16) / (bodyFontSize + 5)),
        );
        if (
          offset === 0 &&
          count < max &&
          max * (bodyFontSize + 5) + 16 < bottom() - 122
        ) {
          next();
          count = Math.min(
            max,
            Math.floor((bottom() - y - 16) / (bodyFontSize + 5)),
          );
        }
        const h = Math.max(32, count * (bodyFontSize + 5) + 16);
        let x = 40;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(bodyFontSize);
        pdf.setTextColor('#12233d');
        pdf.setDrawColor('#94a3b8');
        pdf.setLineWidth(0.5);
        cells.forEach((lines, i) => {
          pdf.setFillColor(i === 0 ? '#f1f5f9' : '#ffffff');
          pdf.rect(x, y, widths[i], h, 'FD');
          pdf.text(
            lines.slice(offset, offset + count),
            x + 6,
            y + bodyFontSize + 5,
            {
              lineHeightFactor: (bodyFontSize + 5) / bodyFontSize,
            },
          );
          x += widths[i];
        });
        y += h;
        offset += count;
      }
    }
  }
  if (selected.has('chart'))
    chart(
      chartLayout(doc, { direction: options.direction }),
      'Organizational chart',
    );
  if (selected.has('branches'))
    for (const branch of chartPages(doc, { direction: options.direction })
      .pages)
      chart(branch, branch.title);
  if (selected.has('control'))
    table(
      'Document control',
      documentControlHeaders,
      controlRows(doc),
      [30, 50, 110, 70, 70, 70, 70, 70, 70, 70, 70],
      true,
      10,
    );
  if (selected.has('departments'))
    table(
      'Current department functions',
      ['Department', 'Function / description'],
      departmentRows(doc),
      [155, 360],
    );
  if (selected.has('employees'))
    table(
      'Employee register',
      [
        'ID',
        'Employee / designation',
        'Department',
        'Direct manager',
        'Status',
      ],
      employeeRows(doc).map((r) => [
        r[0],
        r[1] + '\n' + r[2],
        r[3],
        r[4],
        r[6],
      ]),
      [55, 230, 155, 210, 110],
      true,
    );
  if (selected.has('history'))
    table(
      'Change log',
      ['Version / date', 'Change / updated by'],
      doc.history.map((h) => [
        h.version + '\n' + h.date.slice(0, 10),
        h.description + '\n' + h.by,
      ]),
      [145, 370],
    );
  if (selected.has('issues'))
    table(
      'Data review items',
      ['Employee ID', 'Item'],
      issuesFor(doc).map((i) => [i.employeeId || '', i.message]),
      [110, 405],
    );
  if (!pages.length)
    throw new Error(
      'The selected sections have no pages. Choose another section.',
    );
  return { pdf, pages };
}
export async function exportPdf(doc: OrgDocument, options: PdfOptions = {}) {
  const { pdf, pages } = await preparePdf(doc, options);
  if (options.pages) {
    const keep = new Set(options.pages);
    if (
      !keep.size ||
      [...keep].some((n) => !Number.isInteger(n) || n < 1 || n > pages.length)
    )
      throw new Error('Select valid PDF pages.');
    for (let n = pages.length; n > 0; n--) if (!keep.has(n)) pdf.deletePage(n);
  }
  for (let n = 1; n <= pdf.getNumberOfPages(); n++) {
    pdf.setPage(n);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor('#334155');
    pdf.text(
      `${n} / ${pdf.getNumberOfPages()}`,
      pdf.internal.pageSize.getWidth() - 40,
      pdf.internal.pageSize.getHeight() - 22,
      { align: 'right' },
    );
  }
  return pdf.output('blob');
}
