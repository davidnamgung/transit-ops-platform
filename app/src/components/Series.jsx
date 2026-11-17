import { useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { useElementWidth } from '../lib/hooks.js';
import { tip } from './Tooltip.jsx';

// A general annotated line chart: highlighted series in color, context series in gray,
// shaded bands for episodes, optional bars underneath (snow), threshold lines, and marks.

const M = { l: 48, t: 22, b: 30 };

export default function Series({
  series, xDomain, xTicks, yDomain, yTicks = 4, yFormat = (v) => v, bands = [], bars = null, marks = [],
  thresholds = [], height = 300, hoverContent, ariaLabel, endLabels = true,
}) {
  const wrapRef = useRef(null);
  const width = useElementWidth(wrapRef) || 640;
  const [hover, setHover] = useState(null);
  const R = endLabels ? 104 : 16;
  const plotW = Math.max(240, width - M.l - R);
  const plotH = height - M.t - M.b;
  const x = useMemo(() => scaleLinear().domain(xDomain).range([0, plotW]), [xDomain, plotW]);
  const y = useMemo(() => scaleLinear().domain(yDomain).range([plotH, 0]), [yDomain, plotH]);
  const ln = useMemo(() => line().x((p) => x(p.x)).y((p) => y(p.y)), [x, y]);
  const unit = plotW / (xDomain[1] - xDomain[0] + 1);

  const labels = useMemo(() => {
    const raw = series
      .filter((s) => s.endLabel && s.points.length)
      .map((s) => ({ s, y: y(s.points[s.points.length - 1].y) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < raw.length; i++) if (raw[i].y - raw[i - 1].y < 15) raw[i].y = raw[i - 1].y + 15;
    return raw;
  }, [series, y]);

  const color = (s) => (s.css ? `var(--line-${s.css})` : s.color || 'var(--muted)');
  const move = (e) => {
    const box = wrapRef.current.querySelector('svg').getBoundingClientRect();
    const xv = Math.max(xDomain[0], Math.min(xDomain[1], Math.round(xDomain[0] + ((e.clientX - box.left - M.l) / plotW) * (xDomain[1] - xDomain[0]))));
    setHover(xv);
    if (hoverContent) tip.show(e, hoverContent(xv));
  };
  const barMax = bars ? Math.max(bars.max || 0, ...bars.points.map((p) => p.v), 1) : 1;
  const barH = plotH * 0.24;

  return (
    <div className="chart series" ref={wrapRef}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        <g transform={`translate(${M.l} ${M.t})`}>
          {y.ticks(yTicks).map((t) => (
            <g key={t} transform={`translate(0 ${y(t)})`}>
              <line x2={plotW} className="grid-line" />
              <text x={-9} className="axis-text" textAnchor="end" dominantBaseline="central">{yFormat(t)}</text>
            </g>
          ))}
          {bands.map((b, k) => (
            <g key={k}>
              <rect x={x(b.from - 0.5)} y={0} width={Math.max(3, x(b.to + 0.5) - x(b.from - 0.5))} height={plotH} className={`band band-${b.type || 'closure'}`} />
              {b.label && x(b.to + 0.5) - x(b.from - 0.5) > 70 && <text x={x(b.from - 0.5) + 8} y={16} className="band-text">{b.label}</text>}
            </g>
          ))}
          {bars && bars.points.map((p) => p.v > 0 && (
            <rect key={p.x} x={x(p.x) - unit * 0.32} width={unit * 0.64} y={plotH - (p.v / barMax) * barH} height={(p.v / barMax) * barH} className="snow-bar" />
          ))}
          {thresholds.map((t) => (
            <g key={t.label} transform={`translate(0 ${y(t.y)})`}>
              <line x2={plotW} className="thresh-line" />
              <text x={plotW} y={-6} textAnchor="end" className="thresh-text">{t.label}</text>
            </g>
          ))}
          {series.filter((s) => !s.hero).map((s) => <path key={s.id} d={ln(s.points)} className="s-line s-muted" />)}
          {series.filter((s) => s.hero).map((s) => <path key={s.id} d={ln(s.points)} className="s-line" style={{ stroke: color(s) }} />)}
          {/* drawn after the lines so no line can cross over it */}
          {bars && (() => {
            const top = bars.points.reduce((a, p) => (p.v > a.v ? p : a), { v: 0, x: 0 });
            return top.v > 0 ? <text x={x(top.x)} y={plotH - (top.v / barMax) * barH - 6} textAnchor="middle" className="snow-text">{bars.format(top.v)}</text> : null;
          })()}
          {xTicks.map((t) => <text key={t.x} x={x(t.x)} y={plotH + 20} className="axis-text" textAnchor="middle">{t.label}</text>)}
          {marks.map((m, k) => (
            <g key={k} transform={`translate(${x(m.x)} 0)`}>
              <line y1={-4} y2={plotH} className="mark-line" />
              <text x={m.anchor === 'end' ? -7 : 7} y={m.dy ?? 4} textAnchor={m.anchor === 'end' ? 'end' : 'start'} className="mark-note">{m.label}</text>
            </g>
          ))}
          {endLabels && labels.map(({ s, y: ly }) => (
            <text key={s.id} x={plotW + 10} y={ly} dominantBaseline="central" className="s-label" style={{ fill: s.hero ? color(s) : 'var(--muted)' }}>{s.endLabel}</text>
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y2={plotH} className="hover-line" />
              {series.filter((s) => s.hero).map((s) => {
                const p = s.points.find((q) => q.x === hover);
                return p ? <circle key={s.id} cx={x(hover)} cy={y(p.y)} r={4.5} className="ts-dot" style={{ stroke: color(s) }} /> : null;
              })}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
