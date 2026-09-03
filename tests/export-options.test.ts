import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { initialDocument } from '../lib/seed';
import { chartLayout, chartSvg, teamChartPages } from '../lib/chart-layout';
import { anchoredChartScroll } from '../lib/chart-viewport';
import { filename, controlRows } from '../lib/exports';
import { preparePdf, exportPdf, pdfSections } from '../lib/pdf-export';
import { evolve, approvalStatus } from '../lib/organization';
import { authorizedChange } from '../selfhost/authorized-change';
import { emailSession } from '../lib/access';
import {
  chartLegend,
  legendItems,
  CARD_TEXT,
  CARD_FILL,
  branchFill,
  FILL_NOTE,
} from '../lib/chart-style';
import { configureLeadership, directManagerLabel } from '../lib/leadership';
import { issuesFor, documentSchema } from '../lib/organization';
const doc = structuredClone(initialDocument);
const legacy = structuredClone(doc);
delete legacy.governance;
for (const employee of legacy.employees.filter((e) =>
  ['1', '2', '3', '4'].includes(e.id),
)) {
  employee.managerId = '';
  employee.rootConfirmed = false;
}
assert(documentSchema.safeParse(legacy).success);
const configured = configureLeadership(legacy, 'Company Board', '3', [
  '1',
  '2',
  '4',
]);
assert.deepEqual(configured.governance, doc.governance);
assert.equal(configured.employees.length, 59);
for (const e of configured.employees.filter(
  (e) => !['1', '2', '3', '4'].includes(e.id),
))
  assert.deepEqual(
    e,
    legacy.employees.find((p) => p.id === e.id),
  );
assert.equal(
  directManagerLabel(
    configured,
    configured.employees.find((e) => e.id === '3')!,
  ),
  'Company Board',
);
assert.throws(() => configureLeadership(legacy, '', '3', ['1']), /Choose/);
assert.throws(
  () => configureLeadership(legacy, 'Company Board', '3', ['3']),
  /Choose/,
);
const invalidBoard = structuredClone(doc);
invalidBoard.employees.find((e) => e.id === '3')!.managerId = '4';
assert(
  issuesFor(invalidBoard).some(
    (i) => i.id === 'governance' && i.severity === 'error',
  ),
);
const fullColors = new Map(
  chartLayout(doc).nodes.map((n) => [n.employee.id, n.color]),
);
const fullNodes = new Map(
  chartLayout(doc).nodes.map((n) => [n.employee.id, n]),
);
for (const id of ['25', '24']) {
  const manager = fullNodes.get(id)!;
  assert(manager.hasReports);
  assert.equal(manager.fill, branchFill(manager.color));
  assert.notEqual(manager.fill, CARD_FILL);
  const filtered = chartLayout(doc, { visibleIds: new Set([id]) }).nodes[0];
  const collapsedManager = chartLayout(doc, {
    collapsedIds: new Set([id]),
  }).nodes.find((n) => n.employee.id === id)!;
  assert.equal(filtered.fill, manager.fill, 'Manager tint survives filtering');
  assert.equal(
    collapsedManager.fill,
    manager.fill,
    'Manager tint survives collapsing',
  );
}
for (const id of ['23', '61']) assert.equal(fullNodes.get(id)!.fill, CARD_FILL);
const inactiveReports = structuredClone(doc);
for (const e of inactiveReports.employees.filter((e) => e.managerId === '24'))
  e.status = 'Inactive';
assert.equal(
  chartLayout(inactiveReports).nodes.find((n) => n.employee.id === '24')!.fill,
  CARD_FILL,
);
for (const p of teamChartPages(doc))
  for (const n of p.nodes)
    assert.equal(n.fill, fullNodes.get(n.employee.id)!.fill);
const luminance = (color: string) => {
  const rgb = color
    .slice(1)
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};
for (const n of fullNodes.values()) {
  assert((luminance(n.fill) + 0.05) / (luminance(CARD_TEXT) + 0.05) >= 4.5);
  assert.equal(
    n.hasReports,
    n.kind === 'board' ||
      doc.employees.some(
        (e) => e.status === 'Active' && e.managerId === n.employee.id,
      ),
  );
  assert.equal(n.fill, n.hasReports ? branchFill(n.color) : CARD_FILL);
}
for (const p of teamChartPages(doc))
  for (const n of p.nodes) assert.equal(n.color, fullColors.get(n.employee.id));
assert.equal(CARD_FILL, '#ffffff');
assert.equal(
  new Set(chartLegend(doc).map((item) => item.color)).size,
  chartLegend(doc).length,
);
for (const color of [CARD_TEXT]) {
  const rgb = color
    .slice(1)
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  assert(
    1.05 / (luminance + 0.05) >= 4.5,
    'Dark text on white contrast: ' + color,
  );
}
console.log(
  'PASS explicit Board setup, preserved headcount, legacy backups, reporting validation and stable department colors',
);
for (const direction of ['vertical', 'vertical-2', 'horizontal'] as const) {
  const l = chartLayout(doc, { direction });
  if (direction === 'vertical-2') {
    const peers = l.nodes.filter(
      (n) => n.employee.managerId === doc.governance!.ceoId,
    );
    assert.equal(peers.length, 7);
    assert.equal(
      new Set(peers.map((n) => n.y)).size,
      1,
      'All CEO reports share one horizontal row',
    );
    assert(peers.some((n) => n.employee.id === '23'));
    assert(peers.some((n) => n.employee.id === '61'));
    for (const peer of peers)
      assert(
        l.connections.some(
          (c) => c.from === doc.governance!.ceoId && c.to === peer.employee.id,
        ),
      );
  }
  assert.equal(l.nodes.length, 54);
  assert.equal(l.nodes.filter((n) => n.kind === 'employee').length, 53);
  assert.equal(l.nodes.filter((n) => n.kind === 'board').length, 1);
  assert.deepEqual(
    l.nodes.find((n) => n.employee.id === '3')?.employee,
    doc.employees.find((e) => e.id === '3'),
    'Opening the CEO editor must never receive a synthetic Board manager ID',
  );
  const boardNode = l.nodes.find((n) => n.kind === 'board')!;
  assert(
    l.connections.some(
      (c) => !c.functional && c.from === boardNode.employee.id && c.to === '3',
    ),
  );
  for (const id of ['1', '2', '4'])
    assert(
      l.connections.some((c) => !c.functional && c.from === '3' && c.to === id),
    );
  for (const n of l.nodes) {
    assert(n.x >= 0 && n.x + n.width < l.width && n.y + n.height < l.height);
    assert(
      n.lines.every(
        (line) => line.size >= 13 && !line.text.includes('Reports to'),
      ),
    );
    const parent = l.nodes.find((p) => p.employee.id === n.employee.managerId);
    if (parent)
      assert(
        direction !== 'horizontal'
          ? n.y >= parent.y + parent.height
          : n.x >= parent.x + parent.width,
      );
    for (const other of l.nodes)
      if (n !== other)
        assert(
          !(
            n.x < other.x + other.width &&
            n.x + n.width > other.x &&
            n.y < other.y + other.height &&
            n.y + n.height > other.y
          ),
        );
  }
  assert.equal(l.connections.filter((c) => !c.functional).length, 53);
  assert.equal(l.connections.filter((c) => c.functional).length, 0);
  assert.equal(
    l.nodes.filter((n) => n.employee.functionalIds.length > 0).length,
    4,
  );
  for (const n of l.nodes.filter((n) => n.employee.functionalIds.length > 0))
    assert(n.lines.some((line) => line.text.includes('Cross-functional')));
  for (const a of l.nodes.filter((n) => n.kind === 'employee'))
    for (const b of l.nodes.filter((n) => n.kind === 'employee')) {
      assert.equal(
        a.color === b.color,
        a.employee.department === b.employee.department,
        'Colors represent department, never role or depth',
      );
    }
  for (const c of l.connections)
    for (let i = 1; i < c.points.length; i++) {
      const [x1, y1] = c.points[i - 1],
        [x2, y2] = c.points[i];
      assert(x1 === x2 || y1 === y2, 'Orthogonal connections');
      for (const n of l.nodes.filter(
        (n) => ![c.from, c.to].includes(n.employee.id),
      )) {
        const crossing =
          x1 === x2
            ? x1 > n.x &&
              x1 < n.x + n.width &&
              Math.max(y1, y2) > n.y &&
              Math.min(y1, y2) < n.y + n.height
            : y1 > n.y &&
              y1 < n.y + n.height &&
              Math.max(x1, x2) > n.x &&
              Math.min(x1, x2) < n.x + n.width;
        assert(
          !crossing,
          'A connector crosses an unrelated card: ' +
            c.from +
            ' → ' +
            c.to +
            ' across ' +
            n.employee.id,
        );
      }
    }
  for (const parent of direction === 'vertical-2' ? [] : l.nodes) {
    const children = l.connections
      .filter((c) => !c.functional && c.from === parent.employee.id)
      .map((c) => l.nodes.find((n) => n.employee.id === c.to)!);
    if (!children.length) continue;
    const centers = children.map((n) =>
      direction === 'vertical' ? n.x + n.width / 2 : n.y + n.height / 2,
    );
    const center =
      direction === 'vertical'
        ? parent.x + parent.width / 2
        : parent.y + parent.height / 2;
    assert.equal(
      center,
      (Math.min(...centers) + Math.max(...centers)) / 2,
      'Parent is centered on the branching line',
    );
  }
  assert(
    !/DRAFT|NOT APPROVED|Reports to|stroke-dasharray|reporting levels/.test(
      chartSvg(doc, { direction }),
    ),
  );
  assert(teamChartPages(doc, { direction }).every((p) => p.nodes.length <= 5));
  const svg = chartSvg(doc, { direction });
  assert(svg.includes(FILL_NOTE));
  for (const n of l.nodes) assert(svg.includes(`fill="${n.fill}"`));
  console.log(
    'PASS ' +
      direction +
      ' hierarchy has all employees, correct connectors, readable fonts and no overlaps',
    l.width,
    l.height,
  );
}
const fullyExpanded = chartLayout(doc, { direction: 'vertical-2' });
const sourceSnapshot = JSON.stringify(doc);
function checkBottomBranches(layout: ReturnType<typeof chartLayout>) {
  for (const parent of layout.nodes.filter(
    (n) => n.kind === 'employee' && n.employee.id !== doc.governance!.ceoId,
  )) {
    const children = layout.nodes.filter(
      (n) => n.employee.managerId === parent.employee.id,
    );
    const managers = children.filter((n) => n.hasReports);
    const leaves = children.filter((n) => !n.hasReports);
    assert(
      new Set(managers.map((n) => n.y)).size <= 1,
      'Expandable peers share the final row',
    );
    for (const manager of managers)
      for (const leaf of leaves)
        assert(
          manager.y >= leaf.y + leaf.height,
          'Expandable managers follow every leaf report',
        );
  }
}
checkBottomBranches(fullyExpanded);
for (const manager of fullyExpanded.nodes.filter(
  (n) => n.kind === 'employee' && n.hasReports,
)) {
  const closed = chartLayout(doc, {
    direction: 'vertical-2',
    collapsedIds: new Set([manager.employee.id]),
  });
  checkBottomBranches(closed);
  for (const node of closed.nodes) {
    const opened = fullyExpanded.nodes.find(
      (n) => n.employee.id === node.employee.id,
    )!;
    assert.equal(
      node.y,
      opened.y,
      'Expanding any branch must not lift its manager or move visible peers up/down',
    );
  }
  const before = closed.nodes.find(
    (n) => n.employee.id === manager.employee.id,
  )!;
  for (const zoom of [0.29, 0.55, 1, 2]) {
    const scroll = {
      left: before.x * zoom,
      top: Math.max(0, before.y * zoom - 100),
    };
    const nextScroll = anchoredChartScroll(before, manager, zoom, scroll);
    assert(
      Math.abs(
        (manager.x + manager.width / 2) * zoom -
          nextScroll.left -
          ((before.x + before.width / 2) * zoom - scroll.left),
      ) < 0.001,
      'Expansion keeps the clicked button at the same horizontal viewport position',
    );
    assert.equal(
      (manager.y + manager.height) * zoom - nextScroll.top,
      (before.y + before.height) * zoom - scroll.top,
      'Expansion keeps the clicked button at the same vertical viewport position',
    );
    const restored = anchoredChartScroll(manager, before, zoom, nextScroll);
    assert(Math.abs(restored.left - scroll.left) < 0.001);
    assert.equal(restored.top, scroll.top);
  }
}
// Multiple expandable managers must remain at the bottom even when only one
// of the teams is open (the CTO's Hardware and Software branches, for example).
for (const closedIds of [['8', '25'], ['8'], ['25'], ['24']]) {
  checkBottomBranches(
    chartLayout(doc, {
      direction: 'vertical-2',
      collapsedIds: new Set(closedIds),
    }),
  );
}
assert.equal(
  JSON.stringify(doc),
  sourceSnapshot,
  'Presentation changes never mutate reporting data',
);
console.log(
  'PASS bottom-only branches, stable expansion order, preserved zoom anchors and unchanged reporting data',
);
const collapsed = chartLayout(doc, {
  collapsedIds: new Set(doc.employees.map((e) => e.id)),
});
assert.equal(collapsed.nodes.length, 2);
assert.equal(
  filename(doc, 'pdf', 'September chart.pdf'),
  'September chart.pdf',
);
assert.equal(filename(doc, 'docx', 'team/report?.pdf'), 'team_report_.docx');
const metadata = { ...doc, company: 'QA controlled chart' };
const next = evolve(
  doc,
  metadata,
  'QA editor',
  'Edited document control',
  true,
);
const latestControl = controlRows(next, 0).at(-1)!;
assert.equal(latestControl[1], next.version);
assert.equal(latestControl[2], 'Edited document control');
assert.equal(latestControl[5], 'QA editor');
assert.equal(approvalStatus(next).approved, false);
assert.equal(next.evidence.length, doc.evidence.length);
for (const role of ['editor', 'hr'] as const) {
  const saved = authorizedChange(
    doc,
    { action: 'save', document: metadata, description: 'Table edit' },
    emailSession('qa@example.com', [role]),
  );
  assert.equal(controlRows(saved, 0).at(-1)?.[2], 'Table edit');
}
assert.throws(() =>
  authorizedChange(
    doc,
    { action: 'save', document: metadata, description: 'Table edit' },
    emailSession('qa@example.com', ['viewer']),
  ),
);
console.log(
  'PASS filenames, row-based control register, audit/version updates and role enforcement',
);
await mkdir('.test-output', { recursive: true });
const allSections = pdfSections.map((s) => s.id);
for (const direction of ['vertical', 'vertical-2', 'horizontal'] as const) {
  const prepared = await preparePdf(doc, { direction, sections: allSections });
  const layout = chartLayout(doc, { direction });
  for (const node of layout.nodes)
    for (const line of node.lines) {
      prepared.pdf.setFont(
        'helvetica',
        line.kind === 'name' ? 'bold' : 'normal',
      );
      prepared.pdf.setFontSize(line.size);
      assert(
        prepared.pdf.getTextWidth(line.text) <= node.width - 40,
        'Card text width: ' + line.text,
      );
    }
  for (const body of Object.values(
    (prepared.pdf.internal as unknown as { pages: string[][] }).pages,
  ).filter(Boolean)) {
    if (body.join('\n').includes('(Department color legend')) {
      assert(body.join('\n').includes(FILL_NOTE));
      for (const entry of legendItems(doc))
        for (const line of entry.lines)
          assert(
            body
              .join('\n')
              .replace(/\\([\\()])/g, '$1')
              .includes(line),
          );
    }
  }
  assert.equal(prepared.pages.length, prepared.pdf.getNumberOfPages());
  assert(prepared.pages.some((p) => p.title === 'Document control'));
  assert(
    prepared.pages.filter((p) => p.title === 'Current department functions')
      .length >= 1,
  );
  await writeFile(
    '.test-output/' + direction + '.pdf',
    new Uint8Array(
      await (
        await exportPdf(doc, { direction, sections: allSections })
      ).arrayBuffer(),
    ),
  );
  console.log('PASS ' + direction + ' PDF manifest:', prepared.pages);
}
const manifest = await preparePdf(doc, {
  sections: ['control', 'departments'],
});
const chosen = manifest.pages.find(
  (p) => p.title === 'Current department functions',
)!.number;
const selection = await exportPdf(doc, {
  sections: ['control', 'departments'],
  pages: [chosen],
});
const bytes = Buffer.from(await selection.arrayBuffer());
assert.equal((bytes.toString().match(/\/Type \/Page\b/g) || []).length, 1);
assert(!bytes.toString().includes('(Document control)'));
await writeFile('.test-output/selected-page.pdf', bytes);
await assert.rejects(
  () => exportPdf(doc, { pages: [] }),
  /Select valid PDF pages/,
);
await assert.rejects(
  () => exportPdf(doc, { pages: [999] }),
  /Select valid PDF pages/,
);
await assert.rejects(
  () => preparePdf(doc, { sections: [] }),
  /Select at least one/,
);
await assert.rejects(
  () => preparePdf({ ...doc, employees: [] }, { sections: ['branches'] }),
  /no pages/,
);
const long = {
  ...doc,
  functions: [
    {
      name: 'Long function',
      summary: 'Long description with repeated content. '.repeat(250),
    },
  ],
};
const split = await preparePdf(long, { sections: ['departments'] });
assert(split.pages.length > 2);
console.log(
  'PASS exact PDF page selection, invalid selection rejection, and long table pagination',
);
