import type { OrgDocument } from './model';
import { departmentColor } from './model';
import { chartLayout, chartPages, chartPageSvg, wrap } from './chart-layout';
import { approvalStatus, issuesFor } from './organization';
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
export const filename = (doc: OrgDocument, suffix: string) =>
  `${doc.company.replace(/[^a-z0-9-]/gi, '_')}-org-chart-v${doc.version}.${suffix}`;
export function controlRows(doc: OrgDocument) {
  return [
    ['Version', doc.version],
    [
      'Status',
      approvalStatus(doc).approved ? 'Approved' : 'Draft — not approved',
    ],
    ['Created by', doc.createdBy],
    ['Created date', doc.createdDate],
    ['Updated by', doc.updatedBy],
    ['Updated date', doc.updatedDate],
    ['Validated by', doc.validatedBy || 'Pending HR validation'],
    ['Validated date', doc.validatedDate || 'Pending'],
    ['Approved by', doc.approvedBy || 'Pending stakeholder approvals'],
    ['Approval date', doc.approvalDate || 'Pending'],
    ['Next review', doc.reviewDate || 'Monthly and after significant changes'],
    ['Review items', String(issuesFor(doc).length)],
    ['Owner', 'Marketing team'],
    ['Data validation', 'HR team'],
    [
      'Approval evidence',
      'Recorded references are not digital signatures. Retain original evidence in the official HR archive.',
    ],
  ];
}
export function employeeRows(doc: OrgDocument) {
  return doc.employees.map((e) => [
    e.id,
    e.name,
    e.title,
    e.department,
    doc.employees.find((p) => p.id === e.managerId)?.name ||
      e.managerReference ||
      (e.rootConfirmed ? 'Top level confirmed' : 'Not confirmed'),
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
    add('Document control', ['Field', 'Value'], controlRows(doc));
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
      ['Person', 'Role'],
      doc.approvers.map((a) => [a.person, a.role]),
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
                            15 +
                          14,
                      )
                  : [38]),
              ),
            );
      row.eachCell((cell) => {
        cell.font = {
          name: 'Calibri',
          size: 11,
          color: { argb: n === 1 ? 'FFFFFFFF' : 'FF304B41' },
          bold: n === 1,
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: n === 1 ? 'FF176F62' : n % 2 ? 'FFF2F6F2' : 'FFFFFFFF',
          },
        };
      });
    });
  });
  return new Blob([(await wb.xlsx.writeBuffer()) as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
export async function exportPdf(doc: OrgDocument) {
  const { jsPDF } = await import('jspdf');
  const l = chartLayout(doc);
  const pdf = new jsPDF({
    unit: 'pt',
    format: [l.width, l.height],
    orientation: l.width > l.height ? 'landscape' : 'portrait',
  });
  pdf.setTextColor('#176f62');
  pdf.setFontSize(25);
  pdf.text(`${doc.company} | Organizational chart`, l.width / 2, 40, {
    align: 'center',
  });
  pdf.setFontSize(12);
  pdf.setTextColor('#637769');
  pdf.text(
    `Version ${doc.version} | ${approvalStatus(doc).approved ? 'APPROVED' : 'DRAFT - NOT APPROVED'} | ${doc.updatedDate.slice(0, 10)}`,
    l.width / 2,
    67,
    { align: 'center' },
  );
  pdf.setFontSize(10);
  pdf.text(
    'Solid lines: direct reporting. Functional managers are identified on each applicable card.',
    l.width / 2,
    90,
    { align: 'center' },
  );
  pdf.text(
    'Unconfirmed executive reporting lines remain HR review items; no hierarchy is inferred.',
    l.width / 2,
    109,
    { align: 'center' },
  );
  for (const n of l.nodes) {
    const parent = l.nodes.find((p) => p.employee.id === n.employee.managerId);
    if (parent) {
      pdf.setDrawColor('#a2b8aa');
      pdf.line(
        parent.x + 8,
        parent.y + parent.height,
        parent.x + 8,
        n.y + n.height / 2,
      );
      pdf.line(parent.x + 8, n.y + n.height / 2, n.x, n.y + n.height / 2);
    }
  }
  for (const n of l.nodes) {
    pdf.setFillColor(
      n.employee.department === 'Management' ? '#f0f5fd' : '#ffffff',
    );
    pdf.setDrawColor('#d6e1d8');
    pdf.roundedRect(n.x, n.y, n.width, n.height, 6, 6, 'FD');
    pdf.setFillColor(departmentColor(n.employee.department));
    pdf.rect(n.x, n.y + 7, 3, n.height - 14, 'F');
    n.lines.forEach((line, i) => {
      pdf.setFont('helvetica', line.kind === 'name' ? 'bold' : 'normal');
      pdf.setFontSize(line.kind === 'name' ? 12 : 10);
      pdf.setTextColor(line.kind === 'functional' ? '#7763a0' : '#345343');
      pdf.text(line.text.replaceAll('·', '|'), n.x + 13, n.y + 23 + i * 16);
    });
  }
  let y = 0;
  function page(title: string) {
    pdf.addPage('a4', 'portrait');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor('#176f62');
    pdf.setFontSize(18);
    pdf.text(title, 35, 40);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(
      `${doc.company} | v${doc.version} | ${approvalStatus(doc).approved ? 'Approved' : 'Draft - not approved'}`,
      35,
      59,
    );
    y = 85;
  }
  function textRows(lines: string[]) {
    for (const str of lines) {
      const lines = pdf.splitTextToSize(str, 515) as string[];
      for (const line of lines) {
        if (y > 785) page('Organizational chart - continued');
        pdf.setTextColor('#304B41');
        pdf.setFontSize(10);
        pdf.text(line, 35, y);
        y += 14;
      }
      y += 7;
    }
  }
  for (const tile of chartPages(doc).pages) {
    pdf.addPage('a3', 'landscape');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(19);
    pdf.setTextColor('#176f62');
    pdf.text(`${doc.company} | ${tile.title}`, 35, 38);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(
      `v${doc.version} | ${approvalStatus(doc).approved ? 'Approved' : 'Draft - not approved'} | Direct and functional managers are named on each card.`,
      35,
      62,
    );
    for (const n of tile.nodes) {
      pdf.setFillColor('#ffffff');
      pdf.setDrawColor('#d6e1d8');
      pdf.roundedRect(n.x, n.y - 40, n.width, n.height, 6, 6, 'FD');
      pdf.setFillColor(departmentColor(n.employee.department));
      pdf.rect(n.x, n.y - 33, 3, n.height - 14, 'F');
      n.lines.forEach((line, i) => {
        pdf.setFont('helvetica', line.kind === 'name' ? 'bold' : 'normal');
        pdf.setFontSize(line.kind === 'name' ? 12 : 10);
        pdf.setTextColor(line.kind === 'functional' ? '#7763a0' : '#345343');
        pdf.text(line.text.replaceAll('·', '|'), n.x + 13, n.y - 17 + i * 16);
      });
    }
  }
  page('Document control');
  textRows(controlRows(doc).map((r) => r.join(': ')));
  page('Employee and reporting register');
  employeeRows(doc).forEach((r) =>
    textRows([
      `${r[0]} | ${r[1]} | ${r[2]}`,
      `${r[3]} | ${r[6]} | Reports to: ${r[4]}${r[5] ? ' | Functional: ' + r[5] : ''}`,
    ]),
  );
  page('Current department functions');
  textRows(
    doc.functions.length
      ? doc.functions.map((f) => `${f.name}: ${f.summary}`)
      : [
          'Function descriptions have not yet been supplied by HR. Refer to the employee register for current departments and roles.',
        ],
  );
  page('Required stakeholders & approval evidence');
  textRows(doc.approvers.map((a) => `${a.person} — ${a.role}`));
  textRows(
    doc.evidence.length
      ? doc.evidence.map(
          (e) =>
            `${e.version} | ${e.kind} | ${e.person} | ${e.role} | ${e.date}\nEvidence: ${e.reference}\n${e.note} | Recorded by: ${e.recordedBy}`,
        )
      : ['No approval evidence recorded.'],
  );
  page('Revision history');
  textRows(
    doc.history.map(
      (h) => `${h.version} | ${h.date} | ${h.by}\n${h.description}`,
    ),
  );
  const issues = issuesFor(doc);
  if (issues.length) {
    page('Open HR review items');
    textRows(issues.map((i) => i.message));
  }
  return pdf.output('blob');
}
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
) {
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
  } = await import('docx');
  const heading = (text: string) =>
    new Paragraph({
      text,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 220, after: 140 },
    });
  const table = (rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(
        (row, i) =>
          new TableRow({
            tableHeader: i === 0,
            cantSplit: true,
            children: row.map(
              (text) =>
                new TableCell({
                  shading: i === 0 ? { fill: '176F62' } : undefined,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text,
                          bold: i === 0,
                          color: i === 0 ? 'FFFFFF' : '304B41',
                          size: 19,
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
  const sections = chartPages(doc);
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
  const chart = await chartParagraph(sections.overview);
  const detailCharts = [];
  for (const page of sections.pages)
    detailCharts.push(
      new Paragraph({
        text: page.title,
        pageBreakBefore: true,
        heading: HeadingLevel.HEADING_1,
      }),
      await chartParagraph(page),
    );
  const document = new Document({
    creator: doc.updatedBy,
    title: `${doc.company} organizational chart`,
    description:
      'Controlled chart snapshot and editable employee/register tables. Use the web workspace or PowerPoint export to edit chart shapes.',
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
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
          new Paragraph(
            `Version ${doc.version} — ${approvalStatus(doc).approved ? 'APPROVED' : 'DRAFT — NOT APPROVED'}`,
          ),
          chart,
          ...detailCharts,
          new Paragraph(
            'Chart pages are images with explicit reporting references. The following tables are editable. For editable chart shapes, use the PowerPoint export; for the complete working chart, use the JSON master.',
          ),
        ],
      },
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
        },
        children: [
          heading('Document control'),
          table([['Field', 'Value'], ...controlRows(doc)]),
          heading('Employee and reporting register'),
          ...doc.employees.map((e) =>
            table([
              ['Employee', e.name + ' · ' + e.id],
              ['Designation', e.title],
              ['Department / status', e.department + ' / ' + e.status],
              [
                'Direct manager',
                doc.employees.find((p) => p.id === e.managerId)?.name ||
                  e.managerReference ||
                  (e.rootConfirmed ? 'Top level confirmed' : 'Not confirmed'),
              ],
              [
                'Functional managers',
                e.functionalIds
                  .map(
                    (id) => doc.employees.find((p) => p.id === id)?.name || id,
                  )
                  .join('; ') || 'None',
              ],
              ['Email', e.email || 'Not supplied'],
            ]),
          ),
          heading('Current functions'),
          table([
            ['Department', 'Function'],
            ...doc.functions.map((f) => [f.name, f.summary]),
          ]),
          heading('Required approvers'),
          table([
            ['Person', 'Role'],
            ...doc.approvers.map((a) => [a.person, a.role]),
          ]),
          heading('Approval evidence'),
          table([
            ['Version / person', 'Approval and evidence'],
            ...doc.evidence.map((e) => [
              `${e.version} / ${e.person}`,
              `${e.kind} · ${e.role} · ${e.date}\n${e.reference}\n${e.note}\nRecorded by: ${e.recordedBy}`,
            ]),
          ]),
          heading('Revision history'),
          table([
            ['Version / date', 'Change / recorded by'],
            ...doc.history.map((h) => [
              `${h.version} / ${h.date}`,
              `${h.description}\n${h.by}`,
            ]),
          ]),
          heading('Open HR review items'),
          ...issuesFor(doc).map((i) => new Paragraph(i.message)),
        ],
      },
    ],
  });
  return Packer.toBlob(document);
}
export async function exportPowerPoint(doc: OrgDocument) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  const l = chartLayout(doc);
  const scale = Math.min(18 / l.width, 45 / l.height);
  const width = l.width * scale,
    height = l.height * scale;
  pptx.defineLayout({ name: 'ORG', width, height });
  pptx.layout = 'ORG';
  pptx.author = doc.updatedBy;
  pptx.subject = 'Editable organization chart';
  pptx.title = doc.company + ' organizational chart';
  let slide = pptx.addSlide();
  slide.background = { color: 'FBFDF9' };
  slide.addText(`${doc.company} | Organizational chart`, {
    x: 0.3,
    y: 0.2,
    w: width - 0.6,
    h: 0.4,
    fontSize: 22,
    color: '176F62',
    bold: true,
  });
  slide.addText(
    `v${doc.version} | ${approvalStatus(doc).approved ? 'APPROVED' : 'DRAFT - NOT APPROVED'} | Functional managers are listed in purple.`,
    { x: 0.3, y: 0.75, w: width - 0.6, h: 0.35, fontSize: 11, color: '687C71' },
  );
  for (const n of l.nodes) {
    const p = l.nodes.find((q) => q.employee.id === n.employee.managerId);
    if (p) {
      slide.addShape(pptx.ShapeType.line, {
        x: (p.x + 8) * scale,
        y: (p.y + p.height) * scale,
        w: 0,
        h: (n.y + n.height / 2 - p.y - p.height) * scale,
        line: { color: 'A2B8AA', width: 1 },
      });
      slide.addShape(pptx.ShapeType.line, {
        x: (p.x + 8) * scale,
        y: (n.y + n.height / 2) * scale,
        w: (n.x - p.x - 8) * scale,
        h: 0,
        line: { color: 'A2B8AA', width: 1 },
      });
    }
  }
  for (const n of l.nodes) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: n.x * scale,
      y: n.y * scale,
      w: n.width * scale,
      h: n.height * scale,
      rectRadius: 0.05,
      fill: {
        color: n.employee.department === 'Management' ? 'F0F5FD' : 'FFFFFF',
      },
      line: { color: 'D6E1D8', width: 1 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: n.x * scale,
      y: (n.y + 7) * scale,
      w: 3 * scale,
      h: (n.height - 14) * scale,
      fill: { color: departmentColor(n.employee.department).slice(1) },
      line: { transparency: 100 },
    });
    n.lines.forEach((line, i) =>
      slide.addText(line.text, {
        x: (n.x + 12) * scale,
        y: (n.y + 10 + i * 16) * scale,
        w: (n.width - 24) * scale,
        h: 16 * scale,
        margin: 0,
        fontSize: (line.kind === 'name' ? 12 : 10) * scale * 72,
        bold: line.kind === 'name',
        color: line.kind === 'functional' ? '7763A0' : '345343',
        breakLine: false,
      }),
    );
  }
  const info = [
    ...controlRows(doc).map((r) => r.join(': ')),
    ...doc.approvers.map(
      (a) => 'Required approval: ' + a.person + ' | ' + a.role,
    ),
    ...doc.evidence.map(
      (e) =>
        `${e.version} | ${e.kind} | ${e.person} | ${e.date} | ${e.reference}`,
    ),
    ...doc.history.map(
      (h) => `${h.version} | ${h.date} | ${h.description} | ${h.by}`,
    ),
  ].flatMap((text) => wrap(text, 90));
  const per = Math.max(12, Math.floor((height - 2) / 0.23));
  for (let i = 0; i < info.length; i += per) {
    slide = pptx.addSlide();
    slide.addText('Document control & revision history', {
      x: 0.4,
      y: 0.3,
      w: width - 0.8,
      h: 0.5,
      fontSize: 22,
      color: '176F62',
      bold: true,
    });
    slide.addText(info.slice(i, i + per).join('\n'), {
      x: 0.4,
      y: 1,
      w: width - 0.8,
      h: height - 1.4,
      fontSize: 11,
      color: '345343',
      margin: 0,
      breakLine: false,
      paraSpaceAfter: 6,
    });
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}
