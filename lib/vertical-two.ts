import type { ChartNode, ChartConnection } from './chart-layout';

type Placement = {
  id: string;
  x: number;
  y: number;
  side: 'left' | 'right' | 'below';
};
type Plan = { width: number; height: number; children: Placement[] };

// Functional-style layout: upper managers branch across a row, while their
// reports stack in pairs around a central spine. Only real direct links are used.
export function verticalTwoLayout(
  nodes: ChartNode[],
  children: Map<string, string[]>,
  roots: string[],
  top: number,
  upperRows: number,
) {
  const map = new Map(nodes.map((n) => [n.employee.id, n]));
  const plans = new Map<string, Plan>();
  const lane = 76,
    rowGap = 48,
    branchGap = 80;
  function measure(id: string, depth: number): Plan {
    const node = map.get(id)!,
      ids = children.get(id) || [];
    const subs = ids.map((child) => ({
      id: child,
      plan: measure(child, depth + 1),
    }));
    if (!subs.length) {
      const plan = { width: node.width, height: node.height, children: [] };
      plans.set(id, plan);
      return plan;
    }
    // All upper-level peers share one row, including people without reports.
    // Below leadership, leaf reports stack first. Expandable managers share
    // the final row and grow downwards from there, never inside the leaf stack.
    // hasReports comes from the full active organization, so collapsing a team
    // cannot change its manager's position in this ordering.
    const upper = depth < upperRows;
    const pairs =
      !upper && subs.length > 1
        ? subs.filter((s) => !map.get(s.id)!.hasReports)
        : [];
    const below =
      upper || subs.length === 1
        ? subs
        : subs.filter((s) => map.get(s.id)!.hasReports);
    const leftWidth = Math.max(
      0,
      ...pairs.filter((_, i) => i % 2 === 0).map((s) => s.plan.width),
    );
    const rightWidth = Math.max(
      0,
      ...pairs.filter((_, i) => i % 2 === 1).map((s) => s.plan.width),
    );
    // Symmetric room keeps every central spine outside all card/subtree bounds.
    const pairedWidth = pairs.length
      ? 2 * Math.max(leftWidth, rightWidth) + lane
      : 0;
    const belowWidth =
      below.reduce((sum, s) => sum + s.plan.width, 0) +
      Math.max(0, below.length - 1) * branchGap;
    const width = Math.max(node.width, pairedWidth, belowWidth),
      placements: Placement[] = [];
    let y = node.height + branchGap;
    for (let i = 0; i < pairs.length; i += 2) {
      const left = pairs[i],
        right = pairs[i + 1];
      placements.push({
        id: left.id,
        x: width / 2 - lane / 2 - left.plan.width,
        y,
        side: 'left',
      });
      if (right)
        placements.push({
          id: right.id,
          x: width / 2 + lane / 2,
          y,
          side: 'right',
        });
      y += Math.max(left.plan.height, right?.plan.height || 0) + rowGap;
    }
    let height = pairs.length ? y - rowGap : node.height;
    if (below.length) {
      const branchY = pairs.length
        ? height + branchGap
        : node.height + branchGap;
      let x = (width - belowWidth) / 2;
      for (const child of below) {
        placements.push({ id: child.id, x, y: branchY, side: 'below' });
        x += child.plan.width + branchGap;
      }
      height = branchY + Math.max(...below.map((s) => s.plan.height));
    }
    const plan = { width, height, children: placements };
    plans.set(id, plan);
    return plan;
  }
  roots.forEach((id) => measure(id, 0));
  const connections: ChartConnection[] = [];
  function place(id: string, x: number, y: number) {
    const node = map.get(id)!,
      plan = plans.get(id)!;
    node.x = x + (plan.width - node.width) / 2;
    node.y = y;
    const spine = node.x + node.width / 2;
    for (const child of plan.children) {
      place(child.id, x + child.x, y + child.y);
      const target = map.get(child.id)!;
      const points: [number, number][] =
        child.side === 'below'
          ? [
              [spine, node.y + node.height],
              [spine, target.y - branchGap / 2],
              [target.x + target.width / 2, target.y - branchGap / 2],
              [target.x + target.width / 2, target.y],
            ]
          : [
              [spine, node.y + node.height],
              [spine, target.y + target.height / 2],
              [
                child.side === 'left' ? target.x + target.width : target.x,
                target.y + target.height / 2,
              ],
            ];
      connections.push({ from: id, to: child.id, functional: false, points });
    }
  }
  const total =
    roots.reduce((sum, id) => sum + plans.get(id)!.width, 0) +
    Math.max(0, roots.length - 1) * branchGap;
  let x = Math.max(40, (800 - total) / 2);
  for (const id of roots) {
    place(id, x, top);
    x += plans.get(id)!.width + branchGap;
  }
  return connections;
}
