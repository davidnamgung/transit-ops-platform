import { useMemo } from 'react';
import { DAY_TYPES, DAY_TYPE_ORDER, LINE_BY_ID, LINE_GROUPS } from '../lib/constants.js';
import { FACTS } from '../lib/facts.js';
import { dateRange, fmtDay, fmtMonthYear, minutes, n0, n1, pct0, pct1, times } from '../lib/format.js';
import { prefersReducedMotion, useTheme } from '../lib/hooks.js';
import { href, navigate } from '../lib/router.js';
import { addedByMonth, closureStory, countsByLine, hourlyCurves, longestEpisode, rhythmFacts, stormStory, totalCounts, weatherBars } from '../lib/story.js';
import { Bullet } from '../components/Bullet.jsx';
import CalendarHeat from '../components/CalendarHeat.jsx';
import { dayTip } from '../components/DayTip.jsx';
import { Figure } from '../components/Figure.jsx';
import HeatTable from '../components/HeatTable.jsx';
import { hourLabel } from '../components/HourlyProfile.jsx';
import { Legend } from '../components/Legend.jsx';
import Series from '../components/Series.jsx';
import StackedBars from '../components/StackedBars.jsx';

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
const WEATHER = [
  { id: 'dry', label: 'Dry hours' },
  { id: 'rain', label: 'Rain hours' },
  { id: 'heavy_rain', label: 'Heavy rain hours' },
  { id: 'snow', label: 'Snow hours' },
];

export default function Story({ model }) {
  const { theme } = useTheme();
  const byLine = useMemo(() => countsByLine(model), [model]);
  const all = useMemo(() => totalCounts(byLine), [byLine]);
  const closure = useMemo(() => closureStory(model), [model]);
  const storm = useMemo(() => stormStory(model), [model]);
  const gapEp = useMemo(() => longestEpisode(model, 'schedule_matching_gap'), [model]);
  const added = useMemo(() => addedByMonth(model), [model]);
  const curves = useMemo(() => hourlyCurves(model), [model]);
  const wb = useMemo(() => weatherBars(model), [model]);
  const open = (idx, line) => navigate(['explore'], { line, day: model.dayIso[idx] });

  // ---- chapter 1
  const exceptionRate = (l) => (l.total ? l.unusual / l.total : 0);
  const ranked = [...byLine].sort((a, b) => exceptionRate(b) - exceptionRate(a));
  const normalPct = all.total ? (all.counts.normal / all.total) * 100 : 0;
  const share = (t) => (all.unusual ? (all.counts[t] / all.unusual) * 100 : 0);

  // ---- chapter 2
  const closureOthers = useMemo(() => {
    if (!closure) return null;
    const vals = [];
    for (const id of model.routes) {
      if (id === closure.ep.route_id) continue;
      for (let i = closure.ep.startIdx; i <= closure.ep.endIdx; i++) {
        const v = model.byLine.get(id)[i]?.volume_vs_typical;
        if (v != null) vals.push(v);
      }
    }
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }, [closure, model]);

  // ---- chapter 5
  const rhythm = useMemo(() => rhythmFacts(curves), [curves]);

  // ---- chapter 6
  const dry = wb.dry ? wb.dry.sum / wb.dry.n : null;
  const wRows = WEATHER.map((w) => ({ ...w, value: wb[w.id] ? wb[w.id].sum / wb[w.id].n : null, n: wb[w.id]?.n || 0 }));
  const worstWeather = wRows.filter((r) => r.id !== 'dry' && r.value != null && dry != null).sort((a, b) => b.value - a.value)[0];

  const toc = [
    { id: 'normal', title: 'Most days were ordinary', line: `${pct0(normalPct)} of line-days had nothing unusual.` },
    closure && { id: 'closures', title: 'Planned work', line: `${n0(closure.closureEpisodes)} closures, the longest on the ${LINE_BY_ID[closure.ep.route_id].name} for ${n0(closure.ep.n_days)} days.` },
    storm && { id: 'storms', title: 'Snow and recovery', line: `${n1(storm.snow)}&nbsp;cm on ${fmtDay(model.calendar[storm.stormIdx])}; ${storm.affected.length ? `${storm.affected.length} lines broke down.` : 'no line broke down.'}` },
    { id: 'gaps', title: 'Trips outside the schedule', line: `${pct0((FACTS.tripKinds.added / (FACTS.tripKinds.added + FACTS.tripKinds.scheduled + FACTS.tripKinds.nonrevenue)) * 100)} of recorded stops belong to unmatched trips.` },
    rhythm && { id: 'rhythm', title: 'A normal day', line: `Long gaps swing from ${pct0(rhythm.lo.y)} to ${pct0(rhythm.hi.y)} through the day.` },
    { id: 'weather', title: 'Weather', line: worstWeather ? `${worstWeather.label} had ${pct0(worstWeather.value)} long gaps against ${pct0(dry)} when dry.` : 'How rain and snow compare.' },
    { id: 'trust', title: 'How far to trust it', line: `${n0(model.gaps.length)} days have no data at all.` },
  ].filter(Boolean);

  return (
    <div className="page story">
      <header className="hero">
        <h1 className="display">What happened on Boston’s subway this year, and why</h1>
        <p className="lede hero-lede">
          Every day on every line from {fmtMonthYear(model.start)} to {fmtMonthYear(model.end)}, sorted into ordinary days and exceptions. Below is the story the data tells, then the pipeline that produced it.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={() => scrollTo('normal')}>Read the story</button>
          <a className="btn" href={href(['explore'])}>Explore every day</a>
          <a className="btn" href={href(['report'])}>Read the report</a>
        </div>
      </header>

      <section className="hero-fig" aria-labelledby="cal-title">
        <div className="hero-fig-head">
          <h2 id="cal-title" className="hero-fig-title">Each square is one day on one line</h2>
          <p className="muted">Weeks run left to right, Monday at the top. Click a line to explore it.</p>
        </div>
        <div className="cal-grid">
          {model.routes.map((id) => {
            const l = LINE_BY_ID[id];
            const c = byLine.find((x) => x.id === id);
            return (
              <div key={id} className="cal-card">
                <button type="button" className="cal-card-head" onClick={() => navigate(['explore'], { line: id })}>
                  <Bullet line={l} size="sm" />
                  <span className="cal-card-name">{l.label}</span>
                  <span className="muted cal-card-note">{n0(c.unusual)} of {n0(c.total)} days were exceptions</span>
                </button>
                <CalendarHeat model={model} routeId={id} theme={theme} size="sm" intro tooltipFor={(r, i) => dayTip(model, r, i)} onSelect={(i) => open(i, id)} label={`${l.label}, one square per day`} />
              </div>
            );
          })}
        </div>
        <Legend metricId="type" theme={theme} />
      </section>

      <section className="toc-list" aria-label="In this story">
        <h2 className="toc-list-title">In this story</h2>
        <ol>
          {toc.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => scrollTo(t.id)}>
                <span className="toc-item-title">{t.title}</span>
                <span className="toc-item-line">{t.line}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- 1 ---------------- */}
      <section className="chapter" id="normal">
        <div className="chapter-text">
          <h2>Most days were ordinary. The exceptions are the story.</h2>
          <p>
            Counting one line on one day as a line-day, the data holds {n0(all.total)} of them. {pct0(normalPct)} were normal: trains ran at their usual volume, with gaps and arrival times in their usual range.
          </p>
          <p>
            The other {n0(all.unusual)} are exceptions. {ranked[0] && <>The {LINE_BY_ID[ranked[0].id].label} had the most ({pct0(exceptionRate(ranked[0]) * 100)} of its days) and the {LINE_BY_ID[ranked[ranked.length - 1].id].label} the fewest ({pct0(exceptionRate(ranked[ranked.length - 1]) * 100)}).</>}
          </p>
          <p>
            An exception is one of three kinds. A <strong>planned closure</strong> is a day covered by a long service-change alert. A <strong>disruption</strong> is a day when trains came far less often than scheduled. A <strong>schedule gap</strong> is a day when most trips could not be matched to the timetable even though trains ran normally. The Method page gives the exact rules.
          </p>
        </div>
        <Figure
          title="How each line’s days split"
          lede="What share of a line’s year was normal, and what share fell into each kind of exception?"
          guide="Each bar is one line’s year. Gray is normal days, violet is planned closures, pink is disruptions, and teal is schedule gaps. The percentage at the right is the share of days that were not normal."
          takeaway={`Planned closures make up ${pct0(share('planned_closure'))} of all exceptions, disruptions ${pct0(share('disruption'))}, and schedule gaps ${pct0(share('schedule_matching_gap'))}.`}
        >
          <StackedBars rows={byLine} />
        </Figure>
      </section>

      {/* ---------------- 2 ---------------- */}
      {closure && (
        <section className="chapter" id="closures">
          <div className="chapter-text">
            <h2>{share('planned_closure') >= Math.max(share('disruption'), share('schedule_matching_gap')) ? 'Planned work was the largest kind of exception' : 'Planned work shaped the year'}</h2>
            <p>
              {n0(closure.closureEpisodes)} planned closures add up to {n0(closure.totalDays)} line-days. The longest was on the {LINE_BY_ID[closure.ep.route_id].label}, {dateRange(closure.ep.start_date, closure.ep.end_date)}.
            </p>
            {closure.ep.closure_alert_header && <blockquote className="quote">{closure.ep.closure_alert_header}<cite>MBTA service alert</cite></blockquote>}
            <p>
              The alerts are how we know these days were planned. A service-change alert lasting 12 hours or more covers {pct0((FACTS.alertOverlap.withLongAlert / FACTS.alertOverlap.addedHeavyDays) * 100)} of the days when most trips were missing from the schedule, against {pct1((FACTS.alertOverlap.normalWithLongAlert / FACTS.alertOverlap.normalDays) * 100)} of normal days. That gap is the evidence that the closures are real and not a quirk of the records.
            </p>
          </div>
          <Figure
            title={`${LINE_BY_ID[closure.ep.route_id].label}: service level around its longest closure`}
            lede="How many trains ran each day, compared with a usual day for that line?"
            guide={`The colored line is the ${LINE_BY_ID[closure.ep.route_id].name}’s service level: 1.0 is a usual day, 0.5 is half the usual number of train stops. The gray lines are the other lines over the same days. The violet band marks the closure.`}
            takeaway={`During the closure the ${LINE_BY_ID[closure.ep.route_id].name} ran at ${times(closure.ep.avg_volume_vs_typical)} of its usual volume${closureOthers != null ? `, while the other lines averaged ${times(closureOthers)}` : ''}.`}
          >
            <Series
              series={closure.series.map((s, k, arr) => ({
                ...s,
                css: s.hero ? LINE_BY_ID[s.id].css : undefined,
                endLabel: s.hero ? LINE_BY_ID[s.id].name : k === arr.findIndex((q) => !q.hero) ? 'Other lines' : undefined,
              }))}
              xDomain={[closure.a, closure.b]}
              xTicks={Array.from({ length: Math.floor((closure.b - closure.a) / 7) + 1 }, (_, k) => ({ x: closure.a + k * 7, label: dateRange(model.dayIso[closure.a + k * 7], model.dayIso[closure.a + k * 7]).replace(/^\w+ /, '').replace(/, \d{4}$/, '') }))}
              yDomain={[0, 1.3]}
              yFormat={(v) => `${v.toFixed(1)}x`}
              bands={[{ from: closure.ep.startIdx, to: closure.ep.endIdx, type: 'closure', label: `Planned closure, ${closure.ep.n_days} days` }]}
              ariaLabel={`Service level of the ${LINE_BY_ID[closure.ep.route_id].label} compared with the other lines around its longest planned closure`}
              hoverContent={(x) => (
                <div className="tip-body">
                  <strong>{fmtDay(model.calendar[x])}</strong>
                  <div className="tip-line">{LINE_BY_ID[closure.ep.route_id].name}<b>{times(model.byLine.get(closure.ep.route_id)[x]?.volume_vs_typical)}</b></div>
                </div>
              )}
            />
          </Figure>
        </section>
      )}

      {/* ---------------- 3 ---------------- */}
      {storm && (
        <section className="chapter" id="storms">
          <div className="chapter-text">
            <h2>{Math.max(0, ...storm.affected.map((a) => a.daysToRecover || 0)) >= 3 ? 'After the heaviest snow, service took days to recover' : 'The heaviest snow broke service, briefly'}</h2>
            <p>
              The snowiest day of the year was {fmtDay(model.calendar[storm.stormIdx])}, with {n1(storm.snow)}&nbsp;cm.
              {storm.affected.length === 0
                ? ' No line’s gaps between trains crossed the 40% mark that flags a disruption in the week that followed.'
                : ` In the week around it, ${storm.affected.length === 1 ? 'one line' : `${storm.affected.length} lines`} saw at least 40% of their gaps run more than 1.5 times the schedule.`}
            </p>
            {storm.affected.length > 0 && (
              <table className="mini-table">
                <thead><tr><th scope="col">Line</th><th scope="col" className="num">Worst day</th><th scope="col" className="num">Usual</th><th scope="col" className="num">Back to normal</th></tr></thead>
                <tbody>
                  {storm.affected.map((a) => (
                    <tr key={a.id}>
                      <th scope="row"><span className="line-cell"><Bullet line={LINE_BY_ID[a.id]} size="sm" />{LINE_BY_ID[a.id].name}</span></th>
                      <td className="num">{pct0(a.peak)}</td>
                      <td className="num">{pct0(a.typical)}</td>
                      <td className="num">{a.daysToRecover == null ? 'not within the data' : `${a.daysToRecover} days after the snow`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p>
              “Back to normal” means two days in a row within 8 percentage points of the line’s usual level. It is a rule of thumb, not an official measure.
            </p>
          </div>
          <Figure
            title="Share of gaps between trains that ran long, around the snowiest day"
            lede="How badly did each line’s service thin out, and how long did it take to come back?"
            guide="Each colored line is one subway line. The vertical axis is the share of gaps between trains that were more than 1.5 times the scheduled gap on that day: higher is worse. The pale bars at the bottom are snowfall in centimeters. The dashed line at 40% is where a day counts as a disruption."
            takeaway={storm.affected[0] ? `${LINE_BY_ID[storm.affected[0].id].name} was hit hardest, with ${pct0(storm.affected[0].peak)} of gaps running long against ${pct0(storm.affected[0].typical)} on a usual day.` : 'No line crossed the disruption threshold.'}
          >
            <Series
              series={storm.series.map((s) => ({ ...s, css: LINE_BY_ID[s.id].css, endLabel: LINE_BY_ID[s.id].name }))}
              xDomain={[storm.a, storm.b]}
              xTicks={Array.from({ length: Math.floor((storm.b - storm.a) / 3) + 1 }, (_, k) => ({ x: storm.a + k * 3, label: dateRange(model.dayIso[storm.a + k * 3], model.dayIso[storm.a + k * 3]).replace(/^\w+ /, '').replace(/, \d{4}$/, '') }))}
              yDomain={[0, 100]}
              yFormat={(v) => `${v}%`}
              thresholds={[{ y: 40, label: '40% flags a disruption' }]}
              bars={{ points: storm.bars, format: (v) => `${n1(v)}\u00a0cm`, max: storm.snow }}
              marks={[{ x: storm.stormIdx, label: 'Snowiest day', dy: 14 }]}
              ariaLabel="Share of long gaps for the lines most affected by the heaviest snowfall, with snowfall bars"
              hoverContent={(x) => (
                <div className="tip-body">
                  <strong>{fmtDay(model.calendar[x])}</strong>
                  {storm.affected.map((a) => <div key={a.id} className="tip-line">{LINE_BY_ID[a.id].name}<b>{pct0(model.byLine.get(a.id)[x]?.pct_headways_over_1_5x)}</b></div>)}
                  <div className="tip-line">Snow<b>{n1(storm.bars.find((b) => b.x === x)?.v ?? 0)} cm</b></div>
                </div>
              )}
            />
          </Figure>
        </section>
      )}

      {/* ---------------- 4 ---------------- */}
      <section className="chapter" id="gaps">
        <div className="chapter-text">
          <h2>Nearly half of all trips are missing from the published schedule</h2>
          <p>
            The MBTA’s records tag each train trip. Roughly {pct0((FACTS.trips.added / (FACTS.trips.added + FACTS.trips.scheduled + FACTS.trips.nonrevenue)) * 100)} of trips are tagged <strong>ADDED</strong>: trains running that no published timetable lists. Because those trips are short, they account for {pct0((FACTS.tripKinds.added / (FACTS.tripKinds.added + FACTS.tripKinds.scheduled + FACTS.tripKinds.nonrevenue)) * 100)} of recorded stops.
          </p>
          <p>
            There are two very different reasons. During long closures the MBTA runs temporary patterns that no timetable describes, so the share of added trips jumps. And on some days, mostly weekends, nearly every trip is tagged added while trains run at a normal level. We call those <strong>schedule gaps</strong> and treat them as a record-keeping artifact, not a service problem.
          </p>
          <p>
            Why it matters: you cannot say whether a train was late if you cannot say which scheduled train it was. That is why the main measure on this site, long gaps, does not depend on the timetable at all.
          </p>
        </div>
        <div className="chapter-figs">
          <Figure
            title="Share of trips not in the schedule, by line and month"
            lede="When and where did unmatched trips pile up?"
            guide="Each row is a line and each column a month. The number in a cell is the average share of that month’s trips that were not in the published schedule. Warmer colors mean more."
            takeaway={(() => {
              let best = null;
              added.rows.forEach((r) => r.cells.forEach((v, k) => { if (v != null && (!best || v > best.v)) best = { v, id: r.id, k }; }));
              return best ? `The peak was the ${LINE_BY_ID[best.id].label} in ${fmtMonthYear(added.months[best.k].date)}, when ${pct0(best.v)} of trips were unmatched.` : '';
            })()}
          >
            <HeatTable table={added} theme={theme} />
          </Figure>
          {gapEp && (
            <Figure
              title="What a schedule gap looks like"
              lede={`${LINE_BY_ID[gapEp.route_id].label}, ${dateRange(gapEp.start_date, gapEp.end_date)}`}
              guide="One square per day. The outlined block is the schedule gap: teal squares are days when most trips could not be matched to the timetable. Click a square to read that day."
              takeaway={`For ${n0(gapEp.n_days)} days about ${pct0(gapEp.avg_pct_added)} of trips were unmatched, yet the line ran at ${times(gapEp.avg_volume_vs_typical)} of its usual volume. Trains were running; the records just did not match.`}
            >
              <CalendarHeat model={model} routeId={gapEp.route_id} theme={theme} size="lg" tooltipFor={(r, i) => dayTip(model, r, i)} onSelect={(i) => open(i, gapEp.route_id)} marks={[{ from: gapEp.startIdx, to: gapEp.endIdx, label: `${n0(gapEp.n_days)} days of unmatched trips` }]} />
            </Figure>
          )}
        </div>
      </section>

      {/* ---------------- 5 ---------------- */}
      {rhythm && (
        <section className="chapter" id="rhythm">
          <div className="chapter-text">
            <h2>Long gaps are not spread evenly through the day</h2>
            <p>
              Looking only at dry weekdays, so that weather and closures do not blur the picture, the {rhythm.c.label} had the most long gaps around {hourLabel(rhythm.hi.x)} ({pct0(rhythm.hi.y)}) and the fewest around {hourLabel(rhythm.lo.x)} ({pct0(rhythm.lo.y)}).
            </p>
            {rhythm.overnight && rhythm.dayHi && (
              <p>
                Be careful with that peak. {hourLabel(rhythm.hi.x)} is outside the hours when most trains run. It holds only {n0(rhythm.hiN)} of the {rhythm.c.label}’s {n0(rhythm.total)} weekday observations ({rhythm.hiShare < 0.1 ? 'under 0.1%' : pct1(rhythm.hiShare)}), so it rests on few trains. Between 6 am and 10 pm the highest was {pct0(rhythm.dayHi.y)}, around {hourLabel(rhythm.dayHi.x)}.
              </p>
            )}
            <p>
              For trains that can be matched to the schedule, the typical arrival was about a minute late ({FACTS.schedule.medianSec} seconds at the median), and half of all arrivals landed within {Math.round(FACTS.schedule.medianAbsSec / 60)} minutes of the timetable. Across {n0(FACTS.schedule.comparableEvents)} arrivals, the slowest 5% were more than {n0(Math.round(FACTS.schedule.p95Min))} minutes late.
            </p>
          </div>
          <Figure
            title="Long gaps by hour of the day, dry weekdays"
            lede="At what times of day do trains come least often relative to the schedule?"
            guide="Each line is one subway line (the four Green branches are combined). The horizontal axis is the hour of the day. The vertical axis is the share of gaps between trains that were more than 1.5 times the scheduled gap: higher means riders waited longer than planned. Hours with very few trains are left out."
            takeaway={rhythm.overnight && rhythm.dayHi ? `During service hours the ${rhythm.c.label} ranges from ${pct0(rhythm.dayLo.y)} to ${pct0(rhythm.dayHi.y)}. The overnight spike to ${pct0(rhythm.hi.y)} rests on few trains.` : `The swing is largest on the ${rhythm.c.label}: from ${pct0(rhythm.lo.y)} to ${pct0(rhythm.hi.y)} across the day.`}
          >
            <Series
              series={curves.map((c) => ({ id: c.id, label: c.label, css: c.css, hero: true, endLabel: c.label, points: c.points.map((p) => ({ x: p.x, y: p.y })) }))}
              xDomain={[0, 23]}
              xTicks={[0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({ x: h, label: hourLabel(h) }))}
              yDomain={[0, Math.max(40, Math.ceil(Math.max(...curves.flatMap((c) => c.points.map((p) => p.y))) / 10) * 10)]}
              yFormat={(v) => `${v}%`}
              ariaLabel="Share of long gaps by hour of day for each line on dry weekdays"
              hoverContent={(x) => (
                <div className="tip-body">
                  <strong>{hourLabel(x)}</strong>
                  {curves.map((c) => { const p = c.points.find((q) => q.x === x); return <div key={c.id} className="tip-line">{c.label}<b>{p ? pct0(p.y) : 'too few trains'}</b></div>; })}
                </div>
              )}
            />
          </Figure>
        </section>
      )}

      {/* ---------------- 6 ---------------- */}
      <section className="chapter" id="weather">
        <div className="chapter-text">
          <h2>What rain and snow do to the gaps between trains</h2>
          <p>
            Every hour of train activity is matched to the weather in Boston for that hour. About {pct0(FACTS.weather.dry)} of hours were dry, {pct0(FACTS.weather.rain)} had rain, {pct0(FACTS.weather.heavyRain)} heavy rain, and {pct0(FACTS.weather.snow)} snow.
          </p>
          {worstWeather && dry != null && (
            <p>
              Compared with dry hours, {worstWeather.label.toLowerCase()} had the largest change: {pct0(worstWeather.value)} of gaps ran long against {pct0(dry)} when dry, {Math.abs(worstWeather.value - dry) < 0.5 ? 'no real difference' : `${n1(Math.abs(worstWeather.value - dry))} percentage points ${worstWeather.value > dry ? 'more' : 'fewer'}`}.
            </p>
          )}
          <p>
            Read this carefully. Snow only falls in winter and rain clusters in certain seasons, so each kind of weather also carries its own mix of schedules, closures, and crowds. The comparison describes a pattern. It does not prove that weather caused it. The Weather page breaks it down by hour of day.
          </p>
        </div>
        <Figure
          title="Share of gaps that ran long, by kind of weather"
          lede="Do the gaps between trains grow when it rains or snows?"
          guide="Each bar is one kind of weather. The length shows the share of gaps between trains that were more than 1.5 times the scheduled gap. The numbers at the right say how much data stands behind each bar: more observations mean a more reliable bar."
          takeaway={worstWeather && dry != null ? `${worstWeather.label} are ${worstWeather.value > dry ? 'worse' : 'better'} than dry hours by ${n1(Math.abs(worstWeather.value - dry))} points, based on ${n0(worstWeather.n)} observations.` : ''}
        >
          <ul className="bars">
            {wRows.map((r) => (
              <li key={r.id} className="bar-row simple">
                <span className="bar-name">{r.label}</span>
                <span className="bar-track"><i style={{ width: `${Math.min(100, ((r.value ?? 0) / Math.max(40, ...wRows.map((x) => x.value || 0))) * 100)}%` }} /></span>
                <span className="bar-val num">{r.value == null ? 'no data' : pct0(r.value)}</span>
                <span className="bar-n num muted">{n0(r.n)} observations</span>
              </li>
            ))}
          </ul>
          <p className="fig-link"><a className="link" href={href(['weather'])}>See the hour-by-hour grid on the Weather page</a></p>
        </Figure>
      </section>

      {/* ---------------- 7 ---------------- */}
      <section className="chapter" id="trust">
        <div className="chapter-text">
          <h2>How far to trust these numbers</h2>
          <p>
            Far enough to see the shape of the year, with five things in mind. None of them changes the story above, and all of them are written down in full on the Method page.
          </p>
          <p>
            Where the pipeline made a judgment call, it kept the evidence: a check that fails loudly, a count of what was affected, and the reason for the choice.
          </p>
          <p>
            <a className="link" href={href(['method'])}>Read how it was built and checked</a>
          </p>
        </div>
        <Figure title="What to keep in mind" lede="The five places the data is weaker than it looks.">
          <ul className="trust-list">
            <li><strong>{n0(model.gaps.length)} days have no data.</strong> The MBTA published an empty file for {FACTS.files.empty} of them and nothing for {FACTS.files.unpublished}. They show as hatched squares, never as zeros.</li>
            <li><strong>About {pct0((FACTS.raw.duplicateRowsFlagged / FACTS.raw.stopEvents) * 100)} of records appeared twice.</strong> Mostly on the shared Green Line trunk. We keep the copy on the trip’s own line.</li>
            <li><strong>Non-passenger trains are excluded.</strong> {n0(FACTS.trips.nonrevenue)} trips ran with no passengers, mostly at dawn. Left in, they looked like trains running 9 to 18 hours early.</li>
            <li><strong>{pct0((FACTS.tripKinds.added / (FACTS.tripKinds.added + FACTS.tripKinds.scheduled + FACTS.tripKinds.nonrevenue)) * 100)} of stops cannot be compared with the schedule,</strong> so measures that need the timetable are reported only for matched trains.</li>
            <li><strong>One weather reading stands in for the whole network.</strong> It comes from a weather model, not a platform sensor.</li>
          </ul>
        </Figure>
      </section>

      <section className="closing">
        <h2>Keep going</h2>
        <div className="closing-grid">
          <a className="closing-link" href={href(['explore'])}><strong>Explore every day</strong><span>Pick a line, pick a day, read what happened.</span></a>
          <a className="closing-link" href={href(['report'])}><strong>Read the report</strong><span>The full analysis, with the evidence behind each claim.</span></a>
          <a className="closing-link" href={href(['method'])}><strong>See how it was built</strong><span>Every step of the pipeline, the decisions, and the checks.</span></a>
        </div>
      </section>
    </div>
  );
}
