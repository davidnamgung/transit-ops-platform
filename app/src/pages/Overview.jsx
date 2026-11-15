import { useMemo } from 'react';
import { DAY_TYPES, LINES, LINE_BY_ID, LINE_GROUPS, METRICS, METRIC_BY_ID } from '../lib/constants.js';
import { downloadCsv } from '../lib/csv.js';
import { dateRange, fmtDay, fmtMonthYear, minutes, n0, pct0, times } from '../lib/format.js';
import { useTheme } from '../lib/hooks.js';
import { href, navigate, useQueryState } from '../lib/router.js';
import DayPanel from '../components/DayPanel.jsx';
import EpisodeList from '../components/EpisodeList.jsx';
import { Legend } from '../components/Legend.jsx';
import { LineChips } from '../components/LineChips.jsx';
import RangeSummary from '../components/RangeSummary.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { DayTypeTag } from '../components/Bullet.jsx';
import YearRibbons from '../components/YearRibbons.jsx';

const clampIdx = (model, i) => (Number.isInteger(i) && i >= 0 && i < model.nDays ? i : null);

function winterRange(model) {
  const dec = model.calendar.findIndex((d) => d.getUTCMonth() === 11 && d.getUTCDate() === 1);
  if (dec < 0) return null;
  let end = model.calendar.findIndex((d, i) => i > dec && d.getUTCMonth() === 2 && d.getUTCDate() === 1) - 1;
  if (end < 0) end = model.nDays - 1;
  return [dec, end];
}

export default function Overview({ model }) {
  const { theme } = useTheme();
  const [params, setParams] = useQueryState();

  const metricId = METRIC_BY_ID[params.get('metric')] ? params.get('metric') : 'type';
  const shown = useMemo(() => {
    const raw = (params.get('show') || '').split(',').filter((g) => LINE_GROUPS.some((x) => x.id === g));
    return new Set(raw.length ? raw : LINE_GROUPS.map((g) => g.id));
  }, [params]);
  const lines = useMemo(
    () => LINES.map((l) => l.id).filter((id) => model.byLine.has(id) && LINE_GROUPS.some((g) => shown.has(g.id) && g.members.includes(id))),
    [model, shown],
  );

  const selectedIdx = params.get('day') ? clampIdx(model, model.idxOf(params.get('day'))) : null;
  const rangeA = params.get('from') ? clampIdx(model, model.idxOf(params.get('from'))) : null;
  const rangeB = params.get('to') ? clampIdx(model, model.idxOf(params.get('to'))) : null;
  const range = rangeA != null && rangeB != null && rangeA <= rangeB ? [rangeA, rangeB] : null;

  const setDay = (i) => setParams({ day: i == null ? null : model.dayIso[i] });
  const setRange = (r) => setParams({ from: r ? model.dayIso[r[0]] : null, to: r ? model.dayIso[r[1]] : null });
  const toggleGroup = (id) => {
    const next = new Set(shown);
    if (next.has(id)) {
      if (next.size === 1) return;
      next.delete(id);
    } else next.add(id);
    setParams({ show: next.size === LINE_GROUPS.length ? null : [...next].join(',') });
  };

  const winter = useMemo(() => winterRange(model), [model]);
  const presets = [
    { id: 'all', label: 'Whole year', range: null },
    ...(winter ? [{ id: 'winter', label: 'Winter', range: winter }] : []),
    { id: 'q90', label: 'Last 90 days', range: [Math.max(0, model.nDays - 90), model.nDays - 1] },
    { id: 'q30', label: 'Last 30 days', range: [Math.max(0, model.nDays - 30), model.nDays - 1] },
  ];
  const presetActive = (p) => (p.range ? range && range[0] === p.range[0] && range[1] === p.range[1] : !range);

  // "Good places to start": one real example of each kind of episode.
  const shortcuts = useMemo(() => {
    const longest = (type) => model.episodes.filter((e) => e.episode_type === type).sort((a, b) => b.n_days - a.n_days || a.startIdx - b.startIdx)[0];
    const make = (e, title) =>
      e && {
        key: e.key,
        title,
        note: `${LINE_BY_ID[e.route_id].label}, ${dateRange(e.start_date, e.end_date)}. ${e.label}`,
        idx: Math.floor((e.startIdx + e.endIdx) / 2),
        range: [Math.max(0, e.startIdx - 4), Math.min(model.nDays - 1, e.endIdx + 4)],
      };
    return [
      make(longest('planned_closure'), 'The longest planned closure'),
      make(longest('disruption'), 'The longest disruption'),
      make(longest('schedule_matching_gap'), 'Trips the schedule could not match'),
    ].filter(Boolean);
  }, [model]);

  const episodesInView = useMemo(() => {
    const [a, b] = range || [0, model.nDays - 1];
    return model.episodes
      .filter((e) => lines.includes(e.route_id) && e.endIdx >= a && e.startIdx <= b)
      .sort((x, y) => y.n_days - x.n_days || x.startIdx - y.startIdx);
  }, [model, lines, range]);

  const tooltipFor = (routeId, idx) => {
    const l = LINE_BY_ID[routeId];
    const row = model.byLine.get(routeId)[idx];
    const date = fmtDay(model.calendar[idx]);
    if (!row) {
      return (
        <div className="tip-body">
          <strong>{l.label}</strong>
          <div className="muted">{date}</div>
          <div>No data published for this day</div>
        </div>
      );
    }
    return (
      <div className="tip-body">
        <strong>{l.label}</strong>
        <div className="muted">{date}</div>
        <DayTypeTag type={row.type} />
        <div className="tip-line">Service level<b>{times(row.volume_vs_typical)}</b></div>
        <div className="tip-line">Long gaps<b>{pct0(row.pct_headways_over_1_5x)}</b></div>
        <div className="tip-line">Late arrivals (p90)<b>{row.p90_schedule_diff_min == null ? 'no data' : minutes(row.p90_schedule_diff_min)}</b></div>
        {row.longest_closure_header && <div className="tip-alert">{row.longest_closure_header}</div>}
        <div className="tip-hint">Click to read the whole day</div>
      </div>
    );
  };

  const download = () => {
    const [a, b] = range || [0, model.nDays - 1];
    const out = [];
    for (const id of lines) {
      const arr = model.byLine.get(id);
      for (let i = a; i <= b; i++) {
        const r = arr[i];
        if (!r) continue;
        out.push({
          date: r.service_date, line: id, day_type: r.type, service_level: r.volume_vs_typical,
          pct_trips_not_in_schedule: r.pct_added, long_gaps_pct: r.pct_headways_over_1_5x,
          late_arrivals_p90_min: r.p90_schedule_diff_min, median_arrival_diff_min: r.median_schedule_diff_min,
          delay_alerts: r.n_delay_alerts, avg_temp_c: r.avg_temp_c, precip_mm: r.total_precip_mm,
          snow_cm: r.total_snow_cm, max_gust_kmh: r.max_gust_kmh,
        });
      }
    }
    downloadCsv(`headway-days-${model.dayIso[a]}-to-${model.dayIso[b]}.csv`, out);
  };

  const dataDays = model.nDays - model.gaps.length;

  return (
    <div className="page overview">
      <header className="page-head">
        <h1>A year of subway service, day by day</h1>
        <p className="lede">
          {n0(dataDays)} days of data, {fmtMonthYear(model.start)} to {fmtMonthYear(model.end)}. Each strip is one line and each tick is one day. Spot a stretch that looks different, drag across it to zoom, then click a day to read it.
        </p>
      </header>

      <div className="controls">
        <LineChips groups={LINE_GROUPS} active={shown} onToggle={toggleGroup} />
        <Segmented label="Color the days by" options={METRICS} value={metricId} onChange={(id) => setParams({ metric: id === 'type' ? null : id })} />
      </div>

      <div className="zoom-row">
        <div className="presets" role="group" aria-label="Zoom to">
          {presets.map((p) => (
            <button key={p.id} type="button" className={`btn btn-ghost${presetActive(p) ? ' on' : ''}`} onClick={() => setRange(p.range)}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="muted zoom-note" aria-live="polite">
          {range ? `Zoomed to ${dateRange(model.dayIso[range[0]], model.dayIso[range[1]])}` : 'Showing the whole year'}
        </p>
      </div>

      <YearRibbons
        model={model}
        lines={lines}
        metricId={metricId}
        theme={theme}
        selectedIdx={selectedIdx}
        range={range}
        onSelect={(i) => setDay(i)}
        onRange={setRange}
        tooltipFor={tooltipFor}
      />
      <Legend metricId={metricId} theme={theme} />

      <div className="split">
        <DayPanel
          model={model}
          idx={selectedIdx}
          lines={lines}
          shortcuts={shortcuts}
          onSelect={(i, r) => {
            if (r) setParams({ day: model.dayIso[i], from: model.dayIso[r[0]], to: model.dayIso[r[1]] });
            else setDay(i);
          }}
        />
        <div className="side">
          <RangeSummary model={model} lines={lines} range={range} />
          <section className="panel">
            <div className="panel-head">
              <h2>Episodes in view</h2>
              <a className="link" href={href(['episodes'])}>All episodes</a>
            </div>
            <EpisodeList
              episodes={episodesInView.slice(0, 6)}
              emptyText="No closures, disruptions, or gaps in this view."
              onPick={(e) => navigate(['episodes'], { ep: e.key })}
            />
            {episodesInView.length > 6 && <p className="fine">and {n0(episodesInView.length - 6)} more, shorter ones.</p>}
          </section>
          <button type="button" className="btn btn-wide" onClick={download}>
            Download these days as CSV
          </button>
        </div>
      </div>
    </div>
  );
}
