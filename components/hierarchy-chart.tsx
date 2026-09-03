'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  Download,
  Minus,
  Plus,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Users,
} from 'lucide-react';
import {
  chartLayout,
  connectionPath,
  type ChartDirection,
} from '@/lib/chart-layout';
import type { Employee, OrgDocument } from '@/lib/model';
import { anchoredChartScroll } from '@/lib/chart-viewport';
import { legendItems, FILL_NOTE, REPORTING_NOTE } from '@/lib/chart-style';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

export function HierarchyChart({
  doc,
  search,
  setSearch,
  department,
  setDepartment,
  onEdit,
  onExport,
  onDirectory,
  canEdit,
  canExport,
  direction,
  onDirection,
}: {
  doc: OrgDocument;
  search: string;
  setSearch: (s: string) => void;
  department: string;
  setDepartment: (s: string) => void;
  onEdit: (e: Employee) => void;
  onExport: () => void;
  onDirectory: () => void;
  canEdit: boolean;
  canExport: boolean;
  direction: ChartDirection;
  onDirection: (d: ChartDirection) => void;
}) {
  const [collapsed, setCollapsed] = useState(
      () =>
        new Set(
          doc.employees
            .filter((e) => e.id !== doc.governance?.ceoId)
            .map((e) => e.id),
        ),
    ),
    [zoom, setZoom] = useState(1),
    [functional, setFunctional] = useState(true);
  const canvas = useRef<HTMLDivElement>(null);
  const previousView = useRef('');
  const viewportRequest = useRef<
    { type: 'fit' } | { type: 'scroll'; left: number; top: number } | null
  >(null);
  const all = doc.employees.filter((e) => e.status === 'Active'),
    filtered = !!search || !!department;
  const visible = new Set<string>();
  for (const e of all)
    if (
      (!department || e.department === department) &&
      `${e.name} ${e.title} ${e.id}`
        .toLowerCase()
        .includes(search.toLowerCase())
    ) {
      let current: Employee | undefined = e;
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        visible.add(current.id);
        current = all.find((p) => p.id === current!.managerId);
      }
    }
  const l = chartLayout(doc, {
    direction,
    visibleIds: visible,
    collapsedIds: filtered ? new Set() : collapsed,
    showFunctional: functional,
  });
  useLayoutEffect(() => {
    const view = JSON.stringify([direction, search, department]);
    const request = viewportRequest.current;
    viewportRequest.current = null;
    if (previousView.current !== view || request?.type === 'fit') {
      previousView.current = view;
      setZoom(
        Math.max(
          0.05,
          Math.min(1, ((canvas.current?.clientWidth || 1000) - 48) / l.width),
        ),
      );
      canvas.current?.scrollTo(0, 0);
    } else if (request?.type === 'scroll') {
      canvas.current?.scrollTo(request.left, request.top);
    }
  }, [direction, search, department, l.width, collapsed]);
  const fit = () =>
    setZoom(
      Math.max(
        0.05,
        Math.min(1, ((canvas.current?.clientWidth || 1000) - 48) / l.width),
      ),
    );
  const changeCollapse = (next: Set<string>, anchorId?: string) => {
    const layout = chartLayout(doc, {
      direction,
      visibleIds: visible,
      collapsedIds: next,
      showFunctional: functional,
    });
    const before = l.nodes.find((n) => n.employee.id === anchorId);
    const after = layout.nodes.find((n) => n.employee.id === anchorId);
    viewportRequest.current =
      before && after && canvas.current
        ? {
            type: 'scroll',
            ...anchoredChartScroll(before, after, zoom, {
              left: canvas.current.scrollLeft,
              top: canvas.current.scrollTop,
            }),
          }
        : { type: 'fit' };
    setCollapsed(next);
  };
  return (
    <section className="chart-panel">
      <div className="chart-toolbar">
        <div className="view-tabs">
          <button className="selected">Hierarchy</button>
          <button onClick={onDirectory}>
            <Users size={17} />
            Directory
          </button>
        </div>
        <div className="chart-tools">
          <Input
            aria-label="Find a person in the chart"
            placeholder="Find a person…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <NativeSelect
            aria-label="Chart department filter"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">All departments</option>
            {[...new Set(all.map((e) => e.department))].sort().map((d) => (
              <option key={d}>{d}</option>
            ))}
          </NativeSelect>
          <Button variant="outline" disabled={!canExport} onClick={onExport}>
            <Download />
            Export chart
          </Button>
        </div>
      </div>
      <div className="chart-options">
        <label className="chart-direction" htmlFor="chart-direction">
          Chart direction
          <NativeSelect
            aria-label="Chart direction"
            id="chart-direction"
            value={direction}
            onChange={(e) => {
              onDirection(e.target.value as ChartDirection);
              canvas.current?.scrollTo(0, 0);
            }}
          >
            <option value="vertical">Vertical (top to bottom)</option>
            <option value="vertical-2">Vertical 2 (stacked branches)</option>
            <option value="horizontal">Horizontal (left to right)</option>
          </NativeSelect>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={functional}
            onChange={(e) => setFunctional(e.target.checked)}
          />
          Cross-functional notes
        </label>
        <Button variant="outline" onClick={() => changeCollapse(new Set())}>
          Expand all
        </Button>
        <Button
          variant="outline"
          onClick={() => changeCollapse(new Set(all.map((e) => e.id)))}
        >
          Collapse teams
        </Button>
        <div className="zoom-controls">
          <Button
            variant="ghost"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.05, z - 0.1))}
          >
            <Minus size={18} />
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          >
            <Plus size={18} />
          </Button>
          <Button variant="outline" onClick={() => setZoom(1)}>
            100%
          </Button>
          <Button variant="ghost" aria-label="Fit chart to width" onClick={fit}>
            <Maximize2 size={18} />
          </Button>
        </div>
      </div>
      <div className="chart-canvas hierarchy-canvas" ref={canvas}>
        {l.nodes.length ? (
          <div
            style={{
              width: l.width * zoom,
              height: l.height * zoom,
              position: 'relative',
            }}
          >
            <div
              className="hierarchy-stage"
              style={{
                width: l.width,
                height: l.height,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <div className="hierarchy-heading">
                <h2>{doc.company}</h2>
                <p>Organizational chart · v{doc.version}</p>
              </div>
              <div
                className="hierarchy-color-legend"
                aria-label="Chart color legend"
              >
                <strong>Department color legend</strong>
                {legendItems(doc).map((item) => (
                  <span
                    key={item.color}
                    style={{ left: item.x, top: item.y - 14 }}
                  >
                    <i style={{ background: item.color }} />
                    {item.lines.join('\n')}
                  </span>
                ))}
              </div>
              <p
                style={{
                  position: 'absolute',
                  left: 40,
                  top: l.top - 60,
                  fontSize: 13,
                  color: '#12233d',
                }}
              >
                {FILL_NOTE}
              </p>
              <svg
                width={l.width}
                height={l.height}
                className="hierarchy-lines"
                aria-hidden="true"
              >
                {l.connections.map((c, i) => (
                  <path
                    key={i}
                    d={connectionPath(c)}
                    stroke="#64748b"
                    strokeWidth={2}
                    fill="none"
                  />
                ))}
              </svg>
              {l.nodes.map((n) => {
                const count = all.filter(
                  (e) => e.managerId === n.employee.id,
                ).length;
                const isCollapsed = collapsed.has(n.employee.id) && !filtered;
                return (
                  <div
                    className="hierarchy-node"
                    key={n.employee.id}
                    style={{
                      left: n.x,
                      top: n.y,
                      width: n.width,
                      height: n.height,
                    }}
                  >
                    <button
                      className="hierarchy-person"
                      data-employee={
                        n.kind === 'employee' ? n.employee.id : undefined
                      }
                      data-node-kind={n.kind}
                      onClick={() =>
                        n.kind === 'employee' && onEdit(n.employee)
                      }
                      disabled={!canEdit || n.kind === 'board'}
                      aria-label={`${canEdit && n.kind === 'employee' ? 'Edit' : 'View'} ${n.employee.name}`}
                      style={{
                        background: n.fill,
                        borderColor: n.color,
                      }}
                    >
                      {n.lines.map((line, i) => (
                        <span
                          key={i}
                          className={`node-${line.kind}`}
                          style={{
                            top: line.y - line.size,
                            left: 20,
                            fontSize: line.size,
                            lineHeight: `${line.size + 4}px`,
                          }}
                        >
                          {line.text}
                        </span>
                      ))}
                    </button>
                    {count > 0 && (
                      <button
                        className="hierarchy-toggle"
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${n.employee.name}`}
                        aria-expanded={!isCollapsed}
                        disabled={filtered}
                        title={
                          filtered
                            ? 'Clear filters to collapse teams'
                            : 'Expand or collapse this team'
                        }
                        onClick={() => {
                          const next = new Set(collapsed);
                          if (next.has(n.employee.id))
                            next.delete(n.employee.id);
                          else next.add(n.employee.id);
                          changeCollapse(next, n.employee.id);
                        }}
                      >
                        {count}{' '}
                        {isCollapsed ? (
                          <ChevronDown size={15} />
                        ) : (
                          <ChevronUp size={15} />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h3>No matching employees</h3>
            <Button
              onClick={() => {
                setSearch('');
                setDepartment('');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
      <footer className="chart-footer">
        <span>{REPORTING_NOTE}</span>
        <span>Scroll in either direction · Select a card to edit</span>
      </footer>
    </section>
  );
}
