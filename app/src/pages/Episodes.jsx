import { useEffect, useMemo, useRef } from 'react';
import { DAY_TYPES, DAY_TYPE_ORDER, LINES, LINE_BY_ID, LINE_GROUPS } from '../lib/constants.js';
import { downloadCsv } from '../lib/csv.js';
import { dateRange, n0, pct0, plural, times } from '../lib/format.js';
import { navigate, useQueryState } from '../lib/router.js';
import { Bullet, DayTypeTag } from '../components/Bullet.jsx';
import EpisodeTimeline from '../components/EpisodeTimeline.jsx';
import { Figure } from '../components/Figure.jsx';

const TYPES = DAY_TYPE_ORDER.filter((t) => t !== 'normal');

function Detail({ model, e }) {
  const l = LINE_BY_ID[e.route_id];
  const t = DAY_TYPES[e.episode_type];
  const mid = Math.floor((e.startIdx + e.endIdx) / 2);
  return (
    <section className="detail" aria-live="polite">
      <div className="detail-head">
        <Bullet line={l} size="md" />
        <div>
          <DayTypeTag type={e.episode_type} />
          <p className="muted">{l.label}, {dateRange(e.start_date, e.end_date)} ({plural(e.n_days, 'day')})</p>
        </div>
      </div>
      <h2 className="detail-title">{e.label}</h2>
      <dl className="kv">
        <div><dt>Service level</dt><dd>{times(e.avg_volume_vs_typical)}</dd></div>
        <div><dt>Trips not in the schedule</dt><dd>{pct0(e.avg_pct_added)}</dd></div>
        <div><dt>Long gaps</dt><dd>{pct0(e.avg_pct_long_gaps)}</dd></div>
        <div><dt>Most snow in a day</dt><dd>{e.max_daily_snow_cm > 0 ? `${e.max_daily_snow_cm} cm` : 'none'}</dd></div>
        <div><dt>Strongest gust</dt><dd>{e.max_gust_kmh == null ? 'no data' : `${n0(e.max_gust_kmh)} km/h`}</dd></div>
        <div><dt>Delay alerts</dt><dd>{n0(e.delay_alerts)}</dd></div>
      </dl>
      <h3 className="sub">Why it is labeled this way</h3>
      <p className="note">{t.long}</p>
      {e.episode_type === 'planned_closure' && e.closure_alert_header && <p className="alert-text">{e.closure_alert_header}</p>}
      {e.episode_type === 'disruption' && e.max_daily_snow_cm >= 5 && (
        <p className="note">Up to {e.max_daily_snow_cm} cm of snow fell on one of these days, so weather is a likely cause. Alerts and the numbers agree that service was thin, but the data cannot prove the reason.</p>
      )}
      <button
        type="button"
        className="btn btn-wide"
        onClick={() => navigate([], { day: model.dayIso[mid], from: model.dayIso[Math.max(0, e.startIdx - 4)], to: model.dayIso[Math.min(model.nDays - 1, e.endIdx + 4)], show: LINE_GROUPS.find((g) => g.members.includes(e.route_id))?.id })}
      >
        See it on the year chart
      </button>
    </section>
  );
}

export default function Episodes({ model }) {
  const [params, setParams] = useQueryState();
  const typeSel = useMemo(() => {
    const raw = (params.get('type') || '').split(',').filter((t) => TYPES.includes(t));
    return new Set(raw.length ? raw : TYPES);
  }, [params]);
  const lineSel = params.get('line') && model.byLine.has(params.get('line')) ? params.get('line') : null;
  const sort = params.get('sort') === 'length' ? 'length' : 'date';

  const list = useMemo(() => {
    const out = model.episodes.filter((e) => typeSel.has(e.episode_type) && (!lineSel || e.route_id === lineSel));
    return out.sort(sort === 'length' ? (a, b) => b.n_days - a.n_days || a.startIdx - b.startIdx : (a, b) => a.startIdx - b.startIdx || a.route_id.localeCompare(b.route_id));
  }, [model, typeSel, lineSel, sort]);

  const selected = model.episodes.find((e) => e.key === params.get('ep')) || null;
  const rowRefs = useRef({});
  useEffect(() => {
    if (selected) rowRefs.current[selected.key]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const toggleType = (t) => {
    const next = new Set(typeSel);
    if (next.has(t)) {
      if (next.size === 1) return;
      next.delete(t);
    } else next.add(t);
    setParams({ type: next.size === TYPES.length ? null : [...next].join(',') });
  };
  const lanes = lineSel ? [lineSel] : model.routes;

  const onKeyDown = (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    const i = list.findIndex((e) => e.key === params.get('ep'));
    const next = list[Math.min(list.length - 1, Math.max(0, i + (ev.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      setParams({ ep: next.key });
      rowRefs.current[next.key]?.focus({ preventScroll: true });
    }
  };

  const download = () =>
    downloadCsv('headway-episodes.csv', list.map((e) => ({
      line: e.route_id, type: e.episode_type, start: e.start_date, end: e.end_date, days: e.n_days,
      what_happened: e.label, service_level: e.avg_volume_vs_typical, pct_trips_not_in_schedule: e.avg_pct_added,
      long_gaps_pct: e.avg_pct_long_gaps, max_snow_cm: e.max_daily_snow_cm, max_gust_kmh: e.max_gust_kmh, delay_alerts: e.delay_alerts,
    })));

  return (
    <div className="page episodes">
      <header className="page-head">
        <h1 className="display-m">Closures, disruptions, and gaps</h1>
        <p className="lede">
          An episode is a run of consecutive days when a line was not normal. {n0(model.episodes.length)} of them in the year. Pick one to see what the data says and how it was labeled.
        </p>
      </header>

      <div className="controls">
        <div className="chips" role="group" aria-label="Kinds of episode">
          {TYPES.map((t) => (
            <button key={t} type="button" className={`chip chip-type${typeSel.has(t) ? ' on' : ''}`} aria-pressed={typeSel.has(t)} onClick={() => toggleType(t)}>
              <span className={`swatch swatch-${DAY_TYPES[t].css}`} />
              {DAY_TYPES[t].label}
            </button>
          ))}
        </div>
        <label className="select">
          <span className="muted">Line</span>
          <select value={lineSel || ''} onChange={(ev) => setParams({ line: ev.target.value || null })}>
            <option value="">All lines</option>
            {LINES.filter((l) => model.byLine.has(l.id)).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
      </div>

      <Figure
        title="Every episode, on its line, across the year"
        lede="When did each line leave normal service, and for how long?"
        guide="Each row is a line and each bar is one episode, placed where it happened in the year and as long as it lasted. Violet bars are planned closures, pink are disruptions, teal are schedule gaps. Click a bar to read it, or pick a row in the table below."
        takeaway={`${n0(list.length)} episodes match the filters. Long violet bars are planned work; short pink bars are disruptions, usually a day or two.`}
        wide
      >
        <EpisodeTimeline model={model} episodes={list} lanes={lanes} selectedKey={selected?.key} onSelect={(key) => setParams({ ep: key })} />
      </Figure>

      <div className="split ep-split">
        <section className="panel" aria-label="Episode list">
          <div className="panel-head">
            <h2>{n0(list.length)} {list.length === 1 ? 'episode' : 'episodes'}</h2>
            <div className="head-actions">
              <label className="select">
                <span className="muted">Sort by</span>
                <select value={sort} onChange={(ev) => setParams({ sort: ev.target.value === 'date' ? null : ev.target.value })}>
                  <option value="date">Date</option>
                  <option value="length">Length</option>
                </select>
              </label>
              <button type="button" className="btn" onClick={download}>Download CSV</button>
            </div>
          </div>
          <div className="table-wrap tall">
            <table className="ep-table" onKeyDown={onKeyDown}>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Dates</th>
                  <th scope="col" className="num">Days</th>
                  <th scope="col">What happened</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.key} className={selected?.key === e.key ? 'on' : ''}>
                    <th scope="row"><span className="line-cell"><Bullet line={LINE_BY_ID[e.route_id]} size="sm" />{LINE_BY_ID[e.route_id].name}</span></th>
                    <td><DayTypeTag type={e.episode_type} /></td>
                    <td className="nowrap">{dateRange(e.start_date, e.end_date)}</td>
                    <td className="num">{e.n_days}</td>
                    <td>
                      <button type="button" ref={(el) => (rowRefs.current[e.key] = el)} className="row-btn" aria-pressed={selected?.key === e.key} onClick={() => setParams({ ep: e.key })}>
                        {e.label}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && <p className="muted pad">No episodes match these filters. Turn a kind back on or choose all lines.</p>}
          </div>
        </section>
        <aside className="side">
          {selected ? <Detail model={model} e={selected} /> : (
            <section className="detail empty">
              <h2>Pick an episode</h2>
              <p className="note">Click a bar on the timeline or a row in the table. Use the up and down arrow keys in the table to move between rows.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
