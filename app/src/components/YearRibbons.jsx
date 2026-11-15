import { useMemo, useRef, useState } from 'react';
import { LINE_BY_ID, METRIC_BY_ID } from '../lib/constants.js';
import { fmtDayShort, fmtMonth } from '../lib/format.js';
import { useElementWidth } from '../lib/hooks.js';
import { makeRamp, metricColor } from '../lib/ramps.js';
import { tip } from './Tooltip.jsx';

// The hero chart. One strip per line, one tick per day.
// Drag across it to zoom in (the chart really rescales); click a day to read it;
// arrow keys step through days; Escape zooms back out.

const ROW_H = 26;
const ROW_GAP = 7;
const AXIS_H = 34;
const PAD_R = 14;
const CONTEXT_H = 16;
let hasPlayed = false; // the entrance plays once per visit, not on every filter change

const SEVERITY = { disruption: 3, planned_closure: 2, schedule_matching_gap: 1 };

// A thin strip of the whole year shown while zoomed, with the visible window outlined.
function ContextStrip({ model, lines, range, labelW, plotW, width, onRange }) {
  const cw = plotW / model.nDays;
  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < model.nDays; i++) {
      let worst = 0;
      let type = null;
      for (const id of lines) {
        const r = model.byLine.get(id)[i];
        if (r && SEVERITY[r.type] > worst) {
          worst = SEVERITY[r.type];
          type = r.type;
        }
      }
      if (type) out.push(<rect key={i} x={i * cw} width={cw + 0.5} height={CONTEXT_H} className={`cell t-${type}`} />);
    }
    return out;
  }, [model, lines, cw]);
  const len = range[1] - range[0];
  const jump = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const center = Math.round((e.clientX - box.left - labelW) / cw);
    const a = Math.max(0, Math.min(model.nDays - 1 - len, center - Math.round(len / 2)));
    onRange([a, a + len]);
  };
  return (
    <svg width={width} height={CONTEXT_H + 8} className="context-strip" onPointerDown={jump} role="img" aria-label="The whole year, with the zoomed window outlined. Click to move the window.">
      <text x={0} y={CONTEXT_H - 3} className="axis-text">Whole year</text>
      <g transform={`translate(${labelW} 4)`}>
        <rect width={plotW} height={CONTEXT_H} className="context-bg" />
        {cells}
        <rect x={range[0] * cw} width={Math.max(3, (range[1] - range[0] + 1) * cw)} height={CONTEXT_H} className="context-window" />
      </g>
    </svg>
  );
}

export default function YearRibbons({ model, lines, metricId, theme, selectedIdx, range, onSelect, onRange, tooltipFor }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const wrapW = useElementWidth(wrapRef);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const playIn = useRef(!hasPlayed);
  hasPlayed = true;

  const [v0, v1] = range || [0, model.nDays - 1];
  const nView = v1 - v0 + 1;
  const compact = wrapW > 0 && wrapW < 640;
  const labelW = compact ? 40 : 132;
  const plotW = Math.max(760, wrapW - labelW - PAD_R);
  const width = labelW + plotW + PAD_R;
  const cw = plotW / nView;
  const height = AXIS_H + lines.length * (ROW_H + ROW_GAP) - ROW_GAP + 4;
  const plotBottom = AXIS_H + lines.length * (ROW_H + ROW_GAP) - ROW_GAP;
  const metric = METRIC_BY_ID[metricId];
  const ramp = useMemo(() => makeRamp(theme), [theme]);

  const rows = useMemo(
    () =>
      lines.map((id, ri) => {
        const arr = model.byLine.get(id);
        const rects = [];
        for (let i = v0; i <= v1; i++) {
          const r = arr[i];
          if (!r) continue;
          const x = (i - v0) * cw;
          const w = cw + 0.5; // slight overlap so neighbouring days never show hairline seams
          if (metricId === 'type') {
            rects.push(<rect key={i} x={x} width={w} height={ROW_H} className={`cell t-${r.type}`} />);
          } else {
            const fill = metricColor(metric, r[metric.field], ramp);
            rects.push(<rect key={i} x={x} width={w} height={ROW_H} className={fill ? 'cell' : 'cell cell-empty'} style={fill ? { fill } : undefined} />);
          }
        }
        return (
          <g
            key={id}
            className={`rib-row${playIn.current ? ' reveal' : ''}`}
            transform={`translate(0 ${ri * (ROW_H + ROW_GAP)})`}
            style={{ '--c': `var(--line-${LINE_BY_ID[id].css})`, '--i': ri }}
          >
            {rects}
          </g>
        );
      }),
    [model, lines, metricId, metric, ramp, cw, v0, v1],
  );

  // Axis: month names for a long view; week starts (and day numbers when very close) for a short one.
  const ticks = useMemo(() => {
    const out = [];
    const zoomed = nView <= 120;
    for (let i = v0; i <= v1; i++) {
      const d = model.calendar[i];
      // when zoomed, label each Monday (and the first day only if a Monday is not right next to it)
      const nearMonday = zoomed && i === v0 && ((8 - d.getUTCDay()) % 7 || 7) < 4;
      if (zoomed ? d.getUTCDay() === 1 || (i === v0 && !nearMonday) : d.getUTCDate() === 1) {
        out.push({ i, x: (i - v0) * cw, label: zoomed ? fmtDayShort(d) : fmtMonth(d), year: d.getUTCFullYear(), jan: d.getUTCMonth() === 0 });
      }
    }
    return { list: out, zoomed };
  }, [model, v0, v1, nView, cw]);
  const monthLines = useMemo(() => {
    const out = [];
    for (let i = v0 + 1; i <= v1; i++) if (model.calendar[i].getUTCDate() === 1) out.push((i - v0) * cw);
    return out;
  }, [model, v0, v1, cw]);

  const locate = (e) => {
    const box = svgRef.current.getBoundingClientRect();
    const x = e.clientX - box.left - labelW;
    const y = e.clientY - box.top - AXIS_H;
    return {
      idx: Math.min(v1, Math.max(v0, v0 + Math.floor(x / cw))),
      row: Math.min(lines.length - 1, Math.max(0, Math.floor(y / (ROW_H + ROW_GAP)))),
      inside: x >= 0 && x <= plotW && y >= -4,
    };
  };

  const onPointerMove = (e) => {
    const loc = locate(e);
    const d = dragRef.current;
    if (d) {
      if (!d.moved && Math.abs(e.clientX - d.cx) > 4) d.moved = true;
      if (d.moved) {
        setDrag({ a: Math.min(d.idx, loc.idx), b: Math.max(d.idx, loc.idx) });
        tip.hide();
        return;
      }
    }
    if (!loc.inside) {
      setHover(null);
      tip.hide();
      return;
    }
    setHover({ idx: loc.idx, row: loc.row });
    tip.show(e, tooltipFor(lines[loc.row], loc.idx));
  };
  const onPointerDown = (e) => {
    const loc = locate(e);
    if (!loc.inside) return;
    wrapRef.current?.querySelector('.ribbons-scroll')?.focus({ preventScroll: true });
    dragRef.current = { idx: loc.idx, cx: e.clientX, moved: false, touch: e.pointerType === 'touch' };
    if (e.pointerType !== 'touch') svgRef.current.setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const loc = locate(e);
    setDrag(null);
    if (d.moved && !d.touch) {
      const a = Math.min(d.idx, loc.idx);
      const b = Math.max(d.idx, loc.idx);
      if (b - a >= 1) onRange([a, b]);
    } else {
      onSelect(d.idx);
    }
  };
  const onPointerLeave = () => {
    if (dragRef.current) return;
    setHover(null);
    tip.hide();
  };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 7 : 1;
    const cur = selectedIdx ?? (e.key === 'ArrowLeft' ? v1 + 1 : v0 - 1);
    let next = null;
    if (e.key === 'ArrowRight') next = Math.min(v1, cur + step);
    if (e.key === 'ArrowLeft') next = Math.max(v0, cur - step);
    if (e.key === 'Home') next = v0;
    if (e.key === 'End') next = v1;
    if (e.key === 'Escape' && range) {
      onRange(null);
      return;
    }
    if (next != null) {
      e.preventDefault();
      onSelect(next);
    }
  };

  const selX = selectedIdx != null && selectedIdx >= v0 && selectedIdx <= v1 ? labelW + (selectedIdx - v0 + 0.5) * cw : null;
  const dx0 = drag ? labelW + (drag.a - v0) * cw : 0;
  const dx1 = drag ? labelW + (drag.b - v0 + 1) * cw : 0;

  return (
    <div className="ribbons" ref={wrapRef}>
      <div
        className="ribbons-scroll"
        tabIndex={0}
        role="group"
        aria-label="Year of service by line. Use the left and right arrow keys to step through days, Shift for a week, Escape to zoom out."
        onKeyDown={onKeyDown}
      >
        {range && <ContextStrip model={model} lines={lines} range={range} labelW={labelW} plotW={plotW} width={width} onRange={onRange} />}
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="ribbons-svg"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onPointerCancel={() => {
            dragRef.current = null;
            setDrag(null);
          }}
        >
          <g className="axis" aria-hidden="true">
            {ticks.list.map((t, k) => (
              <text key={t.i} x={labelW + t.x + 4} y={AXIS_H - 12} className="axis-text">
                {t.label}
                {!ticks.zoomed && (t.jan || k === 0) && <tspan className="axis-year"> ’{String(t.year).slice(2)}</tspan>}
              </text>
            ))}
            {cw >= 18 &&
              Array.from({ length: nView }, (_, k) => (
                <text key={k} x={labelW + (k + 0.5) * cw} y={AXIS_H - 2} textAnchor="middle" className="axis-day">
                  {model.calendar[v0 + k].getUTCDate()}
                </text>
              ))}
          </g>

          <g transform={`translate(${labelW} ${AXIS_H})`}>{rows}</g>

          <g aria-hidden="true" pointerEvents="none">
            {monthLines.map((x) => (
              <line key={x} x1={labelW + x} x2={labelW + x} y1={AXIS_H - 8} y2={plotBottom} className="month-line" />
            ))}
          </g>

          <g aria-hidden="true">
            {lines.map((id, ri) => {
              const l = LINE_BY_ID[id];
              const cy = AXIS_H + ri * (ROW_H + ROW_GAP) + ROW_H / 2;
              return (
                <g key={id} transform={`translate(0 ${cy})`} className={`rib-label${hover?.row === ri ? ' on' : ''}`}>
                  <circle cx={11} r={11} className={`bl bl-${l.css}`} />
                  <text x={11} className={`bl-text bl-text-${l.css}`}>{l.bullet}</text>
                  {!compact && (
                    <text x={30} className="rib-name">
                      {l.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {drag && (
            <g className="range" pointerEvents="none" aria-hidden="true">
              <rect x={labelW} y={AXIS_H - 2} width={Math.max(0, dx0 - labelW)} height={plotBottom - AXIS_H + 2} className="dim" />
              <rect x={dx1} y={AXIS_H - 2} width={Math.max(0, labelW + plotW - dx1)} height={plotBottom - AXIS_H + 2} className="dim" />
              <line x1={dx0} x2={dx0} y1={AXIS_H - 6} y2={plotBottom + 2} className="range-edge" />
              <line x1={dx1} x2={dx1} y1={AXIS_H - 6} y2={plotBottom + 2} className="range-edge" />
            </g>
          )}

          {hover && !drag && (
            <g pointerEvents="none" aria-hidden="true">
              <line x1={labelW + (hover.idx - v0 + 0.5) * cw} x2={labelW + (hover.idx - v0 + 0.5) * cw} y1={AXIS_H - 4} y2={plotBottom + 2} className="hover-line" />
              <rect x={labelW - 2} y={AXIS_H + hover.row * (ROW_H + ROW_GAP) - 2} width={plotW + 4} height={ROW_H + 4} className="hover-row" />
            </g>
          )}

          {selX != null && (
            <g pointerEvents="none" aria-hidden="true">
              <line x1={selX} x2={selX} y1={AXIS_H - 6} y2={plotBottom + 3} className="select-line" />
              <path d={`M${selX - 5} ${AXIS_H - 12} h10 l-5 7 z`} className="select-flag" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
