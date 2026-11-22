import { useMemo, useRef, useState } from 'react';
import { LINE_BY_ID, METRIC_BY_ID } from '../lib/constants.js';
import { fmtMonth } from '../lib/format.js';
import { useElementWidth } from '../lib/hooks.js';
import { makeRamp, metricColor } from '../lib/ramps.js';
import { tip } from './Tooltip.jsx';

// One square per day, weeks as columns, Monday at the top. A closure that covers a weekend shows
// up as a pair of squares; a month of work shows up as a block. This is the app's signature chart.

let introPlayed = false;

export default function CalendarHeat({ model, routeId, metricId = 'type', theme, selectedIdx, onSelect, size = 'lg', marks = [], tooltipFor, intro = false, label }) {
  const wrapRef = useRef(null);
  const width = useElementWidth(wrapRef) || 640;
  const metric = METRIC_BY_ID[metricId];
  const ramp = useMemo(() => makeRamp(theme), [theme]);
  const [hover, setHover] = useState(null);
  const playIntro = useRef(intro && !introPlayed);
  if (intro) introPlayed = true;

  const lg = size === 'lg';
  const offset = (model.calendar[0].getUTCDay() + 6) % 7;
  const nCols = Math.ceil((model.nDays + offset) / 7);
  const left = lg ? 32 : 0;
  const top = lg ? 26 : 16;
  const gap = lg ? 3 : 1.5;
  const fit = (width - left - gap * (nCols - 1)) / nCols;
  const cell = Math.max(4, Math.min(lg ? 24 : 14, lg ? Math.floor(fit) : Math.floor(fit * 4) / 4));
  const pitch = cell + gap;
  const gridW = nCols * pitch - gap;
  const gridH = 7 * pitch - gap;
  const markH = marks.length ? 30 : 0;
  const height = top + gridH + markH + 2;
  const arr = model.byLine.get(routeId);
  const l = LINE_BY_ID[routeId];

  const columns = useMemo(() => {
    const cols = [];
    for (let c = 0; c < nCols; c++) cols.push([]);
    for (let i = 0; i < model.nDays; i++) {
      const col = Math.floor((i + offset) / 7);
      const row = (i + offset) % 7;
      const r = arr[i];
      const rx = Math.min(3, cell / 4);
      const common = { key: i, x: left + col * pitch, y: top + row * pitch, width: cell, height: cell, rx };
      if (!r) cols[col].push(<rect {...common} className="cell cell-none" />);
      else if (metricId === 'type') cols[col].push(<rect {...common} className={`cell t-${r.type}`} />);
      else {
        const fill = metricColor(metric, r[metric.field], ramp);
        cols[col].push(<rect {...common} className={fill ? 'cell' : 'cell cell-none'} style={fill ? { fill } : undefined} />);
      }
    }
    return cols;
  }, [model, arr, metricId, metric, ramp, nCols, offset, cell, pitch, left, top]);

  const months = useMemo(() => {
    const out = [];
    model.calendar.forEach((d, i) => {
      if (i === 0 || d.getUTCDate() === 1) out.push({ col: Math.floor((i + offset) / 7), label: fmtMonth(d), year: d.getUTCFullYear(), jan: d.getUTCMonth() === 0 });
    });
    return out.filter((m, k) => k === 0 ? (out[1] ? out[1].col - m.col >= (lg ? 3 : 5) : true) : true);
  }, [model, offset, lg]);

  const locate = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left - left;
    const y = e.clientY - box.top - top;
    if (x < 0 || y < 0) return null;
    const col = Math.floor(x / pitch);
    const row = Math.floor(y / pitch);
    if (row > 6 || col >= nCols) return null;
    const idx = col * 7 + row - offset;
    return idx >= 0 && idx < model.nDays ? idx : null;
  };
  const cellPos = (i) => ({ x: left + Math.floor((i + offset) / 7) * pitch, y: top + ((i + offset) % 7) * pitch });

  const onMove = (e) => {
    const idx = locate(e);
    setHover(idx);
    if (idx == null || !tooltipFor) tip.hide();
    else tip.show(e, tooltipFor(routeId, idx));
  };
  const onKeyDown = (e) => {
    if (!onSelect) return;
    const cur = selectedIdx ?? 0;
    const move = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 7, ArrowLeft: -7 }[e.key];
    let next = null;
    if (move != null) next = Math.max(0, Math.min(model.nDays - 1, (selectedIdx == null ? model.nDays - 1 : cur) + move));
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = model.nDays - 1;
    if (next != null) {
      e.preventDefault();
      onSelect(next);
    }
  };

  return (
    <div className={`cal cal-${size}`} ref={wrapRef}>
      <div
        className="cal-scroll"
        tabIndex={onSelect ? 0 : -1}
        role="group"
        aria-label={label || `${l.label}, one square per day. Use the arrow keys to move between days.`}
        onKeyDown={onKeyDown}
      >
        <svg
          width={Math.max(gridW + left, 0)}
          height={height}
          className="cal-svg"
          style={{ '--c': `var(--line-${l.css})` }}
          onPointerMove={onMove}
          onPointerLeave={() => { setHover(null); tip.hide(); }}
          onClick={(e) => { const i = locate(e); if (i != null && onSelect) onSelect(i); }}
        >
          <g aria-hidden="true">
            {months.map((m) => (
              <text key={`${m.col}-${m.label}`} x={left + m.col * pitch} y={top - (lg ? 9 : 5)} className={lg ? 'axis-text' : 'axis-text axis-sm'}>
                {m.label}
                {lg && pitch >= 14 && (m.jan || m === months[0]) && <tspan className="axis-year"> ’{String(m.year).slice(2)}</tspan>}
              </text>
            ))}
            {lg && ['Mon', 'Wed', 'Fri', 'Sun'].map((d, k) => (
              <text key={d} x={0} y={top + k * 2 * pitch + cell / 2} className="axis-text axis-day-label" dominantBaseline="central">{d}</text>
            ))}
          </g>
          {columns.map((cells, c) => (
            <g key={c} className={playIntro.current ? 'cal-col intro' : 'cal-col'} style={{ '--k': c }}>{cells}</g>
          ))}
          {marks.map((m, k) => {
            const c0 = Math.floor((m.from + offset) / 7);
            const c1 = Math.floor((m.to + offset) / 7);
            const x = left + c0 * pitch - 2;
            const w = (c1 - c0 + 1) * pitch + 2 - gap;
            return (
              <g key={k} pointerEvents="none" aria-hidden="true">
                <rect x={x} y={top - 2} width={w} height={gridH + 4} rx={4} className="mark-box" />
                <text x={Math.min(x, left + gridW - 180)} y={top + gridH + 20} className="mark-text">{m.label}</text>
              </g>
            );
          })}
          {hover != null && <rect x={cellPos(hover).x - 1.5} y={cellPos(hover).y - 1.5} width={cell + 3} height={cell + 3} rx={3} className="cell-ring" pointerEvents="none" />}
          {selectedIdx != null && <rect x={cellPos(selectedIdx).x - 2} y={cellPos(selectedIdx).y - 2} width={cell + 4} height={cell + 4} rx={3.5} className="cell-select" pointerEvents="none" />}
        </svg>
      </div>
    </div>
  );
}
