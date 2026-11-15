import { useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { LINE_BY_ID } from '../lib/constants.js';
import { n0 } from '../lib/format.js';
import { useElementWidth } from '../lib/hooks.js';
import { tip } from './Tooltip.jsx';

const M = { l: 44, r: 84, t: 12, b: 30 };
const H = 250;
export const hourLabel = (h) => (h === 0 ? '12 am' : h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`);

const FIELDS = {
  gaps: { field: 'pct_headways_over_1_5x', n: 'n_headways', unit: '%', label: 'Long gaps' },
  delay: { field: 'p90_schedule_diff_min', n: 'n_comparable', unit: ' min', label: 'Late arrivals (p90)' },
};
const MIN_N = 100;

// What a normal (dry) day looks like hour by hour, weekdays against weekends.
export default function HourlyProfile({ model, routeId, metricId }) {
  const ref = useRef(null);
  const width = useElementWidth(ref) || 560;
  const [hover, setHover] = useState(null);
  const l = LINE_BY_ID[routeId];
  const f = FIELDS[metricId];
  const plotW = Math.max(220, width - M.l - M.r);
  const plotH = H - M.t - M.b;

  const series = useMemo(() => {
    const pick = (weekend) => {
      const byHour = new Array(24).fill(null);
      for (const r of model.hourly) {
        if (r.route_id === routeId && r.weather_category === 'dry' && r.is_weekend === weekend && r[f.n] >= MIN_N && r[f.field] != null) {
          byHour[r.hour_local] = { v: r[f.field], n: r[f.n] };
        }
      }
      return byHour;
    };
    return { Weekdays: pick(false), Weekends: pick(true) };
  }, [model, routeId, f]);

  const max = Math.max(1, ...Object.values(series).flat().filter(Boolean).map((d) => d.v));
  const x = (h) => (h / 23) * plotW;
  const y = scaleLinear().domain([0, max]).nice(4).range([plotH, 0]);
  const ln = line().defined((d) => d != null).x((d, i) => x(i)).y((d) => y(d.v));

  const move = (e) => {
    const box = ref.current.querySelector('svg').getBoundingClientRect();
    const h = Math.min(23, Math.max(0, Math.round(((e.clientX - box.left - M.l) / plotW) * 23)));
    setHover(h);
    tip.show(
      e,
      <div className="tip-body">
        <strong>{hourLabel(h)}</strong>
        {Object.entries(series).map(([name, arr]) => (
          <div key={name} className="tip-line">
            {name}
            <b>{arr[h] ? `${arr[h].v.toFixed(metricId === 'gaps' ? 0 : 1)}${f.unit}` : 'too few trains'}</b>
          </div>
        ))}
        {series.Weekdays[h] && <div className="tip-hint">Based on {n0(series.Weekdays[h].n)} observations on weekdays</div>}
      </div>,
    );
  };

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={`${l.label}, ${f.label} by hour of day on dry days, weekdays and weekends.`}
        onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        <g transform={`translate(${M.l} ${M.t})`}>
          {y.ticks(4).map((t) => (
            <g key={t} transform={`translate(0 ${y(t)})`}>
              <line x2={plotW} className="grid-line" />
              <text x={-8} className="axis-text" textAnchor="end" dominantBaseline="central">{t}{f.unit.trim()}</text>
            </g>
          ))}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <text key={h} x={x(h)} y={plotH + 20} className="axis-text" textAnchor="middle">{hourLabel(h)}</text>
          ))}
          <path d={ln(series.Weekends)} className="hp-line hp-weekend" style={{ stroke: `var(--line-${l.css})` }} />
          <path d={ln(series.Weekdays)} className="hp-line" style={{ stroke: `var(--line-${l.css})` }} />
          <text x={plotW + 8} y={y(series.Weekdays.filter(Boolean).slice(-1)[0]?.v ?? 0)} className="hp-label" dominantBaseline="central">Weekdays</text>
          <text x={plotW + 8} y={y(series.Weekends.filter(Boolean).slice(-1)[0]?.v ?? 0) + 14} className="hp-label muted" dominantBaseline="central">Weekends</text>
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y2={plotH} className="hover-line" />
              {Object.values(series).map((arr, k) => arr[hover] && <circle key={k} cx={x(hover)} cy={y(arr[hover].v)} r={4} className="ts-dot" style={{ stroke: `var(--line-${l.css})` }} />)}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
