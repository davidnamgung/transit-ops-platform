import { useMemo } from 'react';
import { LINES, WEATHER_CATEGORIES } from '../lib/constants.js';
import { formatMetric, n0 } from '../lib/format.js';
import { useTheme } from '../lib/hooks.js';
import { useQueryState } from '../lib/router.js';
import { Segmented } from '../components/Segmented.jsx';
import WeatherHeat from '../components/WeatherHeat.jsx';
import { gradientCss } from '../lib/ramps.js';

const METRICS = {
  gaps: { id: 'gaps', label: 'Long gaps', field: 'pct_headways_over_1_5x', n: 'n_headways', domain: [0, 60], higherIsWorse: true, unit: '%', help: 'Share of gaps between trains longer than 1.5 times the schedule. Lower is better.' },
  delay: { id: 'delay', label: 'Late arrivals', field: 'p90_schedule_diff_min', n: 'n_comparable', domain: [0, 40], higherIsWorse: true, unit: 'min', help: 'How late the slowest 10% of arrivals were. Lower is better.' },
  within5: { id: 'within5', label: 'On time', field: 'pct_within_5min', n: 'n_comparable', domain: [0, 100], higherIsWorse: false, unit: '%', help: 'Share of arrivals within 5 minutes of the schedule. Higher is better.' },
};
const METRIC_OPTIONS = Object.values(METRICS).map((m) => ({ id: m.id, label: m.label }));
const DAYS = [{ id: 'weekday', label: 'Weekdays' }, { id: 'weekend', label: 'Weekends' }];

export default function Weather({ model }) {
  const { theme } = useTheme();
  const [params, setParams] = useQueryState();
  const metric = METRICS[params.get('metric')] || METRICS.gaps;
  const line = params.get('line') && model.byLine.has(params.get('line')) ? params.get('line') : '';
  const weekend = params.get('days') === 'weekend';
  const minN = Math.max(0, Number(params.get('min')) || 300);

  // Combine rows across lines (weighted by how many observations each had).
  const { cells, byCat } = useMemo(() => {
    const acc = new Map();
    const cat = new Map();
    for (const r of model.hourly) {
      if (r.is_weekend !== weekend || (line && r.route_id !== line)) continue;
      const v = r[metric.field];
      const n = r[metric.n];
      if (v == null || !n) continue;
      for (const [map, key] of [[acc, `${r.weather_category}|${r.hour_local}`], [cat, r.weather_category]]) {
        const a = map.get(key) || { sum: 0, n: 0 };
        a.sum += v * n;
        a.n += n;
        map.set(key, a);
      }
    }
    const fin = (m) => new Map([...m].map(([k, a]) => [k, { value: a.n ? a.sum / a.n : null, n: a.n }]));
    return { cells: fin(acc), byCat: fin(cat) };
  }, [model, line, weekend, metric]);

  const dry = byCat.get('dry');

  return (
    <div className="page weather">
      <header className="page-head">
        <h1>How weather changes service</h1>
        <p className="lede">
          Each cell compares one kind of weather at one hour of the day. Rain and snow are rarer than dry weather, so cells with few observations are left blank rather than guessed.
        </p>
      </header>

      <div className="controls">
        <Segmented label="Measure" options={METRIC_OPTIONS} value={metric.id} onChange={(id) => setParams({ metric: id === 'gaps' ? null : id })} />
        <Segmented label="Days" options={DAYS} value={weekend ? 'weekend' : 'weekday'} onChange={(id) => setParams({ days: id === 'weekend' ? 'weekend' : null })} />
        <label className="select">
          <span className="muted">Line</span>
          <select value={line} onChange={(e) => setParams({ line: e.target.value || null })}>
            <option value="">All lines</option>
            {LINES.filter((l) => model.byLine.has(l.id)).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label className="select slider">
          <span className="muted">Show cells with at least <b>{n0(minN)}</b> observations</span>
          <input type="range" min="0" max="3000" step="50" value={minN} onChange={(e) => setParams({ min: e.target.value === '300' ? null : e.target.value })} />
        </label>
      </div>

      <WeatherHeat cells={cells} metric={metric} minN={minN} theme={theme} />
      <div className="legend ramp-legend">
        <span className="ramp-end">{formatMetric(metric, metric.higherIsWorse ? metric.domain[0] : metric.domain[1])}</span>
        <span className="ramp-bar" style={{ background: gradientCss(theme) }} aria-hidden="true" />
        <span className="ramp-end">{formatMetric(metric, metric.higherIsWorse ? metric.domain[1] : metric.domain[0])}</span>
        <span className="muted ramp-help">{metric.help}</span>
      </div>

      <section className="block">
        <h2>Across the whole day</h2>
        <p className="muted block-note">The average for each kind of weather, with how much data stands behind it.</p>
        <ul className="bars">
          {WEATHER_CATEGORIES.map((c) => {
            const a = byCat.get(c.id);
            const diff = a && dry && a.value != null && dry.value != null ? a.value - dry.value : null;
            const top = metric.domain[1];
            return (
              <li key={c.id} className="bar-row">
                <span className="bar-name">{c.label}<span className="muted bar-sub">{c.note}</span></span>
                <span className="bar-track"><i style={{ width: `${Math.min(100, ((a?.value ?? 0) / top) * 100)}%` }} /></span>
                <span className="bar-val num">{a?.value == null ? 'no data' : formatMetric(metric, a.value)}</span>
                <span className="bar-diff num muted">
                  {c.id === 'dry' ? 'baseline' : diff == null ? '' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(metric.unit === '%' ? 0 : 1)}${metric.unit === '%' ? ' points' : ' min'} vs dry`}
                </span>
                <span className="bar-n num muted">{a ? `${n0(a.n)} obs.` : ''}</span>
              </li>
            );
          })}
        </ul>
        <p className="note caution">
          Be careful reading cause into this. Snow only falls in winter and rain clusters in certain seasons, so each weather type also carries its own mix of schedules, closures, and crowds. The comparison is useful, not a controlled experiment.
        </p>
      </section>
    </div>
  );
}
