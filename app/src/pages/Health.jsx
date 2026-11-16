import { useEffect, useMemo, useState } from 'react';
import { n0, plural } from '../lib/format.js';
import { REPO } from '../lib/constants.js';
import { assess, dayStrip, downloadSeconds, fmtAgo, fmtDuration, fmtWhen, loadHealth, STALE_HOURS, stripSummary } from '../lib/health.js';
import { Figure } from '../components/Figure.jsx';
import RunStrip from '../components/RunStrip.jsx';
import Series from '../components/Series.jsx';

const CHECK_HELP = {
  staging: 'The cleaned tables: key columns are filled, every line is known, duplicates are rare, weather has no gaps, every train hour has weather.',
  marts: 'The answer tables: one row per day and line, percentages stay between 0 and 100, almost no events beyond the 12-hour cap. One warning here is normal: some line-days have no trips that can be compared with the timetable.',
  alerts: 'The service alerts: ids are unique, nearly all have a start time, known alerts are present with the right severity, almost none end before they start.',
};

const ICON = {
  healthy: <path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
  failing: <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
  stale: <path d="M12 6v6.5l4 2.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  empty: <path d="M6 12h12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
};
const TITLE = { healthy: 'Healthy', failing: 'Failing', stale: 'Overdue', empty: 'No runs yet' };

function Banner({ a }) {
  const newest = a.last?.freshness?.newest_service_date;
  const age = a.last?.freshness?.age_days;
  let line;
  if (a.state === 'healthy') line = `The pipeline last ran ${fmtAgo(a.hoursSince)} and passed every check. The numbers on this site are built from data through ${newest || 'the latest day available'}.`;
  else if (a.state === 'failing') {
    line = `The latest run failed at ${a.last.failed_stage || 'an unknown stage'}, ${fmtAgo(a.hoursSince)}. ${a.lastSuccess ? `The data on the site is from the last good run, ${fmtAgo((Date.now() - Date.parse(a.lastSuccess.finished_utc)) / 3600000)}.` : 'There has been no successful run on record.'}`;
  } else if (a.state === 'stale') line = `The pipeline has not reported in ${Math.round(a.hoursSince)} hours, and it should run daily. GitHub may be running late, or scheduled runs may have been switched off (GitHub does that after 60 days without repository activity).`;
  else line = 'The history is empty. The first run appears here once the Pipeline workflow has finished on GitHub.';
  return (
    <section className={`health-banner is-${a.state}`} aria-live="polite">
      <div className="health-state">
        <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true">{ICON[a.state]}</svg>
        <h2>{TITLE[a.state]}</h2>
      </div>
      <p className="health-line">{line}</p>
      {a.state !== 'empty' && (
        <dl className="health-facts">
          <div><dt>Last run</dt><dd>{fmtWhen(a.last.finished_utc)}</dd><dd className="muted">{a.last.status === 'success' ? 'passed' : 'failed'} in {fmtDuration(a.last.duration_sec)}</dd></div>
          <div><dt>Newest data</dt><dd>{newest || 'unknown'}</dd><dd className="muted">{age != null ? `${age} days old (limit ${a.last.freshness.max_age_days ?? 12})` : 'age not recorded'}</dd></div>
          <div><dt>Recent runs</dt><dd>{a.okCount} of {a.recentCount}</dd><dd className="muted">passed, of the last {a.recentCount}</dd></div>
        </dl>
      )}
    </section>
  );
}

function StageBars({ run }) {
  const max = Math.max(1, ...run.stages.map((s) => s.seconds || 0));
  return (
    <ul className="bars">
      {run.stages.map((s) => (
        <li key={s.name} className="bar-row stage-row">
          <span className="bar-name">{s.name}</span>
          <span className="bar-track"><i className={s.status === 'ok' ? '' : s.status === 'failed' ? 'bad' : 'skip'} style={{ width: `${Math.max(1.5, ((s.seconds || 0) / max) * 100)}%` }} /></span>
          <span className="bar-val num">{s.status === 'skipped' ? 'skipped' : `${(s.seconds || 0).toFixed(1)} s`}</span>
        </li>
      ))}
    </ul>
  );
}

function RunDetail({ day }) {
  if (!day || !day.runs.length) {
    return (
      <section className="panel health-detail">
        <h2>{day ? day.date : 'Pick a day'}</h2>
        <p className="muted">{day ? 'No run was recorded on this day.' : 'Click a square above to see that day’s run in detail.'}</p>
      </section>
    );
  }
  const run = day.runs[day.runs.length - 1];
  const f = run.facts || {};
  return (
    <section className="panel health-detail">
      <div className="panel-head">
        <h2>{fmtWhen(run.finished_utc)}</h2>
        {run.run_url && <a className="btn" href={run.run_url} target="_blank" rel="noreferrer">Open this run on GitHub</a>}
      </div>
      <p className="muted small">
        {run.status === 'success' ? 'Passed' : `Failed at ${run.failed_stage}`} in {fmtDuration(run.duration_sec)}. Started by {run.trigger === 'schedule' ? 'the daily schedule' : run.trigger === 'workflow_dispatch' ? 'a button press' : run.trigger}.
        {day.runs.length > 1 && ` ${day.runs.length} runs that day; this is the last.`}
      </p>
      {run.status === 'failed' && run.error_tail?.length > 0 && <pre className="error-tail">{run.error_tail.join('\n')}</pre>}
      {run.stages.length > 0 && (<><h3 className="sub">How long each stage took</h3><StageBars run={run} /></>)}
      {f.stop_events != null && (
        <p className="small">
          <strong>Data:</strong> {n0(f.stop_events)} stop events on {f.days_with_data} days ({f.first_service_date} to {f.last_service_date}), {f.days_without_data} days without data, {n0(f.alerts)} alerts, {f.episodes} episodes.
        </p>
      )}
    </section>
  );
}

export default function Health() {
  const [state, setState] = useState({ status: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    let alive = true;
    loadHealth().then((r) => alive && setState({ status: 'ready', ...r })).catch((e) => alive && setState({ status: 'error', message: e.message }));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const runs = state.runs || [];
  const a = useMemo(() => assess(runs, now), [runs, now]);
  const strip = useMemo(() => dayStrip(runs, now, 60), [runs, now]);
  const sum = useMemo(() => stripSummary(strip), [strip]);
  const selectedDate = picked || [...strip].reverse().find((d) => d.runs.length)?.date || null;
  const selectedDay = strip.find((d) => d.date === selectedDate) || null;
  const failures = useMemo(() => runs.filter((r) => r.status === 'failed').reverse().slice(0, 10), [runs]);
  const tickEvery = Math.max(1, Math.round(runs.length / 6));
  const xTicks = runs.map((r, i) => ({ x: i, label: new Date(r.finished_utc).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })).filter((_, i) => i % tickEvery === 0);

  return (
    <div className="page health">
      <header className="page-head">
        <h1 className="display-m">Platform health</h1>
        <p className="lede">Is the pipeline running, and can you trust today’s numbers? This page reads the pipeline’s own run history, live from GitHub.</p>
      </header>

      {state.status === 'loading' && <p className="muted">Reading the run history…</p>}
      {state.status === 'error' && (
        <section className="health-banner is-failing"><div className="health-state"><svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true">{ICON.failing}</svg><h2>History unreadable</h2></div><p className="health-line">{state.message}</p></section>
      )}

      {state.status === 'ready' && (
        <>
          <Banner a={a} />
          {a.state === 'empty' ? (
            <p className="fine">Nothing to chart yet. After the first scheduled or manual pipeline run, this page fills in by itself; there is nothing to configure here.</p>
          ) : (
            <>
              <section className="health-block">
                <Figure
                  title="One square per day"
                  lede="Did the pipeline run each day, and did it pass?"
                  legend={(
                    <ul className="legend">
                      <li><span className="run-swatch run-ok" />Ran and passed</li>
                      <li><span className="run-swatch run-failed" />Ran and failed</li>
                      <li><span className="run-swatch run-none" />No run that day</li>
                      <li><span className="run-swatch run-pending" />Today, no run yet</li>
                    </ul>
                  )}
                  guide="Each square is one day, oldest on the left, today on the right. Green means the day’s last run passed; red means it failed; hatched means the schedule produced no run that day. Click a square to read that day’s run."
                  takeaway={`In the last ${sum.days} days with history: ${sum.ok} passed, ${sum.failed} failed, and ${sum.missed} had no run at all.${a.state === 'stale' ? ' The most recent days are overdue.' : ''}`}
                  wide
                >
                  <RunStrip days={strip} selected={selectedDate} onSelect={setPicked} />
                </Figure>
                <RunDetail day={selectedDay} />
              </section>

              {runs.length >= 3 && (
                <section className="health-charts">
                  <Figure
                    title="How long each run takes"
                    lede="Does the saved-download cache keep runs fast?"
                    guide="Each point is one run, oldest on the left. The dark line is the whole run; the violet line is just the downloads. A run that must download a year of trip files from scratch is much slower than one that only fetches the newest day."
                    takeaway={`The latest run took ${fmtDuration(a.last.duration_sec)}, of which ${fmtDuration(downloadSeconds(a.last))} was downloading. The slowest run in this history took ${fmtDuration(Math.max(...runs.map((r) => r.duration_sec || 0)))}.`}
                  >
                    <Series
                      series={[
                        { id: 'total', color: 'var(--text)', hero: true, endLabel: 'Whole run', points: runs.map((r, i) => ({ x: i, y: (r.duration_sec || 0) / 60 })) },
                        { id: 'downloads', color: 'var(--t-closure)', hero: true, endLabel: 'Downloads', points: runs.map((r, i) => ({ x: i, y: downloadSeconds(r) / 60 })) },
                      ]}
                      xDomain={[0, runs.length - 1]}
                      xTicks={xTicks}
                      yDomain={[0, Math.max(5, Math.ceil(Math.max(...runs.map((r) => (r.duration_sec || 0) / 60)) + 1))]}
                      yFormat={(v) => `${v} min`}
                      ariaLabel="Duration of each pipeline run in minutes, whole run and downloads"
                      hoverContent={(x) => runs[x] && (
                        <div className="tip-body"><strong>{fmtWhen(runs[x].finished_utc)}</strong>
                          <div className="tip-line">Whole run<b>{fmtDuration(runs[x].duration_sec)}</b></div>
                          <div className="tip-line">Downloads<b>{fmtDuration(downloadSeconds(runs[x]))}</b></div></div>
                      )}
                    />
                  </Figure>
                  <Figure
                    title="How much data each run saw"
                    lede="Does the amount of data stay steady from day to day?"
                    guide="Each point is one run: the number of train-stop records in the year-long window it analyzed, in millions. The window slides forward one day at a time, so a steady line is expected. A sudden drop means data went missing."
                    takeaway={`The latest run analyzed ${n0(a.last.facts?.stop_events)} stop events across ${a.last.facts?.days_with_data ?? 'an unknown number of'} days.`}
                  >
                    <Series
                      series={[{ id: 'events', color: 'var(--line-blue)', hero: true, endLabel: 'Stop events', points: runs.map((r, i) => (r.facts?.stop_events ? { x: i, y: r.facts.stop_events / 1e6 } : null)).filter(Boolean) }]}
                      xDomain={[0, runs.length - 1]}
                      xTicks={xTicks}
                      yDomain={(() => { const v = runs.map((r) => (r.facts?.stop_events || 0) / 1e6).filter(Boolean); const lo = Math.min(...v), hi = Math.max(...v); const pad = Math.max(0.2, (hi - lo) * 0.4); return [Math.floor((lo - pad) * 10) / 10, Math.ceil((hi + pad) * 10) / 10]; })()}
                      yFormat={(v) => `${v.toFixed(1)}M`}
                      yTicks={4}
                      ariaLabel="Number of stop events analyzed by each pipeline run, in millions"
                      hoverContent={(x) => runs[x] && (<div className="tip-body"><strong>{fmtWhen(runs[x].finished_utc)}</strong><div className="tip-line">Stop events<b>{n0(runs[x].facts?.stop_events)}</b></div></div>)}
                    />
                  </Figure>
                </section>
              )}

              <section className="health-block">
                <h2 className="block-title">Checks on the latest run</h2>
                <table className="data-table">
                  <thead><tr><th scope="col">Checks</th><th scope="col" className="num">Passed</th><th scope="col" className="num">Warnings</th><th scope="col" className="num">Failures</th><th scope="col">What they guard</th></tr></thead>
                  <tbody>
                    {Object.entries(a.last.checks || {}).map(([name, c]) => (
                      <tr key={name}>
                        <th scope="row">{name}</th>
                        <td className="num">{c.passed}</td>
                        <td className="num">{c.warnings}</td>
                        <td className="num">{c.failures > 0 ? <strong className="bad-text">{c.failures}</strong> : c.failures}</td>
                        <td>{CHECK_HELP[name] || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="health-block">
                <h2 className="block-title">Incidents</h2>
                {failures.length === 0 ? (
                  <p className="muted">No failed runs in the recorded history.</p>
                ) : (
                  <table className="data-table">
                    <thead><tr><th scope="col">When</th><th scope="col">Failed at</th><th scope="col">Last line of output</th><th scope="col" /></tr></thead>
                    <tbody>
                      {failures.map((r) => (
                        <tr key={r.run_id}>
                          <td className="nowrap">{fmtWhen(r.finished_utc)}</td>
                          <td><code>{r.failed_stage}</code></td>
                          <td>{(r.error_tail || []).filter(Boolean).slice(-1)[0] || 'no output recorded'}</td>
                          <td>{r.run_url && <a className="link" href={r.run_url} target="_blank" rel="noreferrer">Open run</a>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}

          <section className="health-block how">
            <h2 className="block-title">How this page works</h2>
            <ul className="plain">
              <li><strong>Every pipeline run adds a record.</strong> After each run, passed or failed, the workflow appends a short summary to a small file on a branch called <code>pipeline-health</code> in the <a className="link" href={`https://github.com/${REPO}`} target="_blank" rel="noreferrer">repository</a>. The page reads that file directly from GitHub, so it is current within about five minutes and does not depend on the site being rebuilt.</li>
              <li><strong>“Overdue” is judged in your browser.</strong> The page compares the time of the last run with your clock. If the schedule silently stops, no new record arrives and the page turns red by itself after {STALE_HOURS} hours.</li>
              <li><strong>It keeps the last 90 runs.</strong> {state.skipped > 0 ? `${plural(state.skipped, 'entry', 'entries')} in the file could not be understood and ${state.skipped === 1 ? 'was' : 'were'} skipped. ` : ''}The history holds {plural(runs.length, 'run')} now.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
