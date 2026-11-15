import { useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line } from 'd3-shape';
import { DAY_TYPES, LINE_BY_ID } from '../lib/constants.js';
import { fmtDay, fmtMonth, formatMetric } from '../lib/format.js';
import { useElementWidth } from '../lib/hooks.js';
import { DayTypeTag } from './Bullet.jsx';
import { tip } from './Tooltip.jsx';

const M = { l: 46, r: 14, t: 14, b: 28 };
const H = 270;

// One line's daily values across the year, with its episodes shaded behind.
export default function TimeSeries({ model, routeId, metric, episodes, onPick }) {
  const ref = useRef(null);
  const width = useElementWidth(ref) || 720;
  const [hover, setHover] = useState(null);
  const l = LINE_BY_ID[routeId];
  const rows = model.byLine.get(routeId);
  const plotW = Math.max(240, width - M.l - M.r);
  const plotH = H - M.t - M.b;
  const x = (i) => (i / (model.nDays - 1)) * plotW;

  const values = rows.map((r) => (r ? r[metric.field] : null));
  const top = Math.max(metric.domain[1], ...values.filter((v) => v != null));
  const y = useMemo(() => scaleLinear().domain([0, top]).nice(4).range([plotH, 0]), [top, plotH]);

  const path = useMemo(() => {
    const pts = values.map((v, i) => [i, v]);
    const ln = line().defined((d) => d[1] != null).x((d) => x(d[0])).y((d) => y(d[1]));
    const ar = area().defined((d) => d[1] != null).x((d) => x(d[0])).y0(plotH).y1((d) => y(d[1]));
    return { line: ln(pts), area: ar(pts) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.join(','), plotW, y]);

  const months = useMemo(() => model.calendar.map((d, i) => ({ d, i })).filter(({ d }) => d.getUTCDate() === 1), [model]);
  const threshold = metric.id === 'gaps' ? { v: 40, label: '40% marks a disruption' } : metric.id === 'volume' ? { v: 0.6, label: 'Under 0.6 marks a disruption' } : null;

  const move = (e) => {
    const box = ref.current.querySelector('svg').getBoundingClientRect();
    const px = e.clientX - box.left - M.l;
    const idx = Math.min(model.nDays - 1, Math.max(0, Math.round((px / plotW) * (model.nDays - 1))));
    setHover(idx);
    const r = rows[idx];
    tip.show(
      e,
      <div className="tip-body">
        <strong>{fmtDay(model.calendar[idx])}</strong>
        {r ? (
          <>
            <DayTypeTag type={r.type} />
            <div className="tip-line">{metric.label}<b>{formatMetric(metric, r[metric.field])}</b></div>
            {r.longest_closure_header && <div className="tip-alert">{r.longest_closure_header}</div>}
          </>
        ) : (
          <div className="muted">No data published</div>
        )}
        <div className="tip-hint">Click to open this day</div>
      </div>,
    );
  };

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={`${l.label}: ${metric.label} for each day, with closures and disruptions shaded.`}
        onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}
        onClick={() => hover != null && onPick(hover)} className="ts-svg">
        <g transform={`translate(${M.l} ${M.t})`}>
          {y.ticks(4).map((t) => (
            <g key={t} transform={`translate(0 ${y(t)})`}>
              <line x2={plotW} className="grid-line" />
              <text x={-8} className="axis-text" textAnchor="end" dominantBaseline="central">{formatMetric(metric, t).replace(' min', '')}</text>
            </g>
          ))}
          {episodes.map((e) => (
            <rect key={e.key} x={x(e.startIdx) - 0.5 * (plotW / model.nDays)} width={Math.max(3, (e.endIdx - e.startIdx + 1) * (plotW / model.nDays))} y={0} height={plotH}
              className={`band band-${DAY_TYPES[e.episode_type].css}`} />
          ))}
          {threshold && y(threshold.v) > 0 && (
            <g transform={`translate(0 ${y(threshold.v)})`}>
              <line x2={plotW} className="thresh-line" />
              <text x={plotW} y={-6} textAnchor="end" className="thresh-text">{threshold.label}</text>
            </g>
          )}
          <path d={path.area} className="ts-area" style={{ fill: `var(--line-${l.css})` }} />
          <path d={path.line} className="ts-line" style={{ stroke: `var(--line-${l.css})` }} />
          {months.map(({ d, i }) => (
            <text key={i} x={x(i)} y={plotH + 19} className="axis-text">{fmtMonth(d)}</text>
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y2={plotH} className="hover-line" />
              {rows[hover] && rows[hover][metric.field] != null && (
                <circle cx={x(hover)} cy={y(rows[hover][metric.field])} r={4.5} className="ts-dot" style={{ stroke: `var(--line-${l.css})` }} />
              )}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
