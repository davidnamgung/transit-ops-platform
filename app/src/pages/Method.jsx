import { DAY_TYPES, DAY_TYPE_ORDER } from '../lib/constants.js';
import { fmtDay, n0, plural } from '../lib/format.js';
import { DayTypeTag } from '../components/Bullet.jsx';

export default function Method({ model }) {
  const dataDays = model.nDays - model.gaps.length;
  return (
    <div className="page method">
      <header className="page-head">
        <h1>How to read this, and what to doubt</h1>
        <p className="lede">
          Every number here comes from public MBTA data. This page explains where it comes from, how each day is labeled, and where the data is weaker than it looks.
        </p>
      </header>

      <div className="prose">
        <section>
          <h2>Where the data comes from</h2>
          <p>
            Train movements come from the MBTA’s public performance files (one per service day, subway only). Service alerts come from the MBTA’s alert history. Weather is hourly for central Boston from Open-Meteo. The year covers {n0(model.nDays)} calendar days, {n0(dataDays)} of which have data.
          </p>
          <p>
            The MBTA’s service day runs past midnight, so a 1 a.m. train after a Saturday belongs to Saturday. All times are stored in UTC and shown in Boston time.
          </p>
        </section>

        <section>
          <h2>How each day is labeled</h2>
          <p>Every line gets one label per day, using the first rule that fits:</p>
          <dl className="defs">
            {DAY_TYPE_ORDER.map((t) => (
              <div key={t}>
                <dt><DayTypeTag type={t} /></dt>
                <dd>{DAY_TYPES[t].long}</dd>
              </div>
            ))}
          </dl>
          <p className="fine">These thresholds are judgment calls, not facts. They are not tuned per line: the Green Line D branch runs with more long gaps on a normal day than the Orange Line does.</p>
        </section>

        <section>
          <h2>The measures</h2>
          <dl className="defs">
            <div><dt>Long gaps</dt><dd>The share of waits between trains that were more than 1.5 times the scheduled wait. This is the most trustworthy measure, because it does not depend on matching each train to a scheduled trip.</dd></div>
            <div><dt>Service level</dt><dd>How many train stops were recorded compared with a typical day for that line, separately for weekdays and weekends. 1.0 is usual.</dd></div>
            <div><dt>Late arrivals</dt><dd>Actual arrival time minus scheduled arrival time, shown as the 90th percentile (how late the slowest 10% were). It is computed only for trains that match a scheduled trip, and it is less reliable on disruption days, when trains are matched to a schedule that was not being followed.</dd></div>
            <div><dt>Trips not in the schedule</dt><dd>Trains the MBTA’s records mark as added, so they cannot be compared with a timetable. About 18% of all stops. Temporary service patterns during closures show up here, and some weekends show 100% with normal service levels, which is probably a record-keeping gap.</dd></div>
          </dl>
        </section>

        <section>
          <h2>Where it is weaker than it looks</h2>
          <ul className="plain">
            <li>{plural(model.gaps.length, 'day')} have no data at all. The MBTA published an empty file or nothing for them. They appear as gaps on the charts, never as zeros.</li>
            <li>One weather reading stands in for the whole network, and it comes from a weather model, not a station on the platform.</li>
            <li>Non-passenger train movements are excluded, and a small share of records appear twice (about 0.15%). Duplicates are resolved in favor of the trip’s own line, which matters mostly on the shared Green Line trunk.</li>
            <li>Alerts explain closures much better than disruptions. A disruption with no alert is labeled by the numbers alone.</li>
            <li>Weather and season are tangled together, so weather comparisons describe patterns, not proven causes.</li>
          </ul>
        </section>

        <section>
          <h2>Days with no data</h2>
          {model.gaps.length === 0 ? <p>None.</p> : (
            <ul className="gap-list">
              {model.gaps.map((d) => <li key={d}>{fmtDay(new Date(`${d}T00:00:00Z`))}</li>)}
            </ul>
          )}
        </section>

        <section>
          <h2>Credits</h2>
          <p>
            Train performance and alert data: Massachusetts Bay Transportation Authority, used under the MassDOT Developers License Agreement. Weather data: Open-Meteo.com. This project is independent and is not affiliated with or endorsed by the MBTA.
          </p>
        </section>
      </div>
    </div>
  );
}
