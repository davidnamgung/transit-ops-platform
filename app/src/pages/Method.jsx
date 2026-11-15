import { CHECKS, FACTS, MODELS } from '../lib/facts.js';
import { DAY_TYPES, DAY_TYPE_ORDER } from '../lib/constants.js';
import { fmtDay, n0, pct0, pct1 } from '../lib/format.js';
import { DayTypeTag } from '../components/Bullet.jsx';
import PipelineDiagram from '../components/PipelineDiagram.jsx';
import Toc from '../components/Toc.jsx';

const SECTIONS = [
  { id: 'overview', label: 'The pipeline at a glance' },
  { id: 'sources', label: 'Data sources' },
  { id: 'ingestion', label: 'Ingestion' },
  { id: 'warehouse', label: 'The warehouse' },
  { id: 'decisions', label: 'Decisions and discoveries' },
  { id: 'checks', label: 'Checks' },
  { id: 'metrics', label: 'The measures' },
  { id: 'labels', label: 'How a day gets its label' },
  { id: 'repro', label: 'Reproducibility' },
  { id: 'app', label: 'How this site works' },
  { id: 'predictions', label: 'Predictions' },
  { id: 'next', label: 'Limits and what comes next' },
  { id: 'credits', label: 'Credits' },
];

function Entry({ title, noticed, evidence, did }) {
  return (
    <article className="entry">
      <h3>{title}</h3>
      <dl className="entry-grid">
        <div><dt>What we noticed</dt><dd>{noticed}</dd></div>
        <div><dt>The evidence</dt><dd>{evidence}</dd></div>
        <div><dt>What we did</dt><dd>{did}</dd></div>
      </dl>
    </article>
  );
}

export default function Method({ model }) {
  return (
    <div className="page doc-page">
      <header className="page-head">
        <h1 className="display-m">How it was built, step by step</h1>
        <p className="lede">Every stage of the pipeline, every judgment call, and every check, with the evidence for each. Written so someone could rebuild it or disagree with it.</p>
      </header>

      <div className="doc">
        <aside className="doc-aside"><Toc items={SECTIONS} /></aside>
        <article className="doc-body">

          <section id="overview" className="doc-section">
            <h2>The pipeline at a glance</h2>
            <p>
              Scripts download public files. A database cleans, joins, and judges them in layers. Checks test every layer. Four small files carry the results to this site, which does the rest in your browser.
            </p>
            <PipelineDiagram />
            <h3>Four rules the pipeline follows</h3>
            <ul className="plain">
              <li><strong>Raw data is never edited.</strong> Every downloaded file is kept exactly as received, so any later step can be redone.</li>
              <li><strong>Every step can be rerun.</strong> Running a script twice gives the same result as running it once.</li>
              <li><strong>Every judgment call is recorded.</strong> Where a rule excludes or relabels data, the count affected and the reason are written down, and the data is flagged, not deleted.</li>
              <li><strong>Checks fail loudly.</strong> A check that finds a problem stops the run with a non-zero exit code, so an automated job cannot quietly continue.</li>
            </ul>
          </section>

          <section id="sources" className="doc-section">
            <h2>Data sources</h2>
            <p>Four public sources feed the pipeline. All of them were explored on their own, reading the actual column names, before anything was built on them.</p>
            <div className="table-scroll">
              <table className="data-table wide-table">
                <thead><tr><th scope="col">Source</th><th scope="col">What it is</th><th scope="col">Size in this build</th><th scope="col">Watch out for</th></tr></thead>
                <tbody>
                  <tr><th scope="row">MBTA trip records</th><td>One Parquet file per service day from the MBTA’s performance data project. One row per train at one stop on one trip, with 29 columns: times, durations, scheduled times, route, direction, vehicle.</td><td>{n0(FACTS.raw.stopEvents)} rows, about 1.8 MB a day</td><td>Times are stored three different ways. {FACTS.files.empty} days are empty files and {FACTS.files.unpublished} is not published.</td></tr>
                  <tr><th scope="row">MBTA service alerts</th><td>The MBTA’s alert history, one Parquet file. One row per alert, per version of the alert, per affected stop or route.</td><td>{n0(FACTS.alerts.rawRows)} rows, {n0(FACTS.alerts.distinct)} distinct alerts, 134 MB</td><td>The newest version of an alert is a closing record without its start and end. Severity is reset to zero in it. End times are repeatedly extended estimates.</td></tr>
                  <tr><th scope="row">Open-Meteo weather</th><td>Hourly temperature, precipitation, snowfall, wind, and gusts for central Boston from a free weather archive.</td><td>{n0(FACTS.weather.hours)} hours, 365 days times 24</td><td>Model-based reanalysis, not a sensor on a platform. One point for the whole network. Free for non-commercial use.</td></tr>
                  <tr><th scope="row">MBTA station list</th><td>Names and coordinates of every station on each subway line, from the MBTA’s public API.</td><td>{FACTS.stations} stations</td><td>Used for the map and for labeling. Requires a free API key, which is kept out of the repository.</td></tr>
                </tbody>
              </table>
            </div>
            <p className="fine">The MBTA data is used under the MassDOT Developers License Agreement. This project is independent and not affiliated with the MBTA.</p>
          </section>

          <section id="ingestion" className="doc-section">
            <h2>Ingestion</h2>
            <h3>Look before you build</h3>
            <p>
              Three exploration scripts came first: one call to the live API, one pass over each endpoint and the weather service, and one download of a single day of history with its full schema printed. Reading the schema first is what exposed the three time formats and the structure of the data. No column was assumed.
            </p>
            <h3>The bulk download script</h3>
            <p>It downloads one file per day for 365 days, and is built to survive the real world:</p>
            <ol className="steps">
              <li><strong>It skips what it has.</strong> A complete file is never downloaded again, so an interrupted run resumes where it stopped.</li>
              <li><strong>It writes safely.</strong> Each file is saved under a temporary name and renamed only when complete, so a dropped connection never leaves a half-file that looks finished.</li>
              <li><strong>It retries politely.</strong> Failures are retried after 2, 4, and 8 seconds, with a pause between requests and a size limit of 500 MB per file.</li>
              <li><strong>It tells “not published” from “failed”.</strong> The MBTA’s server answers 403 or 404 for a date that does not exist. Those are recorded as gaps. Anything else is a failure to retry.</li>
              <li><strong>It does not trust tiny files.</strong> Files under 10 KB are placeholders with zero rows. They are re-requested on every run in case real data appears later, and reported by name.</li>
              <li><strong>It warns when the gaps look wrong.</strong> More than 20 missing files in one run triggers a warning, because that pattern would suggest the server is blocking the download.</li>
            </ol>
            <h3>The other downloads</h3>
            <p>
              The weather download checks its own result: it expects exactly 365 times 24 hours, requests UTC so the timestamps follow the project rule, and prints missing values per column. The alert and station downloads reuse the same safe-download helper. The alert file is inspected on download, printing its schema and a sample row.
            </p>
            <h3>Secrets</h3>
            <p>
              The MBTA API key lives in a file that git ignores. Before the repository was published, a search of every commit for the key’s value, printing file names only and never the key, confirmed it had never been committed.
            </p>
          </section>

          <section id="warehouse" className="doc-section">
            <h2>The warehouse</h2>
            <p>
              The warehouse is a single DuckDB file, about {n0(FACTS.build.megabytes)} MB, rebuilt from the raw files on every run in about {FACTS.build.seconds} seconds. Rebuilding from scratch, instead of patching, is what makes every table reproducible. It has {FACTS.build.tables} tables in three layers.
            </p>
            <ul className="plain">
              <li><strong>Staging</strong> cleans one source at a time: real timestamps, consistent names, flags. It makes no judgments about service.</li>
              <li><strong>Intermediate</strong> joins sources and applies the rules that decide what can be compared with what.</li>
              <li><strong>Marts</strong> are small tables that answer questions. They are what this site reads.</li>
            </ul>
            <div className="table-scroll">
              <table className="data-table wide-table">
                <thead><tr><th scope="col">Layer</th><th scope="col">Table</th><th scope="col">One row is</th><th scope="col">What it does</th></tr></thead>
                <tbody>
                  {MODELS.map((m) => (
                    <tr key={m.name}><td><span className={`layer layer-${m.layer}`}>{m.layer}</span></td><th scope="row"><code>{m.name}</code></th><td>{m.grain}</td><td>{m.does}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Details that matter</h3>
            <ul className="plain">
              <li><strong>Build order.</strong> Files build alphabetically within a layer, so a table that depends on another is named to sort after it. This works but is fragile, and it is the main reason to move the project to dbt, which works out the order itself.</li>
              <li><strong>Fail early.</strong> The build refuses to start if a layer’s folder has no SQL files, and prints a clear message if another program has the database open.</li>
              <li><strong>Timezones.</strong> The build always runs in UTC. Boston time is derived for display only. Two days a year change the clocks, which was checked directly (see decisions).</li>
            </ul>
          </section>

          <section id="decisions" className="doc-section">
            <h2>Decisions and discoveries</h2>
            <p>
              Most of the real work was finding out what the data actually was. This is the lab notebook: twelve things that were wrong, odd, or ambiguous, how each was discovered, and what was done.
            </p>
            <Entry
              title="Three time formats in one file"
              noticed="Actual times were Unix seconds, scheduled times were seconds after midnight, and the service date was an integer like 20261104."
              evidence="Seen directly in the schema and a sample row."
              did="Converted everything to real timestamps in UTC, with a Boston-time column for display and a true date for the service day."
            />
            <Entry
              title="The service day runs past midnight"
              noticed="A schedule requested for one date began with trains at 12:18 a.m. the next calendar day."
              evidence="The first rows of a schedule query were stamped after midnight."
              did="Every event carries its service date, and weekday or weekend is decided by service date, so a 1 a.m. train after a Saturday counts as Saturday service."
            />
            <Entry
              title="Empty and missing files"
              noticed={`${FACTS.files.empty + FACTS.files.unpublished} of 365 days had no rows in the warehouse.`}
              evidence={`${FACTS.files.empty} files existed on disk at about 3 KB with zero rows. One date (${FACTS.files.unpublishedDate}) returned an HTTP 403. The index file listed 16 of the 17.`}
              did="Treated 403 and 404 as “not published”, re-request empty placeholders every run, and show all 17 days as hatched gaps. They are never filled with zeros."
            />
            <Entry
              title="Non-passenger trips"
              noticed="About 9% of events seemed to sit more than 3 hours from their scheduled time, mostly before 7 a.m. on the Red and Orange Lines."
              evidence={`Sampled trips all had IDs starting “NONREV”, ran the full line, and were matched to times 9 to 18 hours off. Of ${n0(FACTS.nonrev.oldExclusions)} events excluded by a 3-hour cutoff, ${n0(FACTS.nonrev.nonrevExclusions)} (${FACTS.nonrev.shareOfOldExclusions}%) were on these ${n0(FACTS.trips.nonrevenue)} trips.`}
              did="Added a trip kind: scheduled, ADDED, or non-revenue. Non-revenue trips are excluded from schedule comparison and from the gap measure. The blunt cutoff became a 12-hour sanity limit that removes only 147 events."
            />
            <Entry
              title="Nearly half of trips are not in the schedule"
              noticed={`${n0(FACTS.trips.added)} of ${n0(FACTS.trips.scheduled + FACTS.trips.added + FACTS.trips.nonrevenue)} trips carry an ADDED tag.`}
              evidence={`The share comes in surges that line up with closures. Of ${FACTS.alertOverlap.addedHeavyDays} line-days where 90% or more of events were ADDED, ${FACTS.alertOverlap.withLongAlert} overlapped a long service-change alert, against ${FACTS.alertOverlap.normalWithLongAlert} of ${FACTS.alertOverlap.normalDays} normal days.`}
              did="Kept ADDED trips in the data and in the gap measure, excluded them from timetable comparison, and labeled normal-volume days with mostly ADDED trips as schedule gaps."
            />
            <Entry
              title="Duplicate records"
              noticed={`${n0(FACTS.raw.duplicateGroups)} groups of rows shared a trip, a stop position, and a day.`}
              evidence={`${n0(FACTS.raw.duplicateGroupsSpanningRoutes)} of them spanned two Green Line branches: on the shared trunk the same train is recorded under several branches. The first rule, keeping the alphabetically first route, kept the trip’s real route only 54% of the time.`}
              did={`Keep the row on the route that holds most of the trip’s records, which is right ${pct0(FACTS.raw.keptMainRoutePct)} of the time. Other duplicates keep the earliest row. ${n0(FACTS.raw.duplicateRowsFlagged)} rows (${pct0((FACTS.raw.duplicateRowsFlagged / FACTS.raw.stopEvents) * 100)}) are flagged and set aside, not deleted.`}
            />
            <Entry
              title="Alerts are stored in versions"
              noticed={`${n0(FACTS.alerts.rawRows)} rows for ${n0(FACTS.alerts.distinct)} alerts, and a first attempt kept almost none of the alerts that had start times.`}
              evidence="Looking at every version of four known alerts showed that the newest version is a closing record: only 0.2% of newest versions carry a start time, against 99.9% of older ones. It also resets severity to zero. End times were extended repeatedly."
              did="Rebuild each alert from all of its versions: latest text, union of routes, earliest start, latest end, earlier of the end and the closing time, peak severity. A test asserts that three known alerts appear with the right values."
            />
            <Entry
              title="Is the stop time an arrival or a departure?"
              noticed="The documentation could not be reached, and the column name does not say."
              evidence="Dwell time equals the next row’s departure minus this row’s stop time for 99.9% of stops. Travel time equals stop time minus the previous departure for 100%. The alternative reading matches 8%. Median dwell is 48 seconds, a realistic subway dwell."
              did="Treat the stop time as the arrival time. The late-arrival measure is therefore arrival minus scheduled arrival. The test is kept as a script so it can be rerun."
            />
            <Entry
              title="Daylight saving"
              noticed="Scheduled times are seconds after midnight, which the clock change could shift by an hour on two days a year."
              evidence="The median difference from schedule on the two clock-change Sundays was −0.27 and +0.75 minutes, against a typical Sunday of 0.3. A conversion error would show about 60 minutes."
              did="No change needed. The check stays in the investigation notebooks."
            />
            <Entry
              title="Results that changed between identical rebuilds"
              noticed="A warning count read 264, then 263, then 265 across rebuilds of the same data."
              evidence="Two duplicate rows tied on every column used to choose between them, so the database could keep either. Checksums of the daily table differed between builds while totals matched."
              did="Made the tie-break complete, so no two duplicates can tie. Added a fingerprint script. Repeated rebuilds now give identical checksums."
            />
            <Entry
              title="Why the headline measure ignores the timetable"
              noticed="On the worst storm days the late-arrival figure reached more than 100 minutes at the median."
              evidence="The alerts spoke of delays of 10 to 30 minutes, while the share of long gaps on the same days was above 80%. When trips are cut, trains get matched to the wrong scheduled trip."
              did="Made the share of long gaps the main measure, since it compares gaps between trains with scheduled gaps and does not need trips to match. Late arrivals are reported, with a warning on disruption days."
            />
            <Entry
              title="Label thresholds"
              noticed="Any rule for “unusual” needs numbers."
              evidence="Gaps above 40% sit above every line’s 95th percentile of normal days. Per-line medians range from about 6% (Mattapan) to about 23% (Green D)."
              did="Used one set of thresholds for all lines, documented them, and listed the weakness: a per-line threshold would catch more Orange Line disruptions and fewer Green D false alarms."
            />
          </section>

          <section id="checks" className="doc-section">
            <h2>Checks</h2>
            <p>
              Six scripts guard the pipeline. Each prints PASS, WARN, or FAIL. A WARN means look into it. A FAIL ends the run with a non-zero exit code. Checks are written as ranges where exact zero would be unrealistic, because a test that is always red gets ignored.
            </p>
            <div className="table-scroll">
              <table className="data-table wide-table">
                <thead><tr><th scope="col">Script</th><th scope="col">Guards</th><th scope="col">What it tests</th></tr></thead>
                <tbody>{CHECKS.map((c) => <tr key={c.script}><th scope="row"><code>{c.script}</code></th><td>{c.guards}</td><td>{c.tests}</td></tr>)}</tbody>
              </table>
            </div>
            <p>
              <strong>Known-answer tests.</strong> Several checks assert something already known to be true, such as three alerts verified by eye. They exist because a first alert model kept 99% fewer alerts than it should have, and every structural check still passed. Only a test against a known fact could have caught it.
            </p>
          </section>

          <section id="metrics" className="doc-section">
            <h2>The measures</h2>
            <dl className="defs">
              <div><dt>Service level</dt><dd>Stop events recorded for a line on a day, divided by the median for that line on the same kind of day (weekday or weekend). 1.0 is usual.</dd></div>
              <div><dt>Share of long gaps</dt><dd>Each stop event carries the time since the previous train (the gap) and the scheduled gap. A gap is long if it is more than 1.5 times the scheduled gap. The measure is the share of long gaps among observations that have both. Non-revenue trains are excluded because passengers cannot board them.</dd></div>
              <div><dt>Late arrivals</dt><dd>Actual arrival minus scheduled arrival in seconds, for scheduled trips only and when the difference is 12 hours or less. Reported as the 90th percentile (how late the slowest 10% were), the median, and the share within 5 minutes.</dd></div>
              <div><dt>Share of trips not in the schedule</dt><dd>ADDED stop events divided by all kept stop events for a line on a day.</dd></div>
              <div><dt>Weather category</dt><dd>Snow if at least 0.1 cm of snowfall fell in the hour, heavy rain if 2.5 mm or more, rain if 0.1 mm or more, otherwise dry.</dd></div>
              <div><dt>Recent snow and rain</dt><dd>Rolling totals over the previous 24 and 72 hours. They stay empty until a full window of history exists, so the first days are never undercounted.</dd></div>
            </dl>
          </section>

          <section id="labels" className="doc-section">
            <h2>How a day gets its label</h2>
            <p>Each line on each day gets one label. The first rule that fits wins.</p>
            <dl className="defs">
              {DAY_TYPE_ORDER.filter((t) => t !== 'normal').map((t) => (
                <div key={t}><dt><DayTypeTag type={t} /></dt><dd>{DAY_TYPES[t].long}</dd></div>
              ))}
              <div><dt><DayTypeTag type="normal" /></dt><dd>Anything else.</dd></div>
            </dl>
            <h3>Alerts are sorted into kinds first</h3>
            <p>
              A service alert is a closure or diversion if its effect type says so, and long if it lasted at least 12 hours. Alerts about a single stop being skipped are separated out, because they last weeks and do not stop a line. Elevator and parking notices are set aside. Alerts mentioning delays carry the announced minutes. The rest are sorted by keywords in the headline. The effect type alone is unreliable: delays are filed as “other”, and a parking notice once had the highest severity.
            </p>
            <h3>Episodes</h3>
            <p>
              An episode is a run of consecutive days of the same unusual label on one line. Episodes are built by subtracting a running day count from the date, which gives the same value for every day in an unbroken run. A missing day ends an episode.
            </p>
            <h3>What validates the labels</h3>
            <p>
              The labels are checked against the alert text and against each other: closures overlap long alerts on {pct0((FACTS.alertOverlap.withLongAlert / FACTS.alertOverlap.addedHeavyDays) * 100)} of days with mostly unmatched trips, against {pct1((FACTS.alertOverlap.normalWithLongAlert / FACTS.alertOverlap.normalDays) * 100)} of normal days, and days with more delay alerts show more long gaps (see the report).
            </p>
          </section>

          <section id="repro" className="doc-section">
            <h2>Reproducibility</h2>
            <ul className="plain">
              <li><strong>Pinned versions.</strong> Python and JavaScript dependencies are locked to exact versions, because two library upgrades during the project broke working code.</li>
              <li><strong>A fingerprint.</strong> One script prints row counts and md5 checksums of the main tables. After any rebuild the checksums must match, which proves the results did not change.</li>
              <li><strong>A thread-count test.</strong> The build accepts a setting to run on a single thread, to check that results do not depend on how many processor cores the machine has. The same check will run on the automation server.</li>
              <li><strong>One command each.</strong> Download, build, check, and export are single commands, run from the project root.</li>
            </ul>
          </section>

          <section id="app" className="doc-section">
            <h2>How this site works</h2>
            <p>
              The export step writes four small JSON files, about 2.2 MB in all: one row per line and day, the episodes, the hourly weather table, and the stations. The site loads them once and does everything else in your browser: coloring the calendars, filtering, the weather grid, search.
            </p>
            <ul className="plain">
              <li><strong>No server.</strong> The built site is plain files and can be hosted anywhere free.</li>
              <li><strong>Every view is a link.</strong> The address records the line, day, and measure, so a view can be shared.</li>
              <li><strong>It checks its own data.</strong> On load it verifies the files and names any missing file or column, all at once.</li>
              <li><strong>The sentences are computed.</strong> Claims in the story, such as which closure was longest or which line recovered last, are calculated from the data, so they update when the data does. Figures that come from pipeline runs rather than the exported files (row counts, duplicate counts) live in one file and are labeled with the build they describe.</li>
              <li><strong>Accessibility.</strong> Every control works from the keyboard. Charts have text equivalents: the day table and the episode table list the same information as the calendars and the timeline. Color is never the only signal.</li>
            </ul>
          </section>

          <section id="predictions" className="doc-section">
            <h2>Predictions</h2>
            <p className="callout"><strong>Status: not built.</strong> The project has no forecasting model yet. The plan, with the target, the baseline it must beat, the evaluation, and the risks, is written out in full in the Report. The groundwork exists: weather features with 24- and 72-hour memory, alert kinds, and a measure that survives disruptions.</p>
          </section>

          <section id="next" className="doc-section">
            <h2>Limits and what comes next</h2>
            <ol className="steps">
              <li><strong>Automation.</strong> Scheduled downloads, rebuilds, and checks on a free runner, with alerts when something fails and the fingerprint compared with a stored baseline.</li>
              <li><strong>A platform health page</strong> showing pipeline uptime, data freshness, check results, and incidents.</li>
              <li><strong>Moving to dbt</strong> so the build order, tests, and documentation are generated, after a short compatibility test with this DuckDB version.</li>
              <li><strong>Forecasting</strong> as planned, scored against its baseline.</li>
              <li><strong>Per-station results,</strong> which need a new table and a way to attribute delays to places.</li>
              <li><strong>A comparison with the MBTA’s own published performance figures,</strong> to confirm the measures agree in direction and size.</li>
              <li><strong>Per-line thresholds</strong> for the day labels, and a within-line version of the alert test.</li>
            </ol>
            <h3>Days with no data</h3>
            {model.gaps.length === 0 ? <p>None.</p> : (
              <ul className="gap-list">{model.gaps.map((d) => <li key={d}>{fmtDay(new Date(`${d}T00:00:00Z`))}</li>)}</ul>
            )}
          </section>

          <section id="credits" className="doc-section">
            <h2>Credits</h2>
            <p>
              Train performance and alert data: Massachusetts Bay Transportation Authority, used under the MassDOT Developers License Agreement. Weather data: Open-Meteo.com. This project is independent and is not affiliated with or endorsed by the MBTA.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
