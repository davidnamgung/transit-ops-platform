import { useEffect, useMemo } from 'react';
import '../print.css';
import { DAY_TYPES, LINE_BY_ID, METRICS } from '../lib/constants.js';
import { FACTS, MODELS } from '../lib/facts.js';
import { dateRange, fmtDay, fmtMonthYear, n0, n1, pct0, pct1, times } from '../lib/format.js';
import { overviewFacts } from '../lib/overview.js';
import { REPO } from '../lib/constants.js';
import { addedByMonth, countsByLine, hourlyCurves, longestEpisode, rhythmFacts } from '../lib/story.js';
import { Bullet } from '../components/Bullet.jsx';
import CalendarHeat from '../components/CalendarHeat.jsx';
import HeatTable from '../components/HeatTable.jsx';
import { hourLabel } from '../components/HourlyProfile.jsx';
import { Legend } from '../components/Legend.jsx';
import { BuildStrip, KpiGrid, SummaryText } from '../components/Overview.jsx';
import { COLS } from '../components/PipelineDiagram.jsx';
import Series from '../components/Series.jsx';
import StackedBars from '../components/StackedBars.jsx';

// The PDF report. It is an ordinary page of A4 sheets built from the same components and the same
// numbers as the site, so the two can never disagree. scripts/build-pdf.mjs prints this page to a PDF
// when the site is built; you can also open it at  #/print  and use the browser's Print command.

const THEME = 'day';
const TOTAL = 6;
const OWNER_REPO = REPO.split('/');
const SITE_URL = `https://${OWNER_REPO[0]}.github.io/${OWNER_REPO[1]}/`;
const REPO_URL = `https://github.com/${REPO}`;

function Sheet({ n, title, kicker, children }) {
  return (
    <section className="sheet">
      <header className="sheet-head">
        <span className="sheet-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>Headway</span>
        <span className="sheet-run">Service report</span>
      </header>
      {title && (
        <div className="sheet-title">
          {kicker && <p className="sheet-kicker">{kicker}</p>}
          <h2>{title}</h2>
        </div>
      )}
      <div className="sheet-body">{children}</div>
      <footer className="sheet-foot"><span>{SITE_URL.replace('https://', '')}</span><span>{n} of {TOTAL}</span></footer>
    </section>
  );
}

function Fig({ n, title, note, children, wide }) {
  return (
    <figure className={`pf${wide ? ' pf-wide' : ''}`}>
      <figcaption><b>Figure {n}.</b> {title}</figcaption>
      <div className="pf-body">{children}</div>
      {note && <p className="pf-note">{note}</p>}
    </figure>
  );
}

const tickLabel = (model, i) => dateRange(model.dayIso[i], model.dayIso[i]).replace(/^\w+ /, '').replace(/, \d{4}$/, '');

export default function Print({ model }) {
  const f = useMemo(() => overviewFacts(model), [model]);
  const byLine = useMemo(() => countsByLine(model), [model]);
  const added = useMemo(() => addedByMonth(model), [model]);
  const curves = useMemo(() => hourlyCurves(model), [model]);
  const rhythm = useMemo(() => rhythmFacts(curves), [curves]);
  const gapEp = useMemo(() => longestEpisode(model, 'schedule_matching_gap'), [model]);
  const { closure, storm } = f;

  // The report is always printed in day colors, whatever the visitor chose for the site.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.dataset.theme;
    const title = document.title;
    document.title = 'Headway service report';
    root.dataset.theme = THEME;
    const frame = { id: 0 };
    document.fonts.ready.then(() => {
      frame.id = requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { window.__reportReady = true; }, 400)));
    });
    return () => {
      cancelAnimationFrame(frame.id);
      window.__reportReady = false;
      document.title = title;
      if (before) root.dataset.theme = before;
    };
  }, []);

  let bestAdded = null;
  added.rows.forEach((r) => r.cells.forEach((v, k) => { if (v != null && (!bestAdded || v > bestAdded.v)) bestAdded = { v, id: r.id, k }; }));
  const dryWeather = f.dry;
  let fig = 0;

  return (
    <div className="report">
      {/* ------------------------------ 1. cover and summary ------------------------------ */}
      <Sheet n={1}>
        <p className="cover-kicker">Headway service report</p>
        <h1 className="cover-title">What happened on Boston’s subway this year, and why</h1>
        <p className="cover-meta">
          {fmtMonthYear(model.start)} to {fmtMonthYear(model.end)} · {n0(model.routes.length)} lines · {n0(f.all.total)} line-days · data through {fmtDay(model.end)}
        </p>
        <h2 className="pr-h">Summary</h2>
        <SummaryText model={model} f={f} />
        <h2 className="pr-h">Key figures</h2>
        <KpiGrid f={f} />
        <BuildStrip />
        <p className="cover-note">
          Every number in this report is computed from the data, or recorded from the pipeline run that built it. The live site, {SITE_URL.replace('https://', '')}, lets you open any day on any line.
        </p>
      </Sheet>

      {/* ------------------------------ 2. the year ------------------------------ */}
      <Sheet n={2} kicker="1" title="The year at a glance">
        <p>
          Each square is one day on one line. Weeks run left to right with Monday at the top, so a weekend closure shows as a pair of squares and a month of work as a block. Of {n0(f.all.total)} line-days, {pct0(f.normalPct)} were ordinary. The other {n0(f.all.unusual)} are exceptions of three kinds, defined in the key and in the terms on the last page.
        </p>
        <Fig n={++fig} title="One square per day, every line, Nov 2025 to Nov 2026" wide>
          <div className="pr-cals">
            {model.routes.map((id) => {
              const l = LINE_BY_ID[id];
              const c = byLine.find((x) => x.id === id);
              return (
                <div key={id} className="pr-cal">
                  <div className="pr-cal-head"><Bullet line={l} size="sm" /><b>{l.label}</b><span>{n0(c.unusual)} of {n0(c.total)} days were exceptions</span></div>
                  <CalendarHeat model={model} routeId={id} theme={THEME} size="sm" label={`${l.label}, one square per day`} />
                </div>
              );
            })}
          </div>
          <Legend metricId="type" theme={THEME} />
        </Fig>
        <Fig n={++fig} title="How each line’s days split" note={`${f.mostExceptions ? `The ${LINE_BY_ID[f.mostExceptions.id].label} had the most exceptions (${pct0(f.exceptionRate(f.mostExceptions) * 100)} of its days) and the ${LINE_BY_ID[f.fewestExceptions.id].label} the fewest (${pct0(f.exceptionRate(f.fewestExceptions) * 100)}). ` : ''}Planned closures make up ${pct0(f.share('planned_closure'))} of all exceptions, disruptions ${pct0(f.share('disruption'))}, and schedule gaps ${pct0(f.share('schedule_matching_gap'))}.`}>
          <StackedBars rows={byLine} />
        </Fig>
      </Sheet>

      {/* ------------------------------ 3. closures and snow ------------------------------ */}
      <Sheet n={3} kicker="2" title="Planned work and snow">
        {closure && (
          <>
            <p>
              {n0(closure.closureEpisodes)} planned closures add up to {n0(closure.totalDays)} line-days. The longest was on the {f.closureLine.label}, {dateRange(closure.ep.start_date, closure.ep.end_date)}. The alerts are how we know such days were planned: a service-change alert lasting 12 hours or more covers {pct0((FACTS.alertOverlap.withLongAlert / FACTS.alertOverlap.addedHeavyDays) * 100)} of the days when most trips were missing from the schedule, against {pct1((FACTS.alertOverlap.normalWithLongAlert / FACTS.alertOverlap.normalDays) * 100)} of normal days.
            </p>
            <Fig n={++fig} title={`${f.closureLine.label}: service level around its longest closure`} note={`During the closure the ${f.closureLine.name} ran at ${times(closure.ep.avg_volume_vs_typical)} of its usual volume${f.closureOthers != null ? `, while the other lines averaged ${times(f.closureOthers)}` : ''}. A service level of 1.0 is a usual day.`}>
              <Series
                height={250}
                series={closure.series.map((s, k, arr) => ({ ...s, css: s.hero ? LINE_BY_ID[s.id].css : undefined, endLabel: s.hero ? LINE_BY_ID[s.id].name : k === arr.findIndex((q) => !q.hero) ? 'Other lines' : undefined }))}
                xDomain={[closure.a, closure.b]}
                xTicks={Array.from({ length: Math.floor((closure.b - closure.a) / 7) + 1 }, (_, k) => ({ x: closure.a + k * 7, label: tickLabel(model, closure.a + k * 7) }))}
                yDomain={[0, 1.3]}
                yFormat={(v) => `${v.toFixed(1)}x`}
                bands={[{ from: closure.ep.startIdx, to: closure.ep.endIdx, type: 'closure', label: `Planned closure, ${closure.ep.n_days} days` }]}
                ariaLabel={`Service level of the ${f.closureLine.label} around its longest planned closure`}
              />
            </Fig>
          </>
        )}
        {storm && (
          <>
            <p>
              The snowiest day was {fmtDay(model.calendar[storm.stormIdx])}, with {n1(storm.snow)}&nbsp;cm. {storm.affected.length === 0
                ? 'No line’s gaps between trains crossed the 40% mark that flags a disruption in the following week.'
                : `In the week around it, ${storm.affected.length === 1 ? 'one line' : `${storm.affected.length} lines`} saw at least 40% of their gaps run more than 1.5 times the schedule. “Back to normal” means two days in a row within 8 percentage points of the line’s usual level: a rule of thumb, not an official measure.`}
            </p>
            <Fig n={++fig} title="Share of gaps between trains that ran long, around the snowiest day" note={storm.affected[0] ? `${LINE_BY_ID[storm.affected[0].id].name} was hit hardest: ${pct0(storm.affected[0].peak)} of gaps ran long against ${pct0(storm.affected[0].typical)} on a usual day. Pale bars are snowfall in centimeters; the dashed line at 40% is where a day counts as a disruption.` : 'No line crossed the disruption threshold.'}>
              <Series
                height={250}
                series={storm.series.map((s) => ({ ...s, css: LINE_BY_ID[s.id].css, endLabel: LINE_BY_ID[s.id].name }))}
                xDomain={[storm.a, storm.b]}
                xTicks={Array.from({ length: Math.floor((storm.b - storm.a) / 3) + 1 }, (_, k) => ({ x: storm.a + k * 3, label: tickLabel(model, storm.a + k * 3) }))}
                yDomain={[0, 100]}
                yFormat={(v) => `${v}%`}
                thresholds={[{ y: 40, label: '40% flags a disruption' }]}
                bars={{ points: storm.bars, format: (v) => `${n1(v)} cm`, max: storm.snow }}
                marks={[{ x: storm.stormIdx, label: 'Snowiest day', dy: 14 }]}
                ariaLabel="Share of long gaps for the lines most affected by the heaviest snowfall, with snowfall bars"
              />
            </Fig>
          </>
        )}
      </Sheet>

      {/* ------------------------------ 4. schedule, clock, weather ------------------------------ */}
      <Sheet n={4} kicker="3" title="The schedule, the clock, and the weather">
        <p>
          Roughly {pct0((FACTS.trips.added / (FACTS.trips.added + FACTS.trips.scheduled + FACTS.trips.nonrevenue)) * 100)} of trips are tagged <strong>ADDED</strong>: trains running that no published timetable lists. During long closures the MBTA runs temporary patterns, and on some days, mostly weekends, nearly every trip is tagged added while trains run normally. That is why the main measure here, long gaps, does not depend on the timetable at all.
        </p>
        <Fig n={++fig} title="Share of trips not in the schedule, by line and month" note={bestAdded ? `The peak was the ${LINE_BY_ID[bestAdded.id].label} in ${fmtMonthYear(added.months[bestAdded.k].date)}, when ${pct0(bestAdded.v)} of trips were unmatched. Warmer colors mean more.` : ''}>
          <HeatTable table={added} theme={THEME} />
        </Fig>
        {rhythm && (
          <Fig n={++fig} title="Long gaps by hour of the day, dry weekdays" note={rhythm.overnight && rhythm.dayHi ? `Between 6 am and 10 pm the ${rhythm.c.label} ranges from ${pct0(rhythm.dayLo.y)} to ${pct0(rhythm.dayHi.y)}. The overnight spike to ${pct0(rhythm.hi.y)} rests on few trains (${n0(rhythm.hiN)} of ${n0(rhythm.total)} observations).` : `The swing is largest on the ${rhythm.c.label}: from ${pct0(rhythm.lo.y)} to ${pct0(rhythm.hi.y)} across the day.`}>
            <Series
              height={188}
              series={curves.map((c) => ({ id: c.id, label: c.label, css: c.css, hero: true, endLabel: c.label, points: c.points.map((p) => ({ x: p.x, y: p.y })) }))}
              xDomain={[0, 23]}
              xTicks={[0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({ x: h, label: hourLabel(h) }))}
              yDomain={[0, Math.max(40, Math.ceil(Math.max(...curves.flatMap((c) => c.points.map((p) => p.y))) / 10) * 10)]}
              yFormat={(v) => `${v}%`}
              ariaLabel="Share of long gaps by hour of day for each line on dry weekdays"
            />
          </Fig>
        )}
        <Fig n={++fig} title="Share of gaps that ran long, by kind of weather" note={f.worst && dryWeather != null ? `${f.worst.label[0].toUpperCase()}${f.worst.label.slice(1)} hours are ${f.worst.value > dryWeather ? 'worse' : 'better'} than dry hours by ${n1(Math.abs(f.worst.value - dryWeather))} points (${n0(f.worst.n)} observations). Snow only falls in winter and each weather carries its own mix of schedules and crowds, so this describes a pattern and does not prove cause.` : ''}>
          <WeatherBars model={model} />
        </Fig>
      </Sheet>

      {/* ------------------------------ 5. how it was built ------------------------------ */}
      <Sheet n={5} kicker="4" title="How it was built">
        <p>
          Scripts download public files. A database cleans, joins, and judges them in layers. Checks test every layer. Four small files carry the results to the website, which does the rest in the browser.
        </p>
        <Fig n={++fig} title="The pipeline, from public sources to this report" wide>
          <ol className="pr-flow">
            {COLS.map((c, i) => (
              <li key={c.title} className={`pr-step dg-${i}`}>
                <span className="pr-step-n">{i + 1}</span>
                <b>{c.title}</b>
                <span className="pr-step-sub">{c.sub}</span>
                <span className="pr-step-items">{c.items.join(' · ')}</span>
              </li>
            ))}
          </ol>
        </Fig>
        <div className="pr-two">
          <div>
            <h3 className="pr-h3">Four rules</h3>
            <ul className="pr-list">
              <li><b>Raw data is never edited.</b> Every file is kept as received.</li>
              <li><b>Every step can be rerun.</b> Two runs give the same result as one.</li>
              <li><b>Every judgment call is recorded.</b> Data is flagged, not deleted.</li>
              <li><b>Checks fail loudly.</b> A failed check stops the run.</li>
            </ul>
            <h3 className="pr-h3">Automation</h3>
            <ul className="pr-list">
              <li>Runs every day on GitHub’s free computers, with no server to maintain.</li>
              <li>The site is rebuilt only when every check passed; a failed run leaves the previous version online.</li>
              <li>A failure sends an alert and is logged on a public Platform Health page.</li>
              <li>Same data, same results on a Mac and on Linux: matching checksums on both.</li>
            </ul>
          </div>
          <div>
            <h3 className="pr-h3">The warehouse ({n0(FACTS.build.tables)} tables)</h3>
            <table className="pr-table">
              <tbody>
                {MODELS.map((m) => (
                  <tr key={m.name}><th scope="row">{m.name.replace(/^(stg|int|mart)_/, '')}</th><td>{m.layer}</td></tr>
                ))}
              </tbody>
            </table>
            <h3 className="pr-h3">Checks on every build</h3>
            <ul className="pr-list">
              <li><b>Raw files.</b> Row counts and dates match their filenames.</li>
              <li><b>Staging.</b> Keys never empty, one row per trip and stop, weather for every hour.</li>
              <li><b>Marts.</b> One row per grain, percentages between 0 and 100, every line-day has weather.</li>
              <li><b>Alerts.</b> Unique ids, known alerts present with the right severity.</li>
              <li><b>Fingerprint.</b> Checksums of the main tables, identical after any rebuild.</li>
            </ul>
          </div>
        </div>
      </Sheet>

      {/* ------------------------------ 6. trust ------------------------------ */}
      <Sheet n={6} kicker="5" title="How far to trust it, and what comes next">
        <p>Far enough to see the shape of the year, with five things in mind. None changes the story above.</p>
        <ul className="pr-list pr-trust">
          <li><b>{n0(model.gaps.length)} days have no data.</b> The MBTA published an empty file for {FACTS.files.empty} of them and nothing for {FACTS.files.unpublished}. They are shown as hatched squares, never as zeros.</li>
          <li><b>About {pct1((FACTS.raw.duplicateRowsFlagged / FACTS.raw.stopEvents) * 100)} of records appeared twice,</b> mostly on the shared Green Line trunk. The copy on the trip’s own line is kept.</li>
          <li><b>Non-passenger trains are excluded.</b> {n0(FACTS.trips.nonrevenue)} trips ran with no passengers, mostly at dawn. Left in, they looked like trains running 9 to 18 hours early.</li>
          <li><b>{pct0(f.unmatchedStops)} of stops cannot be compared with the schedule,</b> so measures that need the timetable use only matched trains.</li>
          <li><b>One weather reading stands in for the whole network.</b> It comes from a weather model, not a platform sensor.</li>
        </ul>
        <h3 className="pr-h3">Not built yet</h3>
        <ul className="pr-list">
          <li><b>Forecasting.</b> The groundwork exists (weather memory features, alert kinds, a measure that survives disruptions), but there is no model, and none is claimed.</li>
          <li><b>Per-station results,</b> which need a new table and a way to attribute delays to places.</li>
          <li><b>A comparison with the MBTA’s own published performance figures,</b> to confirm the measures agree.</li>
        </ul>
        {gapEp && (
          <p className="pr-aside">
            One example of a limit: on the {LINE_BY_ID[gapEp.route_id].label}, {dateRange(gapEp.start_date, gapEp.end_date)}, about {pct0(gapEp.avg_pct_added)} of trips were unmatched, yet the line ran at {times(gapEp.avg_volume_vs_typical)} of its usual volume. Trains were running; the records just did not match.
          </p>
        )}
        <h3 className="pr-h3">Terms used in this report</h3>
        <dl className="pr-terms">
          <div><dt>Line-day</dt><dd>One line on one day. The data holds {n0(f.all.total)} of them.</dd></div>
          <div><dt>Long gap</dt><dd>{METRICS.find((m) => m.id === 'gaps').help}</dd></div>
          <div><dt>Service level</dt><dd>{METRICS.find((m) => m.id === 'volume').help}</dd></div>
          <div><dt>Planned closure</dt><dd>{DAY_TYPES.planned_closure.short}</dd></div>
          <div><dt>Disruption</dt><dd>{DAY_TYPES.disruption.short}</dd></div>
          <div><dt>Schedule gap</dt><dd>{DAY_TYPES.schedule_matching_gap.short}</dd></div>
        </dl>
        <h3 className="pr-h3">Explore and reproduce</h3>
        <ul className="pr-list">
          <li><b>Live site:</b> {SITE_URL}</li>
          <li><b>Source code, runbook, and tests:</b> {REPO_URL}</li>
        </ul>
        <p className="pr-credit">
          Train performance and alert data: Massachusetts Bay Transportation Authority, used under the MassDOT Developers License Agreement. Weather data: Open-Meteo.com. This project is independent and is not affiliated with or endorsed by the MBTA.
        </p>
      </Sheet>
    </div>
  );
}

function WeatherBars({ model }) {
  const rows = useMemo(() => {
    const out = {};
    for (const r of model.hourly) {
      if (r.pct_headways_over_1_5x == null || !r.n_headways) continue;
      const o = (out[r.weather_category] ||= { sum: 0, n: 0 });
      o.sum += r.pct_headways_over_1_5x * r.n_headways;
      o.n += r.n_headways;
    }
    return [['dry', 'Dry hours'], ['rain', 'Rain hours'], ['heavy_rain', 'Heavy rain hours'], ['snow', 'Snow hours']].map(([id, label]) => ({ id, label, value: out[id] ? out[id].sum / out[id].n : null, n: out[id]?.n || 0 }));
  }, [model]);
  const max = Math.max(40, ...rows.map((r) => r.value || 0));
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.id} className="bar-row simple">
          <span className="bar-name">{r.label}</span>
          <span className="bar-track"><i style={{ width: `${((r.value ?? 0) / max) * 100}%` }} /></span>
          <span className="bar-val num">{r.value == null ? 'no data' : pct0(r.value)}</span>
          <span className="bar-n num muted">{n0(r.n)} observations</span>
        </li>
      ))}
    </ul>
  );
}
