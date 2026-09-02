import { activeForest, approvalStatus, descendantIds } from './organization';
import { departmentColor, type Employee, type OrgDocument } from './model';
export type ChartNode = {
  employee: Employee;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: { text: string; kind: string }[];
};
export const wrap = (s: string, n: number) => {
  const words = s.split(/\s+/),
    out: string[] = [];
  let line = '';
  for (const word of words) {
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
export function chartLayout(doc: OrgDocument) {
  const { all, roots } = activeForest(doc),
    nodes: ChartNode[] = [],
    seen = new Set<string>();
  let maxY = 0;
  roots.forEach((root, index) => {
    let y = 150;
    function visit(e: Employee, depth: number) {
      if (seen.has(e.id)) return;
      seen.add(e.id);
      const indent = Math.min(depth, 8) * 18,
        width = 310 - indent,
        chars = Math.floor((width - 26) / 6.4);
      const manager = doc.employees.find((p) => p.id === e.managerId);
      const lines = [
        ...wrap(e.title, chars).map((text) => ({ text, kind: 'title' })),
        ...wrap(e.name, chars).map((text) => ({ text, kind: 'name' })),
        ...wrap(e.department, chars).map((text) => ({
          text,
          kind: 'department',
        })),
        ...wrap(
          `ID ${e.id} · Reports to: ${manager?.name || (e.managerReference ? 'UNRESOLVED: ' + e.managerReference : e.rootConfirmed ? 'Top level (confirmed)' : 'Not confirmed')}`,
          chars,
        ).map((text) => ({ text, kind: 'detail' })),
        ...e.functionalIds.flatMap((id) =>
          wrap(
            'Functional: ' +
              (doc.employees.find((p) => p.id === id)?.name || id),
            chars,
          ).map((text) => ({ text, kind: 'functional' })),
        ),
      ];
      const height = 28 + lines.length * 16;
      nodes.push({
        employee: e,
        x: 30 + index * 350 + indent,
        y,
        width,
        height,
        lines,
      });
      y += height + 22;
      all
        .filter((p) => p.managerId === e.id)
        .forEach((p) => visit(p, depth + 1));
    }
    visit(root, 0);
    maxY = Math.max(maxY, y);
  });
  return {
    nodes,
    width: Math.max(750, roots.length * 350 + 30),
    height: Math.max(400, maxY + 70),
  };
}
export const xml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
export function chartPages(doc: OrgDocument) {
  const layout = chartLayout(doc),
    { roots } = activeForest(doc);
  const tile = (ids: string[], title: string) => {
    const found = ids
        .map((id) => layout.nodes.find((n) => n.employee.id === id))
        .filter((n): n is ChartNode => !!n),
      perColumn = Math.ceil(found.length / 2),
      ys = [135, 135];
    const nodes = found.map((n, i) => {
      const col = i < perColumn ? 0 : 1;
      const result = { ...n, x: 30 + col * 350, y: ys[col], width: 310 };
      ys[col] += n.height + 20;
      return result;
    });
    return { title, nodes, width: 750, height: Math.max(...ys) + 40 };
  };
  const overview = tile(
    roots.map((e) => e.id),
    'Executive overview — source reporting lines preserved',
  );
  const pages = roots.flatMap((root) => {
    const ids = [
      root.id,
      ...descendantIds(root.id, doc.employees).filter(
        (id) => doc.employees.find((e) => e.id === id)?.status === 'Active',
      ),
    ];
    const pages = [];
    for (let i = 0; i < ids.length; i += 6)
      pages.push(
        tile(
          ids.slice(i, i + 6),
          `${root.title} · ${root.name} — ${Math.floor(i / 6) + 1}/${Math.ceil(ids.length / 6)}`,
        ),
      );
    return pages;
  });
  return { overview, pages };
}
export function chartPageSvg(
  doc: OrgDocument,
  page: ReturnType<typeof chartPages>['overview'],
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}"><rect width="100%" height="100%" fill="#fbfdf9"/><g font-family="Arial, sans-serif"><text x="30" y="34" font-size="21" fill="#176f62" font-weight="bold">${xml(doc.company)} | Reporting hierarchy</text><text x="30" y="60" font-size="13" fill="#526d5b">${xml(page.title)}</text><text x="30" y="84" font-size="11" fill="#8c997d">v${xml(doc.version)} · ${approvalStatus(doc).approved ? 'Approved' : 'Draft — not approved'}</text><text x="30" y="106" font-size="11" fill="#8c997d">For managers outside this page, follow the direct reporting name on each card.</text>${page.nodes.map((n) => `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="6" stroke="#d6e1d8" fill="#ffffff"/><rect x="${n.x}" y="${n.y + 7}" width="3" height="${n.height - 14}" fill="${departmentColor(n.employee.department)}"/>${n.lines.map((line, i) => `<text x="${n.x + 13}" y="${n.y + 23 + i * 16}" font-size="${line.kind === 'name' ? 13 : 11}" font-weight="${line.kind === 'name' ? 'bold' : 'normal'}" fill="${line.kind === 'functional' ? '#7763a0' : '#345343'}">${xml(line.text)}</text>`).join('')}`).join('')}</g></svg>`;
}
export function chartSvg(doc: OrgDocument) {
  const l = chartLayout(doc),
    status = approvalStatus(doc).approved ? 'APPROVED' : 'DRAFT - NOT APPROVED';
  const connections = l.nodes
    .map((n) => {
      const p = l.nodes.find((v) => v.employee.id === n.employee.managerId);
      if (!p) return '';
      return `<path d="M ${p.x + 8} ${p.y + p.height} V ${n.y + n.height / 2} H ${n.x}" fill="none" stroke="#a2b8aa" stroke-width="1.4"/>`;
    })
    .join('');
  const cards = l.nodes
    .map(
      (n) =>
        `<g><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="7" fill="${n.employee.department === 'Management' ? '#f0f5fd' : '#ffffff'}" stroke="#d6e1d8"/><rect x="${n.x}" y="${n.y + 7}" width="3" height="${n.height - 14}" rx="1" fill="${departmentColor(n.employee.department)}"/>${n.lines.map((line, i) => `<text x="${n.x + 13}" y="${n.y + 23 + i * 16}" font-size="${line.kind === 'name' ? 12 : 10}" font-weight="${line.kind === 'name' ? 'bold' : 'normal'}" fill="${line.kind === 'functional' ? '#7763a0' : line.kind === 'name' ? '#263f35' : '#687c71'}">${xml(line.text)}</text>`).join('')}</g>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${l.width}" height="${l.height}" viewBox="0 0 ${l.width} ${l.height}"><rect width="100%" height="100%" fill="#fbfdf9"/><g font-family="Arial, sans-serif"><text x="${l.width / 2}" y="44" text-anchor="middle" font-size="26" font-weight="bold" fill="#176f62">${xml(doc.company)} — Organizational chart</text><text x="${l.width / 2}" y="72" text-anchor="middle" font-size="12" fill="#738475">Version ${xml(doc.version)} | ${status} | ${xml(doc.updatedDate.slice(0, 10))}</text><text x="${l.width / 2}" y="98" text-anchor="middle" font-size="11" fill="#738475">Solid lines: direct reporting. Functional reporting is listed on each applicable card.</text><text x="${l.width / 2}" y="118" text-anchor="middle" font-size="10" fill="#927640">Unconfirmed root positions are source gaps, not assumed executive reporting relationships.</text>${connections}${cards}<text x="30" y="${l.height - 22}" font-size="10" fill="#738475">${l.nodes.length} active employees · Source: controlled Ubiqedge workspace · Current department names retained</text></g></svg>`;
}
