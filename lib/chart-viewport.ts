import type { ChartNode } from './chart-layout';

// Keep the clicked expand/collapse button at the same on-screen position even
// when neighboring subtree widths change. Zoom is deliberately unchanged.
export function anchoredChartScroll(
  before: ChartNode,
  after: ChartNode,
  zoom: number,
  scroll: { left: number; top: number },
) {
  return {
    left: Math.max(
      0,
      scroll.left +
        (after.x + after.width / 2 - before.x - before.width / 2) * zoom,
    ),
    top: Math.max(
      0,
      scroll.top + (after.y + after.height - before.y - before.height) * zoom,
    ),
  };
}
