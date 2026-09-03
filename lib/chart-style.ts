import { departmentColor, type OrgDocument } from './model';

export const CARD_FILL = '#ffffff';
export const CARD_TEXT = '#12233d';
export const FILL_NOTE =
  'Light fill: has direct reports. White: no direct reports.';
export const REPORTING_NOTE =
  'Lines: direct reporting. Cross-functional reporting is noted on cards.';
export function branchFill(color: string) {
  // A subtle 14% department tint keeps dark text readable in every export.
  return (
    '#' +
    color
      .slice(1)
      .match(/../g)!
      .map((channel) =>
        Math.round(255 * 0.86 + parseInt(channel, 16) * 0.14)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
const baseDepartments = [
  'Management',
  'Software',
  'Product & Solution',
  'Founder Office',
  'Admin',
  'Support',
  'Sales & Marketing',
  'Store',
];
const extraColors = [
  '#1e3a8a',
  '#166534',
  '#9f1239',
  '#0f766e',
  '#4338ca',
  '#713f12',
  '#701a75',
  '#0369a1',
];
function departmentPalette(doc: OrgDocument) {
  const colors = new Map(
    baseDepartments.map((name) => [name, departmentColor(name)]),
  );
  const names = [
    ...new Set(
      [
        ...doc.employees.map((e) => e.department),
        ...doc.functions.map((f) => f.name),
      ].filter(Boolean),
    ),
  ].sort();
  let index = 0;
  for (const name of names)
    if (!colors.has(name)) {
      const color =
        extraColors[index] ||
        `hsl(${Math.round((index * 137.508) % 360)}, 68%, 36%)`;
      // Beyond the named palette use an RGB hex value, supported by every export.
      if (index < extraColors.length) colors.set(name, color);
      else {
        const h = ((index * 137.508) % 360) / 60,
          c = 0.4896,
          x = c * (1 - Math.abs((h % 2) - 1)),
          m = 0.1152;
        const rgb =
          h < 1
            ? [c, x, 0]
            : h < 2
              ? [x, c, 0]
              : h < 3
                ? [0, c, x]
                : h < 4
                  ? [0, x, c]
                  : h < 5
                    ? [x, 0, c]
                    : [c, 0, x];
        colors.set(
          name,
          '#' +
            rgb
              .map((v) =>
                Math.round((v + m) * 255)
                  .toString(16)
                  .padStart(2, '0'),
              )
              .join(''),
        );
      }
      index++;
    }
  return colors;
}
export function chartLegend(doc: OrgDocument) {
  const colors = departmentPalette(doc);
  const names = [
    ...new Set(
      doc.employees
        .filter((e) => e.status === 'Active')
        .map((e) => e.department || 'Unassigned department'),
    ),
  ].sort();
  const entries = names.map((name) => ({
    label: name,
    color: colors.get(name) || '#64748b',
  }));
  if (doc.governance)
    entries.push({
      label: doc.governance.boardName + ' (governing body)',
      color: '#475569',
    });
  return entries;
}
export function chartNodeColor(
  doc: OrgDocument,
  department: string,
  board = false,
) {
  return board
    ? '#475569'
    : departmentPalette(doc).get(department) || '#64748b';
}
function legendLines(label: string) {
  const words = label.split(/\s+/),
    lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > 32 && line) {
      lines.push(line);
      line = '';
    }
    for (let i = 0; i < word.length; i += 32) {
      const part = word.slice(i, i + 32);
      if (i) {
        lines.push(line);
        line = '';
      }
      line = (line + ' ' + part).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}
export function legendItems(doc: OrgDocument) {
  const entries = chartLegend(doc),
    items: {
      label: string;
      color: string;
      x: number;
      y: number;
      lines: string[];
    }[] = [];
  let y = 156;
  for (let i = 0; i < entries.length; i += 2) {
    const pair = entries
      .slice(i, i + 2)
      .map((entry) => ({ ...entry, lines: legendLines(entry.label) }));
    pair.forEach((entry, j) => items.push({ ...entry, x: 40 + j * 360, y }));
    y += Math.max(...pair.map((entry) => entry.lines.length)) * 18 + 7;
  }
  return items;
}
export function chartTop(doc: OrgDocument) {
  return Math.max(
    262,
    ...legendItems(doc).map(
      (item) => item.y + (item.lines.length - 1) * 18 + 76,
    ),
  );
}
