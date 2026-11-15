import { useMemo } from 'react';
import { DAY_TYPES, LINES, LINE_BY_ID, METRICS, METRIC_BY_ID } from '../lib/constants.js';
import { downloadCsv } from '../lib/csv.js';
import { dateRange, n0 } from '../lib/format.js';
import { useTheme } from '../lib/hooks.js';
import { navigate, useQueryState } from '../lib/router.js';
import { countsByLine, longestEpisode, totalCounts } from '../lib/story.js';
import { Bullet } from '../components/Bullet.jsx';
import CalendarHeat from '../components/CalendarHeat.jsx';
import DayPanel from '../components/DayPanel.jsx';
import { dayTip } from '../components/DayTip.jsx';
import EpisodeList from '../components/EpisodeList.jsx';
import { Figure } from '../components/Figure.jsx';
import { Legend } from '../components/Legend.jsx';
import { Segmented } from '../components/Segmented.jsx';

export default function Explore({ model }) {
  const { theme } = useTheme();
  const [params, setParams] = useQueryState();
  const metricId = METRIC_BY_ID[params.get('metric')] ? params.get('metric') : 'type';
  const line = model.byLine.has(params.get('line')) ? params.get('line') : null;
  const dayParam = params.get('day') ? model.idxOf(params.get('day')) : null;
  const selectedIdx = Number.isInteger(dayParam) && dayParam >= 0 && dayParam < model.nDays ? dayParam : null;
  const metric = METRIC_BY_ID[metricId];

  const shortcuts = useMemo(() => {
    const make = (type, title) => {
      const e = longestEpisode(model, type);
      return e && { key: e.key, title, line: e.route_id, idx: Math.floor((e.startIdx + e.endIdx) / 2), note: `${LINE_BY_ID[e.route_id].label}, ${dateRange(e.start_date, e.end_date)}. ${e.label}` };
    };
    return [make('planned_closure', 'The longest planned closure'), make('disruption', 'The longest disruption'), make('schedule_matching_gap', 'Trips the schedule could not match')].filter(Boolean);
  }, [model]);

  const select = (idx, fromShortcut) => setParams({ day: model.dayIso[idx], line: fromShortcut?.line ?? line });
  const episodes = useMemo(
    () => model.episodes.filter((e) => !line || e.route_id === line).sort((a, b) => b.n_days - a.n_days || a.startIdx - b.startIdx),
    [model, line],
  );
  const lineOptions = [{ id: '', label: 'All lines' }, ...LINES.filter((l) => model.byLine.has(l.id)).map((l) => ({ id: l.id, label: l.name }))];

  const download = () => {
    const out = [];
    for (const id of line ? [line] : model.routes) {
      model.byLine.get(id).forEach((r) => {
        if (!r) return;
        out.push({ date: r.service_date, line: id, day_type: r.type, service_level: r.volume_vs_typical, pct_trips_not_in_schedule: r.pct_added, long_gaps_pct: r.pct_headways_over_1_5x, late_arrivals_p90_min: r.p90_schedule_diff_min, delay_alerts: r.n_delay_alerts, avg_temp_c: r.avg_temp_c, snow_cm: r.total_snow_cm });
      });
    }
    downloadCsv(`headway-days${line ? `-${line}` : ''}.csv`, out);
  };

  const legend = <Legend metricId={metricId} theme={theme} />;
  const summary = useMemo(() => {
    const lines = countsByLine(model);
    const t = line ? lines.find((x) => x.id === line) : totalCounts(lines);
    const top = episodes[0];
    return `${n0(t.unusual)} of ${n0(t.total)} ${line ? 'days' : 'line-days'} were exceptions.${top ? ` The longest was ${line ? '' : `the ${LINE_BY_ID[top.route_id].name}, `}${dateRange(top.start_date, top.end_date)}: ${top.label}` : ''}`;
  }, [model, line, episodes]);

  return (
    <div className="page explore">
      <header className="page-head">
        <h1 className="display-m">Explore every day</h1>
        <p className="lede">
          One square is one day on one line. Choose how the squares are colored, then click a day to see what happened on every line that day.
        </p>
      </header>

      <div className="controls">
        <div className="chips" role="radiogroup" aria-label="Line">
          {lineOptions.map((o) => {
            const l = o.id ? LINE_BY_ID[o.id] : null;
            const on = (line || '') === o.id;
            return (
              <button key={o.id || 'all'} type="button" role="radio" aria-checked={on} className={`chip${on ? ' on' : ''}`} onClick={() => setParams({ line: o.id || null })}>
                {l && <Bullet line={l} size="sm" />}
                {o.label}
              </button>
            );
          })}
        </div>
        <Segmented label="Color the days by" options={METRICS} value={metricId} onChange={(id) => setParams({ metric: id === 'type' ? null : id })} />
      </div>

      <Figure
        title={line ? `${LINE_BY_ID[line].label}, every day of the year` : 'Every line, every day of the year'}
        lede={metric.help}
        legend={legend}
        guide={metricId === 'type'
          ? 'Each square is a day. Weeks run left to right with Monday at the top, so a closure over a weekend appears as a pair of squares at the bottom. Gray-tinted squares are normal days. Hatched squares are days the MBTA published nothing.'
          : `Each square is a day, colored by ${metric.label.toLowerCase()}. ${metric.higherIsWorse === false ? 'Cooler colors mean more service.' : 'Warmer colors mean worse.'} Hatched squares are days with no data.`}
        takeaway={summary}
        wide
      >
        {line ? (
          <CalendarHeat model={model} routeId={line} metricId={metricId} theme={theme} size="lg" selectedIdx={selectedIdx} onSelect={select} tooltipFor={(r, i) => dayTip(model, r, i)} />
        ) : (
          <div className="cal-grid">
            {model.routes.map((id) => (
              <div key={id} className="cal-card">
                <button type="button" className="cal-card-head" onClick={() => setParams({ line: id })}>
                  <Bullet line={LINE_BY_ID[id]} size="sm" />
                  <span className="cal-card-name">{LINE_BY_ID[id].label}</span>
                </button>
                <CalendarHeat model={model} routeId={id} metricId={metricId} theme={theme} size="sm" selectedIdx={selectedIdx} onSelect={(i) => setParams({ day: model.dayIso[i] })} tooltipFor={(r, i) => dayTip(model, r, i)} label={`${LINE_BY_ID[id].label}, one square per day`} />
              </div>
            ))}
          </div>
        )}
      </Figure>

      <div className="split">
        <DayPanel model={model} idx={selectedIdx} lines={model.routes} shortcuts={shortcuts} onSelect={select} />
        <div className="side">
          <section className="panel">
            <div className="panel-head">
              <h2>{line ? `Episodes on the ${LINE_BY_ID[line].name}` : 'Longest episodes'}</h2>
            </div>
            <p className="muted small">An episode is a run of consecutive days when a line was not normal.</p>
            <EpisodeList episodes={episodes.slice(0, 6)} emptyText="No exceptions on this line." onPick={(e) => navigate(['episodes'], { ep: e.key })} />
            {episodes.length > 6 && <p className="fine">and {n0(episodes.length - 6)} shorter ones. See all on the Episodes page.</p>}
          </section>
          <button type="button" className="btn btn-wide" onClick={download}>Download these days as CSV</button>
        </div>
      </div>
    </div>
  );
}
