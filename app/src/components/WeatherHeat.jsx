import { useMemo, useRef } from 'react';
import { WEATHER_CATEGORIES } from '../lib/constants.js';
import { formatMetric, n0 } from '../lib/format.js';
import { useElementWidth } from '../lib/hooks.js';
import { makeRamp, metricColor } from '../lib/ramps.js';
import { hourLabel } from './HourlyProfile.jsx';
import { tip } from './Tooltip.jsx';

const LEFT = 92;
const ROW = 46;
const AXIS = 26;

// Rows are kinds of weather, columns are hours of the day. Cells with too little data stay empty.
export default function WeatherHeat({ cells, metric, minN, theme }) {
  const ref = useRef(null);
  const width = useElementWidth(ref) || 760;
  const ramp = useMemo(() => makeRamp(theme), [theme]);
  const plotW = Math.max(480, width - LEFT);
  const cw = plotW / 24;
  const height = AXIS + WEATHER_CATEGORIES.length * ROW;

  return (
    <div className="chart" ref={ref}>
      <div className="tl-scroll">
        <svg width={LEFT + plotW} height={height} role="img" aria-label={`${metric.label} by weather and hour of day`}>
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <text key={h} x={LEFT + h * cw + cw / 2} y={AXIS - 10} className="axis-text" textAnchor="middle">{hourLabel(h)}</text>
          ))}
          {WEATHER_CATEGORIES.map((c, ri) => (
            <g key={c.id} transform={`translate(0 ${AXIS + ri * ROW})`}>
              <text x={0} y={ROW / 2} className="rib-name" dominantBaseline="central">{c.label}</text>
              {Array.from({ length: 24 }, (_, h) => {
                const cell = cells.get(`${c.id}|${h}`);
                const ok = cell && cell.n >= minN && cell.value != null;
                const fill = ok ? metricColor(metric, cell.value, ramp) : null;
                return (
                  <rect
                    key={h}
                    x={LEFT + h * cw}
                    y={0}
                    width={cw - 2}
                    height={ROW - 3}
                    rx={3}
                    className={ok ? 'heat' : 'heat heat-empty'}
                    style={fill ? { fill } : undefined}
                    onPointerMove={(e) =>
                      tip.show(
                        e,
                        <div className="tip-body">
                          <strong>{c.label}, {hourLabel(h)}</strong>
                          {cell ? (
                            ok ? (
                              <>
                                <div className="tip-line">{metric.label}<b>{formatMetric(metric, cell.value)}</b></div>
                                <div className="tip-hint">Based on {n0(cell.n)} observations</div>
                              </>
                            ) : (
                              <div className="muted">Only {n0(cell.n)} observations, below the minimum of {n0(minN)}</div>
                            )
                          ) : (
                            <div className="muted">No observations</div>
                          )}
                        </div>,
                      )
                    }
                    onPointerLeave={() => tip.hide()}
                  />
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
