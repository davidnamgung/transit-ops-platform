import { useMemo } from 'react';
import { DAY_TYPES, DAY_TYPE_ORDER, LINE_BY_ID } from '../lib/constants.js';
import { FACTS } from '../lib/facts.js';
import { dateRange, fmtDay, fmtMonthYear, minutes, n0, n1, pct0, pct1, plural, times } from '../lib/format.js';
import { useTheme } from '../lib/hooks.js';
import { addedByMonth, closureStory, countsByLine, delayAlertBuckets, hourlyCurves, longestEpisode, rhythmFacts, stormStory, totalCounts, weatherBars } from '../lib/story.js';
import { Bullet } from '../components/Bullet.jsx';
import CalendarHeat from '../components/CalendarHeat.jsx';
import { dayTip } from '../components/DayTip.jsx';
import { Figure } from '../components/Figure.jsx';
import HeatTable from '../components/HeatTable.jsx';
import { hourLabel } from '../components/HourlyProfile.jsx';
import Series from '../components/Series.jsx';
import StackedBars from '../components/StackedBars.jsx';
import Toc from '../components/Toc.jsx';
import { navigate } from '../lib/router.js';

const SECTIONS = [
  { id: 'question', label: 'The question' },
  { id: 'coverage', label: 'What the data covers' },
  { id: 'ordinary', label: 'How often service was normal' },
  { id: 'closures', label: 'Planned closures' },
  { id: 'storms', label: 'Snow and recovery' },
  { id: 'unmatched', label: 'Trips outside the schedule' },
  { id: 'alerts', label: 'Do alerts and measures agree?' },
  { id: 'rhythm', label: 'A normal day' },
  { id: 'weather', label: 'Weather' },
  { id: 'limits', label: 'What the data cannot tell us' },
  { id: 'predictions', label: 'Predictions: not built yet' },
  { id: 'conclusions', label: 'Conclusions' },
];

function MiniBars({ rows, field, format, max }) {
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.id} className="bar-row mini">
          <span className="bar-name">{r.label}<span className="muted bar-sub">{n0(r.days)} line-days</span></span>
          <span className="bar-track"><i style={{ width: `${Math.min(100, ((r[field] ?? 0) / max) * 100)}%` }} /></span>
          <span className="bar-val num">{r[field] == null ? 'no data' : format(r[field])}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Report({ model }) {
  const { theme } = useTheme();
  const byLine = useMemo(() => countsByLine(model), [model]);
  const all = useMemo(() => totalCounts(byLine), [byLine]);
  const closure = useMemo(() => closureStory(model), [model]);
  const storm = useMemo(() => stormStory(model), [model]);
  const gapEp = useMemo(() => longestEpisode(model, 'schedule_matching_gap'), [model]);
  const added = useMemo(() => addedByMonth(model), [model]);
  const curves = useMemo(() => hourlyCurves(model), [model]);
  const wb = useMemo(() => weatherBars(model), [model]);
  const buckets = useMemo(() => delayAlertBuckets(model), [model]);
  const rhythm = useMemo(() => rhythmFacts(curves), [curves]);
  const open = (idx, line) => navigate(['explore'], { line, day: model.dayIso[idx] });
  const closures = useMemo(() => model.episodes.filter((e) => e.episode_type === 'planned_closure').sort((a, b) => b.n_days - a.n_days || a.startIdx - b.startIdx).slice(0, 8), [model]);
  const dry = wb.dry ? wb.dry.sum / wb.dry.n : null;
  const totalAdded = FACTS.tripKinds.added + FACTS.tripKinds.scheduled + FACTS.tripKinds.nonrevenue;
  const first = buckets[0];
  const last = [...buckets].reverse().find((b) => b.days >= 5);
  const snowDate = storm ? model.dayIso[storm.stormIdx] : null;
  const greenShare = all.unusual ? (byLine.filter((l) => l.id.startsWith('Green')).reduce((a, l) => a + l.unusual, 0) / all.unusual) * 100 : 0;

  return (
    <div className="page doc-page">
      <header className="page-head">
        <h1 className="display-m">The report: what happened, why, and how sure we are</h1>
        <p className="lede">The long version of the story. Each finding comes with the evidence behind it, the way it was checked, and what the evidence cannot show.</p>
      </header>

      <div className="doc">
        <aside className="doc-aside"><Toc items={SECTIONS} /></aside>
        <article className="doc-body">

          <section id="question" className="doc-section">
            <h2>The question and the approach</h2>
            <p>
              The question: <strong>when and why did Boston’s subway fall short of normal service between {fmtMonthYear(model.start)} and {fmtMonthYear(model.end)}, and how much of that can public data explain?</strong>
            </p>
            <p>The work had five steps. Each is described in full on the Method page.</p>
            <ol className="steps">
              <li><strong>Collect.</strong> Download the MBTA’s train records for every service day, its service-alert history, and hourly weather for Boston.</li>
              <li><strong>Clean and join.</strong> Turn {n0(FACTS.raw.stopEvents)} train-at-a-stop records into one consistent, typed table, and attach the weather and the alerts.</li>
              <li><strong>Label.</strong> Give every line on every day a label: normal, planned closure, disruption, or schedule gap.</li>
              <li><strong>Cross-check.</strong> Test whether the labels agree with an independent source, the MBTA’s own alerts, and whether the measures agree with each other.</li>
              <li><strong>Describe and bound.</strong> Report the patterns, and say where the evidence stops.</li>
            </ol>
            <h3>Words used on this page</h3>
            <dl className="defs">
              <div><dt>Line-day</dt><dd>One line on one day. {n0(all.total)} of them have data.</dd></div>
              <div><dt>Gap between trains</dt><dd>The wait between one train and the next at a station. Transit agencies call it the headway.</dd></div>
              <div><dt>Long gap</dt><dd>A gap more than 1.5 times the scheduled gap. The share of long gaps is the main measure of how often riders waited longer than planned.</dd></div>
              <div><dt>Service level</dt><dd>How many train stops were recorded compared with a usual day for that line. 1.0 is usual, 0.5 is half.</dd></div>
              <div><dt>Late arrivals (p90)</dt><dd>How late the slowest 10% of arrivals were compared with the timetable.</dd></div>
            </dl>
          </section>

          <section id="coverage" className="doc-section">
            <h2>What the data covers</h2>
            <p>
              The window is {fmtDay(model.start)} to {fmtDay(model.end)}: {n0(model.nDays)} calendar days. {n0(model.nDays - model.gaps.length)} of them have data on every line, and {n0(model.gaps.length)} have none. For {FACTS.files.empty} of those days the MBTA published a file with zero rows, and for {FACTS.files.unpublished} ({FACTS.files.unpublishedDate}) it published nothing.
            </p>
            <table className="kv-table">
              <tbody>
                <tr><th scope="row">Train stop events</th><td>{n0(FACTS.raw.stopEvents)}</td><td className="muted">One row per train at one stop on one trip</td></tr>
                <tr><th scope="row">Kept after removing duplicates</th><td>{n0(FACTS.raw.keptAfterDedupe)}</td><td className="muted">{n0(FACTS.raw.duplicateRowsFlagged)} rows ({pct0((FACTS.raw.duplicateRowsFlagged / FACTS.raw.stopEvents) * 100)}) flagged and set aside</td></tr>
                <tr><th scope="row">Service alerts on the subway lines</th><td>{n0(FACTS.alerts.onOurLines)}</td><td className="muted">Rebuilt from {n0(FACTS.alerts.versions)} stored versions of {n0(FACTS.alerts.distinct)} alerts</td></tr>
                <tr><th scope="row">Hours of weather</th><td>{n0(FACTS.weather.hours)}</td><td className="muted">Hourly for central Boston, no gaps</td></tr>
                <tr><th scope="row">Stations</th><td>{n0(FACTS.stations)}</td><td className="muted">Names and coordinates from the MBTA API</td></tr>
              </tbody>
            </table>
            <p className="fine">Counts come from {FACTS.asOf}. The calendar below shows the days with no data as hatched squares.</p>
            <Figure title="Where the data has holes" lede="Which days have no data, and is it the same on every line?" guide="One square per day for the Red Line. Hatched squares are days the MBTA published nothing usable. The pattern is identical on every line, which means the gaps are in the source, not in the cleaning." takeaway={`${plural(model.gaps.length, 'day')} are missing, scattered through the year. Charts on this site show them as gaps, never as zeros.`} wide>
              <CalendarHeat model={model} routeId={model.routes[0]} theme={theme} size="lg" tooltipFor={(r, i) => dayTip(model, r, i)} onSelect={(i) => open(i, model.routes[0])} />
            </Figure>
          </section>

          <section id="ordinary" className="doc-section">
            <h2>How often service was normal</h2>
            <p>
              Of {n0(all.total)} line-days, {n0(all.counts.normal)} ({pct0((all.counts.normal / all.total) * 100)}) were normal. The remaining {n0(all.unusual)} split into {n0(all.counts.planned_closure)} planned closure days, {n0(all.counts.disruption)} disruption days, and {n0(all.counts.schedule_matching_gap)} schedule-gap days.
            </p>
            <Figure title="Each line’s year, split by kind of day" lede="Which lines had the most exceptions?" guide="Each bar is one line’s year. Gray is normal, violet is planned closure, pink is disruption, teal is schedule gap. The percentage on the right is the share of days that were not normal." takeaway={`${pct0(greenShare)} of all exception days are on the four Green Line branches. They share a trunk and are often closed together, so one project can count four times.`} wide>
              <StackedBars rows={byLine} />
            </Figure>
            <table className="data-table">
              <thead><tr><th scope="col">Line</th>{DAY_TYPE_ORDER.map((t) => <th key={t} scope="col" className="num">{DAY_TYPES[t].label}</th>)}<th scope="col" className="num">No data</th></tr></thead>
              <tbody>
                {byLine.map((l) => (
                  <tr key={l.id}>
                    <th scope="row"><span className="line-cell"><Bullet line={LINE_BY_ID[l.id]} size="sm" />{LINE_BY_ID[l.id].name}</span></th>
                    {DAY_TYPE_ORDER.map((t) => <td key={t} className="num">{n0(l.counts[t])}</td>)}
                    <td className="num">{n0(l.nodata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {closure && (
            <section id="closures" className="doc-section">
              <h2>Planned closures</h2>
              <p>
                A day is a planned closure when a service-change alert lasting 12 hours or more covers it and either at least half of the trips were missing from the timetable or trains ran at under 80% of the usual volume. There were {n0(closure.closureEpisodes)} such episodes, {n0(closure.totalDays)} line-days in all. These are the eight longest.
              </p>
              <table className="data-table">
                <thead><tr><th scope="col">Line</th><th scope="col">Dates</th><th scope="col" className="num">Days</th><th scope="col" className="num">Service level</th><th scope="col">What the alert said</th></tr></thead>
                <tbody>
                  {closures.map((e) => (
                    <tr key={e.key}>
                      <th scope="row"><span className="line-cell"><Bullet line={LINE_BY_ID[e.route_id]} size="sm" />{LINE_BY_ID[e.route_id].name}</span></th>
                      <td className="nowrap">{dateRange(e.start_date, e.end_date)}</td>
                      <td className="num">{e.n_days}</td>
                      <td className="num">{times(e.avg_volume_vs_typical)}</td>
                      <td>{e.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                <strong>Why believe the label?</strong> The label is built partly from the alerts, so on its own it proves little. The test that matters is the reverse: take the days when most trips were missing from the timetable and ask how often a long service-change alert was in force. It was {pct0((FACTS.alertOverlap.withLongAlert / FACTS.alertOverlap.addedHeavyDays) * 100)} of the time ({FACTS.alertOverlap.withLongAlert} of {FACTS.alertOverlap.addedHeavyDays} line-days). Among normal days it was {pct1((FACTS.alertOverlap.normalWithLongAlert / FACTS.alertOverlap.normalDays) * 100)}. Two independent records, the trip data and the alert text, point at the same days.
              </p>
              <Figure title={`${LINE_BY_ID[closure.ep.route_id].label}: the longest closure`} lede="Did the closure show up in the number of trains that ran?" guide="The colored line is the line’s service level each day: 1.0 is usual. Gray lines are the other lines. The violet band is the closure." takeaway={`The ${LINE_BY_ID[closure.ep.route_id].name} dropped to ${times(closure.ep.avg_volume_vs_typical)} of normal volume for ${closure.ep.n_days} days. ${closure.ep.closure_alert_header ? `The alert: “${closure.ep.closure_alert_header}”.` : ''}`}>
                <Series
                  series={closure.series.map((s, k, arr) => ({ ...s, css: s.hero ? LINE_BY_ID[s.id].css : undefined, endLabel: s.hero ? LINE_BY_ID[s.id].name : k === arr.findIndex((q) => !q.hero) ? 'Other lines' : undefined }))}
                  xDomain={[closure.a, closure.b]}
                  xTicks={Array.from({ length: Math.floor((closure.b - closure.a) / 7) + 1 }, (_, k) => ({ x: closure.a + k * 7, label: dateRange(model.dayIso[closure.a + k * 7], model.dayIso[closure.a + k * 7]).replace(/^\w+ /, '').replace(/, \d{4}$/, '') }))}
                  yDomain={[0, 1.3]}
                  yFormat={(v) => `${v.toFixed(1)}x`}
                  bands={[{ from: closure.ep.startIdx, to: closure.ep.endIdx, type: 'closure', label: `Planned closure, ${closure.ep.n_days} days` }]}
                  ariaLabel="Service level around the longest planned closure"
                  hoverContent={(x) => <div className="tip-body"><strong>{fmtDay(model.calendar[x])}</strong><div className="tip-line">{LINE_BY_ID[closure.ep.route_id].name}<b>{times(model.byLine.get(closure.ep.route_id)[x]?.volume_vs_typical)}</b></div></div>}
                />
              </Figure>
            </section>
          )}

          {storm && (
            <section id="storms" className="doc-section">
              <h2>Snow and recovery</h2>
              <p>
                The snowiest day was {fmtDay(model.calendar[storm.stormIdx])} with {n1(storm.snow)}&nbsp;cm. A disruption is a day on which at least 40% of gaps ran long or trains ran at under 60% of the usual volume with no closure alert. {storm.affected.length ? `In the week around the storm ${plural(storm.affected.length, 'line')} met that bar.` : 'No line met that bar in the week around the storm.'}
              </p>
              {storm.affected.length > 0 && (
                <table className="data-table">
                  <thead><tr><th scope="col">Line</th><th scope="col" className="num">Worst day</th><th scope="col" className="num">Share of long gaps that day</th><th scope="col" className="num">Usual share</th><th scope="col" className="num">Back to normal</th></tr></thead>
                  <tbody>
                    {storm.affected.map((a) => (
                      <tr key={a.id}>
                        <th scope="row"><span className="line-cell"><Bullet line={LINE_BY_ID[a.id]} size="sm" />{LINE_BY_ID[a.id].name}</span></th>
                        <td className="num nowrap">{fmtDay(model.calendar[a.peakIdx]).replace(/, \d{4}$/, '')}</td>
                        <td className="num">{pct0(a.peak)}</td>
                        <td className="num">{pct0(a.typical)}</td>
                        <td className="num">{a.daysToRecover == null ? 'not within the data' : `${a.daysToRecover} days after the snow`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {snowDate === '2026-01-25' && (
                <p>
                  <strong>What the alerts said, and what the trains did.</strong> In this storm the MBTA’s alerts spoke of delays of 10 to 30 minutes, snow clearing from signals and switches, and, on the Red Line, “lingering impacts of the recent winter storm” with reduced service. The train data tells a larger story: on the worst days more than 80% of gaps on the Blue and Red Lines ran long. Alerts describe incidents; the trip data describes what riders actually waited for.
                </p>
              )}
              <p>
                “Back to normal” means two days in a row within 8 percentage points of the line’s usual level. It is a rule of thumb chosen to be simple, not an official measure.
              </p>
              <Figure title="Long gaps around the snowiest day" lede="How badly did service thin out, and when did it return?" guide="Each colored line is one subway line. The vertical axis is the share of gaps between trains that ran more than 1.5 times the schedule: higher is worse. The pale bars are snowfall in centimeters. The dashed line at 40% is the disruption threshold." takeaway={storm.affected[0] ? `${LINE_BY_ID[storm.affected[0].id].name} peaked at ${pct0(storm.affected[0].peak)}. ${storm.affected[0].daysToRecover != null ? `It took ${storm.affected[0].daysToRecover} days after the snowfall to get back to its usual range.` : ''}` : 'No line crossed the threshold.'}>
                <Series
                  series={storm.series.map((s) => ({ ...s, css: LINE_BY_ID[s.id].css, endLabel: LINE_BY_ID[s.id].name }))}
                  xDomain={[storm.a, storm.b]}
                  xTicks={Array.from({ length: Math.floor((storm.b - storm.a) / 3) + 1 }, (_, k) => ({ x: storm.a + k * 3, label: dateRange(model.dayIso[storm.a + k * 3], model.dayIso[storm.a + k * 3]).replace(/^\w+ /, '').replace(/, \d{4}$/, '') }))}
                  yDomain={[0, 100]}
                  yFormat={(v) => `${v}%`}
                  thresholds={[{ y: 40, label: '40% flags a disruption' }]}
                  bars={{ points: storm.bars, format: (v) => `${n1(v)}\u00a0cm`, max: storm.snow }}
                  marks={[{ x: storm.stormIdx, label: 'Snowiest day', dy: 14 }]}
                  ariaLabel="Long gaps for the most affected lines around the snowiest day"
                  hoverContent={(x) => <div className="tip-body"><strong>{fmtDay(model.calendar[x])}</strong>{storm.affected.map((a) => <div key={a.id} className="tip-line">{LINE_BY_ID[a.id].name}<b>{pct0(model.byLine.get(a.id)[x]?.pct_headways_over_1_5x)}</b></div>)}</div>}
                />
              </Figure>
            </section>
          )}

          <section id="unmatched" className="doc-section">
            <h2>Trips outside the schedule</h2>
            <p>
              The MBTA’s records tag each trip. Of {n0(FACTS.trips.scheduled + FACTS.trips.added + FACTS.trips.nonrevenue)} trips, {n0(FACTS.trips.added)} ({pct0((FACTS.trips.added / (FACTS.trips.scheduled + FACTS.trips.added + FACTS.trips.nonrevenue)) * 100)}) are tagged ADDED, meaning they do not match a trip in the published timetable. Because those trips are shorter, they are {pct0((FACTS.tripKinds.added / totalAdded) * 100)} of recorded stops.
            </p>
            <p>
              We investigated what ADDED means before using it. Three things stood out. First, the share is not constant: it surges during closures, when the MBTA runs temporary patterns no timetable lists. Second, ADDED trips are much shorter than scheduled ones, about 4.7 recorded stops against 16.8. Third, on some days nearly every trip is ADDED yet trains run at a normal volume. Those are the schedule gaps.
            </p>
            <p>
              A separate tag, NONREV, marks {n0(FACTS.trips.nonrevenue)} non-passenger trips. They ran mostly between 4 and 7 a.m. and, matched against the timetable, appeared to arrive 9 to 18 hours early. Before they were identified, the rule that excluded implausible matches removed {n0(FACTS.nonrev.oldExclusions)} events, and {FACTS.nonrev.shareOfOldExclusions}% of them were non-revenue trips. Giving them their own tag replaced a blunt cutoff with a reason.
            </p>
            <Figure title="Trips not in the schedule, by line and month" lede="When did unmatched trips pile up?" guide="Each row is a line, each column a month. The number is the average share of that month’s trips not in the timetable. Warmer colors mean more." takeaway="Bands of warm color line up with the closures described above: during a closure, the trains that do run are mostly temporary ones.">
              <HeatTable table={added} theme={theme} />
            </Figure>
            {gapEp && (
              <Figure title="A schedule gap" lede={`${LINE_BY_ID[gapEp.route_id].label}, ${dateRange(gapEp.start_date, gapEp.end_date)}`} guide="One square per day; the outlined block is the schedule gap. Click a square to read that day." takeaway={`For ${gapEp.n_days} days about ${pct0(gapEp.avg_pct_added)} of trips were unmatched, yet trains ran at ${times(gapEp.avg_volume_vs_typical)} of the usual volume. No closure alert explains it, so it is treated as a record-keeping artifact.`} wide>
                <CalendarHeat model={model} routeId={gapEp.route_id} theme={theme} size="lg" tooltipFor={(r, i) => dayTip(model, r, i)} onSelect={(i) => open(i, gapEp.route_id)} marks={[{ from: gapEp.startIdx, to: gapEp.endIdx, label: `${n0(gapEp.n_days)} days of unmatched trips` }]} />
              </Figure>
            )}
          </section>

          <section id="alerts" className="doc-section">
            <h2>Do the alerts and the measurements agree?</h2>
            <p>
              The alerts are written by people at the MBTA. The long-gap and late-arrival figures come from vehicle data. If both describe the same reality, days with more delay alerts should look worse in the measurements. This is a test of the measurements, not just of the alerts.
            </p>
            <Figure title="Measured service by number of delay alerts that day" lede="Do days with more delay alerts show worse service in the train data?" guide="Each group is a set of line-days sorted by how many delay alerts were active. The bars show the typical (median) value in each group. Longer bars mean worse service." takeaway={first && last && first.gaps != null && last.gaps != null ? `With no delay alerts the typical share of long gaps was ${pct0(first.gaps)}; on days with ${last.label.toLowerCase()} it was ${pct0(last.gaps)}. The typical late-arrival figure moved from ${first.p90 == null ? 'no data' : `${n1(first.p90)} min`} to ${last.p90 == null ? 'no data' : `${n1(last.p90)} min`}.` : ''} wide>
              <div className="two-bars">
                <div><h4 className="mini-title">Share of long gaps</h4><MiniBars rows={buckets} field="gaps" format={(v) => pct0(v)} max={Math.max(40, ...buckets.map((b) => b.gaps || 0))} /></div>
                <div><h4 className="mini-title">Late arrivals, slowest 10%</h4><MiniBars rows={buckets} field="p90" format={(v) => `${n1(v)} min`} max={Math.max(20, ...buckets.map((b) => b.p90 || 0))} /></div>
              </div>
            </Figure>
            <p className="fine">A caution: busier lines may simply attract more alerts, so part of the pattern could come from which lines are in each group. A within-line comparison would be stronger and is on the list of next steps.</p>
          </section>

          {curves.length > 0 && (
            <section id="rhythm" className="doc-section">
              <h2>A normal day</h2>
              <p>
                For the {n0(FACTS.schedule.comparableEvents)} arrivals that could be matched to a scheduled trip, the difference between actual and scheduled arrival had a median of {FACTS.schedule.medianSec} seconds late. The middle half of arrivals fell between {minutes(FACTS.schedule.p25Min)} and {minutes(FACTS.schedule.p75Min)}. The slowest 5% were more than {n1(FACTS.schedule.p95Min)} minutes late and the slowest 1% more than {n1(FACTS.schedule.p99Min)}.
              </p>
              <p>Looking at dry weekdays only removes weather from the picture and shows the daily rhythm of the system.</p>
              {rhythm && rhythm.overnight && rhythm.dayHi && (
                <p>
                  The highest share of long gaps is overnight, not at rush hour: the {rhythm.c.label} reaches {pct0(rhythm.hi.y)} around {hourLabel(rhythm.hi.x)}. That hour holds only {n0(rhythm.hiN)} of the line’s {n0(rhythm.total)} weekday observations ({rhythm.hiShare < 0.1 ? 'under 0.1%' : pct1(rhythm.hiShare)}), and the data cannot say why gaps run long then, so it is better read as a sign of how irregular late-night service is than as a finding about riders. During service hours (6 am to 10 pm) the {rhythm.c.label} ranges from {pct0(rhythm.dayLo.y)} to {pct0(rhythm.dayHi.y)}, highest around {hourLabel(rhythm.dayHi.x)}.
                </p>
              )}
              <Figure title="Long gaps by hour, dry weekdays" lede="When during the day do trains come least often relative to the schedule?" guide="Each line is one subway line (the four Green branches combined). The vertical axis is the share of gaps between trains more than 1.5 times the schedule." takeaway="Look for the hours where lines separate or rise together: those are times when the schedule asks the most of the system.">
                <Series
                  series={curves.map((c) => ({ id: c.id, label: c.label, css: c.css, hero: true, endLabel: c.label, points: c.points.map((p) => ({ x: p.x, y: p.y })) }))}
                  xDomain={[0, 23]}
                  xTicks={[0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({ x: h, label: hourLabel(h) }))}
                  yDomain={[0, Math.max(40, Math.ceil(Math.max(...curves.flatMap((c) => c.points.map((p) => p.y))) / 10) * 10)]}
                  yFormat={(v) => `${v}%`}
                  ariaLabel="Long gaps by hour on dry weekdays"
                  hoverContent={(x) => <div className="tip-body"><strong>{hourLabel(x)}</strong>{curves.map((c) => { const p = c.points.find((q) => q.x === x); return <div key={c.id} className="tip-line">{c.label}<b>{p ? pct0(p.y) : 'too few trains'}</b></div>; })}</div>}
                />
              </Figure>
            </section>
          )}

          <section id="weather" className="doc-section">
            <h2>Weather</h2>
            <p>
              Each hour of train activity is matched to the weather for that hour. {pct0(FACTS.weather.dry)} of hours were dry, {pct0(FACTS.weather.rain)} rainy, {pct0(FACTS.weather.heavyRain)} heavy rain, {pct0(FACTS.weather.snow)} snow, and {pct0(FACTS.weather.unknown)} of events had no weather match, almost all because the record has no stop time to match against.
            </p>
            {dry != null && (
              <ul className="plain">
                {['rain', 'heavy_rain', 'snow'].filter((c) => wb[c]).map((c) => {
                  const v = wb[c].sum / wb[c].n;
                  const label = { rain: 'Rain', heavy_rain: 'Heavy rain', snow: 'Snow' }[c];
                  return <li key={c}><strong>{label}:</strong> {pct0(v)} of gaps ran long, against {pct0(dry)} when dry ({v >= dry ? '+' : '−'}{n1(Math.abs(v - dry))} points, {n0(wb[c].n)} observations).</li>;
                })}
              </ul>
            )}
            <p>
              <strong>Why this is not proof.</strong> Snow only falls in winter and heavy rain is rare, so each kind of weather brings its own mix of closures, schedules, and crowds. A fair comparison would hold the line, the hour, and the season constant. The Weather page lets you compare by hour of day and by line, and hides cells with too little data.
            </p>
          </section>

          <section id="limits" className="doc-section">
            <h2>What the data cannot tell us</h2>
            <ul className="plain">
              <li><strong>Why a disruption happened.</strong> Alerts name proximate causes, such as a signal problem or a disabled train. The data cannot say whether the root cause was weather, maintenance, or staffing.</li>
              <li><strong>What riders experienced.</strong> We measure trains, not passengers. There is no ridership data, so a long gap at 3 a.m. counts the same as one at 8 a.m.</li>
              <li><strong>Late arrivals on bad days.</strong> The late-arrival figure matches each train to a scheduled trip. When service is cut, trains get matched to the wrong scheduled trip and the figure inflates. On the worst storm days it reached implausible values, so long gaps are the headline measure.</li>
              <li><strong>Whether closures were announced in advance.</strong> “Planned” is inferred from a long alert, not from a notice date.</li>
              <li><strong>Where on a line a problem happened.</strong> Measures are per line and day. Station-level results are not built.</li>
              <li><strong>The thresholds are choices.</strong> Forty percent long gaps, 60% service level, and 12 hours for a long alert are reasonable and not tuned per line. The Green Line D branch runs more long gaps on a normal day than the Orange Line does.</li>
              <li><strong>Surges below the thresholds.</strong> Some stretches, such as one Red Line period in July with 70 to 89% unmatched trips at normal volume, sit just under the 90% schedule-gap threshold and are not labeled.</li>
              <li><strong>One weather point.</strong> A single reading for central Boston stands in for a network that spans many miles.</li>
            </ul>
          </section>

          <section id="predictions" className="doc-section">
            <h2>Predictions: not built yet</h2>
            <p className="callout"><strong>Status: not built.</strong> Nothing on this site is a prediction. Every number is a measurement of something that already happened. This section describes the plan, so you can judge it before any model exists.</p>
            <h3>What would be predicted</h3>
            <p>The first target is the chance that a given line has at least 40% long gaps in a given hour or on a given day. It is built on the headway measure because that is the one measure that survives disruptions.</p>
            <h3>What it would know</h3>
            <p>Hour and weekday, month, recent history for the line, snow and rain in the previous 24 and 72 hours (already computed), the forecast for the coming hours, and whether a long service-change alert is in force. The alert and weather features are the ones the data suggests matter most.</p>
            <h3>What it must beat</h3>
            <p>A baseline that simply reports the historical average for the same line, hour, weekday, and weather type. A model that cannot beat that table adds nothing. Both would be scored on the final three months of data, which the model never sees, using the Brier score for probabilities and the mean absolute error for shares.</p>
            <h3>What could go wrong</h3>
            <p>Leakage, where a feature quietly contains the answer: alerts are written after the problem starts, so an alert can only be used if it was already active. Rare events, since disruptions are about 1% of line-days and a model can look accurate by always predicting “normal”. And a short history of one year, which holds one winter.</p>
            <h3>Where it would run</h3>
            <p>A weekly scheduled job would retrain it, write its error to a table, and show that table on a Platform Health page, so drift is visible.</p>
          </section>

          <section id="conclusions" className="doc-section">
            <h2>Conclusions</h2>
            <ol className="steps">
              <li><strong>Most days were ordinary.</strong> {pct0((all.counts.normal / all.total) * 100)} of line-days had nothing unusual.</li>
              <li><strong>Planned work explains most exceptions.</strong> {pct0((all.counts.planned_closure / all.unusual) * 100)} of exception days were planned closures, and the alerts agree with the trip data on which days those were.</li>
              <li><strong>Snow matters, and recovery outlasts the snowfall.</strong> {storm && storm.affected.length ? `${LINE_BY_ID[storm.affected[0].id].name} peaked at ${pct0(storm.affected[0].peak)} long gaps.` : 'No line broke down in the heaviest snow.'}</li>
              <li><strong>A fifth of stops cannot be matched to a timetable,</strong> so any measure that needs the timetable must be reported with its limits.</li>
              <li><strong>Alerts and measurements agree,</strong> which is evidence that the measurements capture something real.</li>
              <li><strong>The prediction layer, per-station results, and automation are still to come.</strong></li>
            </ol>
          </section>
        </article>
      </div>
    </div>
  );
}
