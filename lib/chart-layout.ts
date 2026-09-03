import { activeForest, descendantIds, emptyEmployee } from './organization';
import type { Employee, OrgDocument } from './model';
import {
  chartTop,
  chartNodeColor,
  legendItems,
  branchFill,
  CARD_FILL,
  CARD_TEXT,
  FILL_NOTE,
  REPORTING_NOTE,
} from './chart-style';
import { verticalTwoLayout } from './vertical-two';

export type ChartDirection = 'vertical' | 'vertical-2' | 'horizontal';
export type ChartOptions = {
  direction?: ChartDirection;
  visibleIds?: Set<string>;
  collapsedIds?: Set<string>;
  showFunctional?: boolean;
};
export type ChartLine = { text: string; kind: string; size: number; y: number };
export type ChartNode = {
  employee: Employee;
  kind: 'employee' | 'board';
  color: string;
  fill: string;
  hasReports: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: ChartLine[];
};
export type ChartConnection = {
  from: string;
  to: string;
  functional: boolean;
  points: [number, number][];
};
export const wrap = (s: string, n: number) => {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > n && line) {
      out.push(line);
      line = '';
    }
    if (word.length > n) {
      if (line) {
        out.push(line);
        line = '';
      }
      for (let i = 0; i < word.length; i += n) out.push(word.slice(i, i + n));
    } else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out;
};
export function chartLayout(doc: OrgDocument, options: ChartOptions = {}) {
  const direction = options.direction || 'vertical';
  const top = chartTop(doc);
  const { all } = activeForest(doc);
  let employees = all.filter(
    (e) => !options.visibleIds || options.visibleIds.has(e.id),
  );
  let boardId = '__governing_body__';
  while (doc.employees.some((e) => e.id === boardId)) boardId += '_';
  // The Board is a chart-only entity: it never enters the employee register or headcount.
  if (
    doc.governance &&
    employees.some((e) => e.id === doc.governance!.ceoId && !e.managerId)
  ) {
    employees = employees.map((e) =>
      e.id === doc.governance!.ceoId ? { ...e, managerId: boardId } : e,
    );
    employees.unshift({
      ...emptyEmployee(),
      id: boardId,
      name: doc.governance.boardName,
      title: 'Governing body',
      department: '',
      rootConfirmed: true,
    });
  }
  const map = new Map(employees.map((e) => [e.id, e]));
  const nodes: ChartNode[] = [],
    edges: [string, string][] = [];
  const children = new Map<string, string[]>(),
    depths = new Map<string, number>();
  const seen = new Set<string>(),
    rootIds: string[] = [];
  const rank = (e: Employee) =>
    e.id === boardId ? -1 : ({ CEO: 0, CTO: 1, COO: 2, CSO: 3 }[e.title] ?? 5);
  const sorted = [...employees].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
  const make = (e: Employee, depth: number) => {
    seen.add(e.id);
    depths.set(e.id, depth);
    const board = e.id === boardId;
    let y = 30;
    const lines: ChartLine[] = [];
    const add = (text: string, kind: string, size: number) => {
      for (const part of wrap(text, size === 19 ? 27 : 35)) {
        lines.push({ text: part, kind, size, y });
        y += size + 7;
      }
    };
    add(e.title, 'title', 16);
    add(e.name, 'name', 19);
    if (!board) {
      add(e.department, 'department', 15);
      add('ID ' + e.id, 'detail', 13);
      if (!e.managerId && !e.rootConfirmed && doc.governance?.ceoId !== e.id)
        add('Top-level position unconfirmed', 'warning', 13);
      else if (e.managerId && !map.has(e.managerId))
        add('Manager outside this view', 'warning', 13);
      if (options.showFunctional !== false)
        for (const id of e.functionalIds)
          add(
            'Cross-functional: ' +
              (doc.employees.find((p) => p.id === id)?.name || id),
            'functional',
            13,
          );
      if (
        options.showFunctional !== false &&
        !e.functionalIds.length &&
        e.functionalReference
      )
        add(
          'Cross-functional (unresolved): ' + e.functionalReference,
          'functional',
          13,
        );
    }
    const color = chartNodeColor(doc, e.department, board);
    // Full active data, not the current filtered/collapsed view, determines tint.
    const hasReports = board || all.some((person) => person.managerId === e.id);
    nodes.push({
      employee: doc.employees.find((original) => original.id === e.id) || e,
      kind: board ? 'board' : 'employee',
      color,
      fill: hasReports ? branchFill(color) : CARD_FILL,
      hasReports,
      x: 0,
      y: 0,
      width: 320,
      height: Math.max(110, y + 14),
      lines,
    });
    const ids: string[] = [];
    if (!options.collapsedIds?.has(e.id))
      for (const child of sorted.filter((p) => p.managerId === e.id)) {
        if (seen.has(child.id)) continue;
        ids.push(child.id);
        edges.push([e.id, child.id]);
        make(child, depth + 1);
      }
    children.set(e.id, ids);
  };
  for (const e of sorted.filter((e) => !e.managerId || !map.has(e.managerId))) {
    rootIds.push(e.id);
    make(e, 0);
  }
  if (!options.collapsedIds?.size)
    for (const e of sorted)
      if (!seen.has(e.id)) {
        rootIds.push(e.id);
        make(e, 0);
      }
  const nodeMap = new Map(nodes.map((n) => [n.employee.id, n]));
  const sizes = new Map<string, number>();
  const gap = 44,
    levelGap = 90;
  const measure = (id: string): number => {
    const n = nodeMap.get(id)!,
      subs = (children.get(id) || []).map(measure);
    const size = Math.max(
      direction === 'vertical' ? n.width : n.height,
      subs.reduce((a, b) => a + b, 0) + Math.max(0, subs.length - 1) * gap,
    );
    sizes.set(id, size);
    return size;
  };
  // All cards at the same depth share a row/column, even with multi-line titles.
  const levelSizes: number[] = [],
    offsets: number[] = [];
  for (const n of nodes) {
    const depth = depths.get(n.employee.id)!;
    levelSizes[depth] = Math.max(
      levelSizes[depth] || 0,
      direction === 'vertical' ? n.height : n.width,
    );
  }
  let along = direction === 'vertical' ? top : 40;
  levelSizes.forEach((size, i) => {
    offsets[i] = along;
    along += size + levelGap;
  });
  const place = (id: string, cross: number) => {
    const n = nodeMap.get(id)!,
      size = sizes.get(id)!;
    if (direction === 'vertical') {
      n.x = cross + (size - n.width) / 2;
      n.y = offsets[depths.get(id)!];
    } else {
      n.x = offsets[depths.get(id)!];
      n.y = cross + (size - n.height) / 2;
    }
    const ids = children.get(id) || [];
    const total =
      ids.reduce((sum, c) => sum + sizes.get(c)!, 0) +
      Math.max(0, ids.length - 1) * gap;
    let start = cross + (size - total) / 2;
    for (const child of ids) {
      place(child, start);
      start += sizes.get(child)! + gap;
    }
    // Center the parent over the visible children's connector span, including
    // when neighboring teams have very different subtree sizes.
    if (ids.length) {
      const first = nodeMap.get(ids[0])!,
        last = nodeMap.get(ids[ids.length - 1])!;
      if (direction === 'vertical')
        n.x =
          (first.x + first.width / 2 + last.x + last.width / 2) / 2 -
          n.width / 2;
      else
        n.y =
          (first.y + first.height / 2 + last.y + last.height / 2) / 2 -
          n.height / 2;
    }
  };
  rootIds.forEach(measure);
  const total =
    rootIds.reduce((sum, id) => sum + sizes.get(id)!, 0) +
    Math.max(0, rootIds.length - 1) * 70;
  let cross = direction === 'vertical' ? Math.max(40, (800 - total) / 2) : top;
  for (const id of rootIds) {
    place(id, cross);
    cross += sizes.get(id)! + 70;
  }
  let connections: ChartConnection[] = edges.map(([from, to]) => {
    const p = nodeMap.get(from)!,
      n = nodeMap.get(to)!;
    const bend =
      direction === 'vertical' ? n.y - levelGap / 2 : n.x - levelGap / 2;
    const points: [number, number][] =
      direction === 'vertical'
        ? [
            [p.x + p.width / 2, p.y + p.height],
            [p.x + p.width / 2, bend],
            [n.x + n.width / 2, bend],
            [n.x + n.width / 2, n.y],
          ]
        : [
            [p.x + p.width, p.y + p.height / 2],
            [bend, p.y + p.height / 2],
            [bend, n.y + n.height / 2],
            [n.x, n.y + n.height / 2],
          ];
    return { from, to, functional: false, points };
  });
  if (direction === 'vertical-2')
    connections = verticalTwoLayout(
      nodes,
      children,
      rootIds,
      top,
      doc.governance ? 2 : 1,
    );
  return {
    nodes,
    connections,
    direction,
    top,
    width: Math.max(800, ...nodes.map((n) => n.x + n.width + 60)),
    height: Math.max(450, ...nodes.map((n) => n.y + n.height + 60)),
  };
}
export const xml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
export const connectionPath = (c: ChartConnection) =>
  c.points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
export function chartPages(doc: OrgDocument, options: ChartOptions = {}) {
  const { all, roots } = activeForest(doc);
  const overviewIds = new Set(
    roots.flatMap((e) => [
      e.id,
      ...all.filter((c) => c.managerId === e.id).map((c) => c.id),
    ]),
  );
  const overview = {
    ...chartLayout(doc, { ...options, visibleIds: overviewIds }),
    title: 'Executive overview',
  };
  const branchRoots = roots.flatMap((root) => {
    const reports = all.filter((e) => e.managerId === root.id);
    return doc.governance?.ceoId === root.id && reports.length
      ? reports
      : [root];
  });
  const pages = branchRoots.map((root) => {
    const ids = new Set([root.id, ...descendantIds(root.id, all)]);
    if (doc.governance && root.managerId === doc.governance.ceoId)
      ids.add(doc.governance.ceoId);
    return {
      ...chartLayout(doc, { ...options, visibleIds: ids }),
      title: `${root.name} - ${root.title}`,
    };
  });
  return { overview, pages };
}
export function chartPageSvg(
  doc: OrgDocument,
  page: ReturnType<typeof chartPages>['overview'],
) {
  return layoutSvg(doc, page, page.title);
}
export function teamChartPages(doc: OrgDocument, options: ChartOptions = {}) {
  const { all, roots } = activeForest(doc);
  const pages: (ReturnType<typeof chartLayout> & { title: string })[] = [];
  for (const parent of all) {
    const children = all.filter((e) => e.managerId === parent.id);
    if (!children.length && !roots.some((e) => e.id === parent.id)) continue;
    for (let i = 0; i < Math.max(1, children.length); i += 3) {
      const visibleIds = new Set([
        parent.id,
        ...children.slice(i, i + 3).map((e) => e.id),
      ]);
      pages.push({
        ...chartLayout(doc, { ...options, visibleIds }),
        title: `${parent.name} - team${children.length > 3 ? ` (${Math.floor(i / 3) + 1}/${Math.ceil(children.length / 3)})` : ''}`,
      });
    }
  }
  return pages;
}
function layoutSvg(
  doc: OrgDocument,
  l: ReturnType<typeof chartLayout>,
  title: string,
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${l.width}" height="${l.height}" viewBox="0 0 ${l.width} ${l.height}"><rect width="100%" height="100%" fill="#ffffff"/><g font-family="Arial, sans-serif"><text x="40" y="42" font-size="28" font-weight="bold" fill="#12233d">${xml(doc.company)}</text><text x="40" y="74" font-size="20" fill="#12233d">${xml(title)}</text><text x="40" y="100" font-size="14" fill="#334155">Version ${xml(doc.version)} | ${xml(doc.updatedDate.slice(0, 10))}</text><text x="40" y="128" font-size="14" font-weight="bold" fill="#12233d">Department color legend</text>${legendItems(
    doc,
  )
    .map(
      (item) =>
        `<rect x="${item.x}" y="${item.y - 13}" width="18" height="16" rx="2" fill="${item.color}"/>${item.lines.map((line, i) => `<text x="${item.x + 26}" y="${item.y + i * 18}" font-size="14" fill="#12233d">${xml(line)}</text>`).join('')}`,
    )
    .join(
      '',
    )}<text x="40" y="${l.top - 46}" font-size="13" fill="#334155">${FILL_NOTE}</text><text x="40" y="${l.top - 24}" font-size="13" fill="#334155">${REPORTING_NOTE}</text>${l.connections.map((c) => `<path d="${connectionPath(c)}" fill="none" stroke="#64748b" stroke-width="2"/>`).join('')}${l.nodes.map((n) => `<g><rect x="${n.x + 1}" y="${n.y + 3}" width="${n.width}" height="${n.height}" rx="8" fill="#12233d" opacity=".08"/><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="8" stroke="${n.color}" stroke-width="1.5" fill="${n.fill}"/><rect x="${n.x}" y="${n.y + 5}" width="6" height="${n.height - 10}" rx="2" fill="${n.color}"/>${n.lines.map((line) => `<text x="${n.x + 20}" y="${n.y + line.y}" font-size="${line.size}" font-weight="${line.kind === 'name' ? 'bold' : 'normal'}" fill="${CARD_TEXT}">${xml(line.text)}</text>`).join('')}</g>`).join('')}</g></svg>`;
}
export function chartSvg(doc: OrgDocument, options: ChartOptions = {}) {
  return layoutSvg(doc, chartLayout(doc, options), 'Organizational chart');
}
