import { DAY_TYPES, DAY_TYPE_ORDER, METRIC_BY_ID } from '../lib/constants.js';
import { gradientCss } from '../lib/ramps.js';
import { formatMetric } from '../lib/format.js';

export function Legend({ metricId, theme }) {
  if (metricId === 'type') {
    return (
      <ul className="legend" aria-label="Color key">
        {DAY_TYPE_ORDER.map((id) => {
          const t = DAY_TYPES[id];
          return (
            <li key={id}>
              <span className={`swatch swatch-${t.css}`} aria-hidden="true" />
              <span>
                <strong>{t.label}</strong> <span className="muted">{t.short}</span>
              </span>
            </li>
          );
        })}
        <li>
          <span className="swatch swatch-nodata" aria-hidden="true" />
          <span>
            <strong>No data</strong> <span className="muted">The MBTA published nothing for that day.</span>
          </span>
        </li>
      </ul>
    );
  }
  const m = METRIC_BY_ID[metricId];
  const [lo, hi] = m.domain;
  const left = m.higherIsWorse === false ? hi : lo;
  const right = m.higherIsWorse === false ? lo : hi;
  return (
    <div className="legend ramp-legend" aria-label="Color key">
      <span className="ramp-end">{formatMetric(m, left)}</span>
      <span className="ramp-bar" style={{ background: gradientCss(theme) }} aria-hidden="true" />
      <span className="ramp-end">{formatMetric(m, right)}{right === hi && m.higherIsWorse ? ' or more' : ''}</span>
      <span className="muted ramp-help">{m.help}</span>
    </div>
  );
}
