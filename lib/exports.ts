import type { OrgDocument } from './model';
import { documentControlEntries } from './organization';
import { directManagerLabel } from './leadership';
import { chartLegend, CARD_TEXT, REPORTING_NOTE } from './chart-style';
import {
  chartLayout,
  chartPages,
  teamChartPages,
  chartPageSvg,
  type ChartOptions,
} from './chart-layout';
import { issuesFor } from './organization';
import type { PdfSection } from './pdf-export';
export function download(
  data: Blob | string,
  name: string,
  type = 'application/json',
) {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const filename = (doc: OrgDocument, suffix: string, custom = '') => {
  const base = custom
    .trim()
    .replace(/\.(pdf|docx|pptx|xlsx|json|svg)$/i, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((c) => (c.charCodeAt(0) < 32 ? '_' : c))
    .join('')
    .replace(/[. ]+$/g, '')
    .slice(0, 120);
  return `${base || doc.company.replace(/[^a-z0-9-]/gi, '_') + '-org-chart-v' + doc.version}.${suffix}`;
};
export const documentControlHeaders = [
  'Sr. no.',
  'Version',
  'Update / change',
  'Created by',
  'Created date',
  'Updated by',
  'Updated date',
  'Validated by',
  'Validated date',
  'Approved by',
  'Approval date',
];
export const CONTROL_REGISTER_EMPTY_ROWS = 10;
const displayDate = (value: string) => (value ? value.slice(0, 10) : '');
/** Register presentation is chronological, while persisted entries stay newest-first. */
export function controlRows(
  doc: OrgDocument,
  emptyRows = CONTROL_REGISTER_EMPTY_ROWS,
) {
  const entries = documentControlEntries(doc).slice().reverse();
  const rows = entries.map((entry, index) => [
    entry.serialNo || String(index + 1),
    entry.version,
    entry.update || '',
    entry.createdBy || '',
    displayDate(entry.createdDate),
    entry.updatedBy || '',
    displayDate(entry.updatedDate),
    entry.validatedBy || '',
    displayDate(entry.validatedDate),
    entry.approvedBy || '',
    displayDate(entry.approvalDate),
  ]);
  return [
    ...rows,
    ...Array.from({ length: emptyRows }, () =>
      Array.from({ length: documentControlHeaders.length }, () => ''),
    ),
  ];
}
export function departmentRows(doc: OrgDocument) {
  const names = [
    ...new Set([
      ...doc.employees
        .filter((e) => e.status === 'Active')
        .map((e) => e.department)
        .filter(Boolean),
      ...doc.functions.map((f) => f.name),
    ]),
  ].sort();
  return names.map((name) => [
    name,
    doc.functions.find((f) => f.name === name)?.summary || '',
  ]);
}
export function employeeRows(doc: OrgDocument) {
  return doc.employees.map((e) => [
    e.id,
    e.name,
    e.title,
    e.department,
    directManagerLabel(doc, e),
    e.functionalIds
      .map((id) => doc.employees.find((p) => p.id === id)?.name || id)
      .join('; '),
    e.status,
  ]);
}
export async function exportExcel(doc: OrgDocument, template = false) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = doc.updatedBy;
  const sheet = wb.addWorksheet('Employees');
  const headers = [
    'Employee ID',
    'Full Name',
    'Display Name',
    'Job Title',
    'Department',
    'Manager ID',
    'Functional Manager IDs',
    'Status',
    'Email',
    'Top Level Confirmed',
    'Notes',
  ];
  sheet.addRow(headers);
  if (template)
    sheet.addRow([
      'EXAMPLE-001',
      'Replace with employee name',
      '',
      'Replace with job title',
      'Replace with department',
      '',
      '',
      'Needs review',
      '',
      'No',
      'Delete this example before importing. Keep IDs unchanged on future updates.',
    ]);
  else
    doc.employees.forEach((e) =>
      sheet.addRow([
        e.id,
        e.name,
        e.alias,
        e.title,
        e.department,
        e.managerId,
        e.functionalIds.join('; '),
        e.status,
        e.email,
        e.rootConfirmed ? 'Yes' : 'No',
        e.notes,
      ]),
    );
  const add = (name: string, head: string[], rows: string[][]) => {
    const sh = wb.addWorksheet(name);
    sh.addRow(head);
    rows.forEach((row) => sh.addRow(row));
    return sh;
  };
  add(
    'Instructions',
    ['Topic', 'Guidance'],
    [
      [
        'IDs',
        'Employee ID must be unique and stable; Manager ID refers to Employee ID. Blank manager requires HR confirmation of top-level status.',
      ],
      [
        'Updates',
        'Re-import Employees to merge by ID. Missing rows are retained. Use Inactive status for exits.',
      ],
      [
        'Functional reporting',
        'Separate Functional Manager IDs with semicolons. These do not replace the direct manager.',
      ],
      [
        'Status',
        'Active, Inactive, or Needs review. Resolve all review items before validation.',
      ],
      [
        'Scope',
        'This workbook edits employee data only; save the JSON master for complete history and approval evidence.',
      ],
      [
        'Approval',
        'Any structural change creates a new draft and requires fresh HR validation and stakeholder approval.',
      ],
    ],
  );
  if (!template) {
    add('Document control', documentControlHeaders, controlRows(doc));
    add(
      'Change log',
      ['Date', 'Version', 'Description', 'Updated by'],
      doc.history.map((h) => [h.date, h.version, h.description, h.by]),
    );
    add(
      'Approval evidence',
      [
        'Version',
        'Kind',
        'Person',
        'Role',
        'Date',
        'Evidence reference',
        'Note',
        'Recorded by',
      ],
      doc.evidence.map((e) => [
        e.version,
        e.kind,
        e.person,
        e.role,
        e.date,
        e.reference,
        e.note,
        e.recordedBy,
      ]),
    );
    add(
      'Required approvers',
      ['Person', 'Role', 'Assigned login email'],
      doc.approvers.map((a) => [a.person, a.role, a.email || '']),
    );
    add(
      'Current functions',
      ['Department', 'Summary'],
      doc.functions.map((f) => [f.name, f.summary]),
    );
    add(
      'October proposals',
      ['Department / Function', 'Positions / Roles', 'Summary'],
      doc.proposals.map((p) => [p.name, p.roles, p.summary]),
    );
  }
  wb.eachSheet((sh) => {
    sh.views = [{ state: 'frozen', ySplit: 1 }];
    sh.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sh.columnCount },
    };
    sh.columns.forEach((col, i) => {
      col.width =
        sh.name === 'Employees'
          ? [16, 30, 23, 43, 28, 18, 26, 18, 38, 24, 65][i] || 35
          : sh.columnCount === 2
            ? i === 0
              ? 26
              : 90
            : sh.name === 'Change log'
              ? [25, 18, 95, 30][i] || 35
              : i === 0
                ? 22
                : i === 1
                  ? 30
                  : 65;
    });
    sh.eachRow((row, n) => {
      row.alignment = { vertical: 'top', wrapText: true };
      row.height =
        n === 1
          ? 30
          : Math.min(
              409,
              Math.max(
                38,
                ...(row.values instanceof Array
                  ? row.values
                      .slice(1)
                      .map(
                        (value, i) =>
                          Math.ceil(
                            (typeof value === 'string' ||
                            typeof value === 'number'
                              ? String(value)
                              : JSON.stringify(value ?? '')
                            ).length /
                              Math.max(
                                10,
                                (sh.getColumn(i + 1).width || 30) - 4,
                              ),
                          ) *
                            19 +
                          14,
                      )
                  : [38]),
              ),
            );
      row.eachCell((cell) => {
        cell.font = {
          name: 'Calibri',
          size: 13,
          color: { argb: n === 1 ? 'FFFFFFFF' : 'FF12233D' },
          bold: n === 1,
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: n === 1 ? 'FF12233D' : n % 2 ? 'FFF2F6F2' : 'FFFFFFFF',
          },
        };
      });
    });
  });
  return new Blob([(await wb.xlsx.writeBuffer()) as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
export { exportPdf, preparePdf } from './pdf-export';
export async function svgToPng(svg: string) {
  const l = new Blob([svg], { type: 'image/svg+xml' }),
    url = URL.createObjectURL(l);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error('Chart image could not be rendered.'));
      img.src = url;
    });
    const scale = Math.min(2, 5000 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Uint8Array(
      await (
        await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Image export failed.'))),
            'image/png',
          ),
        )
      ).arrayBuffer(),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function exportWord(
  doc: OrgDocument,
  rasterize: (svg: string) => Promise<Uint8Array> = svgToPng,
  options: ChartOptions & { sections?: readonly PdfSection[] } = {},
) {
  const selected = new Set<PdfSection>(
    options.sections || ['chart', 'control', 'departments'],
  );
  if (!selected.size) throw new Error('Select at least one report section.');
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ImageRun,
    PageOrientation,
    TableLayoutType,
    BorderStyle,
  } = await import('docx');
  const heading = (text: string) =>
    new Paragraph({
      text,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 220, after: 140 },
    });
  const table = (
    rows: string[][],
    options: { columnWidths?: number[]; fontSize?: number } = {},
  ) =>
    new Table({
      width: options.columnWidths
        ? {
            size: options.columnWidths.reduce((total, width) => total + width, 0),
            type: WidthType.DXA,
          }
        : { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: options.columnWidths,
      layout: options.columnWidths ? TableLayoutType.FIXED : undefined,
      margins: { top: 55, bottom: 55, left: 55, right: 55 },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
        left: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
        right: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
        insideHorizontal: {
          style: BorderStyle.SINGLE,
          size: 3,
          color: 'CBD5E1',
        },
        insideVertical: { style: BorderStyle.SINGLE, size: 3, color: 'CBD5E1' },
      },
      rows: rows.map(
        (row, i) =>
          new TableRow({
            tableHeader: i === 0,
            cantSplit: true,
            children: row.map(
              (text, columnIndex) =>
                new TableCell({
                  width: options.columnWidths
                    ? { size: options.columnWidths[columnIndex], type: WidthType.DXA }
                    : undefined,
                  shading: i === 0 ? { fill: '12233D' } : undefined,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text,
                          bold: i === 0,
                          color: i === 0 ? 'FFFFFF' : '12233D',
                          size: options.fontSize || 26,
                        }),
                      ],
                      spacing: { after: 90 },
                    }),
                  ],
                }),
            ),
          }),
      ),
    });
  const sections = chartPages(doc, options);
  const fullChart = {
    ...chartLayout(doc, options),
    title: 'Organizational chart',
  };
  const chartParagraph = async (page: typeof sections.overview) => {
    const image = await rasterize(chartPageSvg(doc, page)),
      scale = Math.min(950 / page.width, 560 / page.height);
    return new Paragraph({
      children: [
        new ImageRun({
          type: 'png',
          data: image,
          transformation: {
            width: page.width * scale,
            height: page.height * scale,
          },
        }),
      ],
    });
  };
  const chart = selected.has('chart')
    ? await chartParagraph(fullChart)
    : null;
  const branchCharts = [];
  if (selected.has('branches'))
    for (const page of sections.pages)
      branchCharts.push(
      new Paragraph({
        text: page.title,
        pageBreakBefore: true,
        heading: HeadingLevel.HEADING_1,
      }),
      await chartParagraph(page),
    );
  const sectionHeading = (text: string) =>
    new Paragraph({
      text,
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
      spacing: { before: 220, after: 140 },
    });
  const employeeRegister = [
    [
      'ID',
      'Employee / designation',
      'Department',
      'Direct manager',
      'Status',
    ],
    ...employeeRows(doc).map((row) => [
      row[0],
      row[1] + '\n' + row[2],
      row[3],
      row[4],
      row[6],
    ]),
  ];
  const document = new Document({
    creator: doc.updatedBy,
    title: `${doc.company} organizational chart`,
    description:
      'Controlled chart snapshot and editable employee/register tables. Use the web workspace or PowerPoint export to edit chart shapes.',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 26, color: '12233D' } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 600, bottom: 600, left: 700, right: 700 },
          },
        },
        children: [
          heading(`${doc.company} | Organizational chart`),
          new Paragraph(`Version ${doc.version}`),
          ...(chart ? [chart] : []),
          ...branchCharts,
          ...(selected.has('control')
            ? [
                sectionHeading('Document control'),
                table([documentControlHeaders, ...controlRows(doc)], {
            // Fixed geometry prevents Word from stretching the 11-column
            // register into detached pieces when the document is edited.
                  columnWidths: [470, 640, 2700, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
                  fontSize: 14,
                }),
              ]
            : []),
          ...(selected.has('departments')
            ? [
                sectionHeading('Current department functions'),
                table([['Department', 'Function / description'], ...departmentRows(doc)]),
              ]
            : []),
          ...(selected.has('employees')
            ? [
                sectionHeading('Employee register'),
                table(employeeRegister, {
                  columnWidths: [700, 2800, 1900, 2700, 1200],
                  fontSize: 18,
                }),
              ]
            : []),
          ...(selected.has('history')
            ? [
                sectionHeading('Change log'),
                table([
                  ['Version / date', 'Change / updated by'],
                  ...doc.history.map((h) => [
                    h.version + '\n' + h.date.slice(0, 10),
                    h.description + '\n' + h.by,
                  ]),
                ]),
              ]
            : []),
          ...(selected.has('issues')
            ? [
                sectionHeading('Data review items'),
                table(
                  [
                    ['Employee ID', 'Item'],
                    ...issuesFor(doc).map((issue) => [
                      issue.employeeId || '',
                      issue.message,
                    ]),
                  ],
                  { columnWidths: [1800, 7500], fontSize: 18 },
                ),
              ]
            : []),
        ],
      },
    ],
  });
  return Packer.toBlob(document);
}
export async function exportPowerPoint(
  doc: OrgDocument,
  options: ChartOptions = {},
) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = doc.updatedBy;
  pptx.title = doc.company + ' organizational chart';
  const width = 13.333,
    height = 7.5;
  const full = { ...chartLayout(doc, options), title: 'Organization overview' };
  for (const [index, l] of [full, ...teamChartPages(doc, options)].entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(l.title, {
      x: 0.4,
      y: 0.15,
      w: 12.5,
      h: 0.35,
      fontSize: 22,
      bold: true,
      color: '12233D',
      margin: 0,
    });
    slide.addText(
      index === 0
        ? 'Full hierarchy. Following slides show readable, editable team details.'
        : REPORTING_NOTE,
      {
        x: 0.4,
        y: 0.6,
        w: 12.5,
        h: 0.25,
        fontSize: 12,
        color: '334155',
        margin: 0,
      },
    );
    const s = Math.min(
      (width - 0.8) / l.width,
      (height - 1.4) / Math.max(280, l.height - l.top),
    );
    const px = (x: number) => 0.4 + x * s,
      py = (y: number) => 1 + (y - l.top) * s;
    for (const c of l.connections)
      for (let i = 1; i < c.points.length; i++) {
        const [x1, y1] = c.points[i - 1],
          [x2, y2] = c.points[i];
        slide.addShape(pptx.ShapeType.line, {
          x: px(Math.min(x1, x2)),
          y: py(Math.min(y1, y2)),
          w: Math.abs(x2 - x1) * s,
          h: Math.abs(y2 - y1) * s,
          line: {
            color: '64748B',
            width: 1.2,
          },
        });
      }
    for (const n of l.nodes) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: px(n.x),
        y: py(n.y),
        w: n.width * s,
        h: n.height * s,
        rectRadius: 0.05,
        fill: { color: n.fill.slice(1) },
        line: { color: n.color.slice(1), width: 0.6 },
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: px(n.x),
        y: py(n.y + 5),
        w: 6 * s,
        h: (n.height - 10) * s,
        fill: { color: n.color.slice(1) },
        line: { transparency: 100 },
      });
      for (const line of n.lines)
        slide.addText(line.text, {
          x: px(n.x + 20),
          y: py(n.y + line.y - line.size),
          w: (n.width - 40) * s,
          h: (line.size + 6) * s,
          margin: 0,
          fontSize: line.size * s * 72,
          bold: line.kind === 'name',
          color: CARD_TEXT.slice(1),
          align: 'left',
          breakLine: false,
          valign: 'top',
        });
    }
    slide.addText(`${doc.company} | v${doc.version}`, {
      x: 0.4,
      y: 7.15,
      w: 12,
      h: 0.2,
      fontSize: 10,
      color: '334155',
      margin: 0,
    });
  }
  for (const [title, rows] of [
    [
      'Department color legend',
      [
        ['Color', 'Meaning'],
        ...chartLegend(doc).map((e) => [e.color, e.label]),
        [
          'Light fill',
          'Has direct reports (including collapsed or hidden teams)',
        ],
        ['White fill', 'No active direct reports'],
      ],
    ],
    ['Document control', [documentControlHeaders, ...controlRows(doc)]],
    [
      'Current department functions',
      [['Department', 'Function'], ...departmentRows(doc)],
    ],
    [
      'Change log',
      [
        ['Version / date', 'Change / updated by'],
        ...doc.history.map((h) => [
          h.version + ' / ' + h.date.slice(0, 10),
          h.description + ' / ' + h.by,
        ]),
      ],
    ],
  ] as [string, string[][]][]) {
    const slide = pptx.addSlide();
    slide.addText(title, {
      x: 0.4,
      y: 0.2,
      w: 12.5,
      h: 0.4,
      fontSize: 22,
      color: '12233D',
      bold: true,
    });
    slide.addTable(
      rows.map((row, i) =>
        row.map((text) => ({
          text,
          options: {
            color: i === 0 ? 'FFFFFF' : '12233D',
            fill: { color: i === 0 ? '12233D' : 'FFFFFF' },
            bold: i === 0,
          },
        })),
      ),
      {
        x: 0.4,
        y: 1,
        w: 12.5,
        colW:
          title === 'Document control'
            ? [0.45, 0.6, 2.2, 1.16, 1.16, 1.16, 1.16, 1.16, 1.16, 1.16, 1.16]
            : [3, 9.5],
        fontSize: title === 'Document control' ? 8 : 15,
        color: '12233D',
        border: { pt: 0.5, color: '94A3B8' },
        margin: 0.08,
        autoPage: true,
        autoPageRepeatHeader: true,
        autoPageHeaderRows: 1,
        autoPageSlideStartY: 0.5,
      },
    );
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}
