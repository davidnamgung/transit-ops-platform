import { LINE_BY_ID } from '../lib/constants.js';
import { fmtDay, minutes, n0, pct0, times, weatherSentence } from '../lib/format.js';
import { Bullet, DayTypeTag } from './Bullet.jsx';

// The detail view for one day: every visible line side by side.
export default function DayPanel({ model, idx, lines, onSelect, shortcuts }) {
  if (idx == null) {
    return (
      <section className="panel day-panel" aria-live="polite">
        <h2>Pick a day to read it</h2>
        <p className="lede">
          Click any day on the chart, or step through days with the arrow keys. Drag across the chart to zoom in on a stretch of time.
        </p>
        {shortcuts.length > 0 && (
          <>
            <h3 className="sub">Good places to start</h3>
            <ul className="shortcuts">
              {shortcuts.map((s) => (
                <li key={s.key}>
                  <button type="button" className="shortcut" onClick={() => onSelect(s.idx, s)}>
                    <span className="shortcut-title">{s.title}</span>
                    <span className="shortcut-note">{s.note}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    );
  }

  const date = model.calendar[idx];
  const rows = lines.map((id) => ({ id, row: model.byLine.get(id)[idx] }));
  const present = rows.filter((r) => r.row);
  const hard = present.some((r) => r.row.type !== 'normal');

  return (
    <section className="panel day-panel" aria-live="polite">
      <header className="panel-head">
        <div>
          <h2>{fmtDay(date)}</h2>
          <p className="muted">{present.length ? weatherSentence(present[0].row) : 'No data for this day'}</p>
        </div>
        <div className="stepper">
          <button type="button" className="btn btn-icon" aria-label="Previous day" disabled={idx <= 0} onClick={() => onSelect(idx - 1)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="btn btn-icon" aria-label="Next day" disabled={idx >= model.nDays - 1} onClick={() => onSelect(idx + 1)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </header>

      {present.length === 0 ? (
        <p className="note">
          The MBTA published no performance data for this day (the file was missing or empty), so there is nothing to show. See the Method page for the full list of missing days.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="day-table">
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col">What happened</th>
                <th scope="col" className="num">Service level</th>
                <th scope="col" className="num">Long gaps</th>
                <th scope="col" className="num">Late arrivals (p90)</th>
                <th scope="col" className="num">Delay alerts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, row }) => {
                const l = LINE_BY_ID[id];
                if (!row) {
                  return (
                    <tr key={id}>
                      <th scope="row"><span className="line-cell"><Bullet line={l} size="sm" />{l.name}</span></th>
                      <td colSpan={5} className="muted">No data</td>
                    </tr>
                  );
                }
                return [
                  <tr key={id}>
                    <th scope="row"><span className="line-cell"><Bullet line={l} size="sm" />{l.name}</span></th>
                    <td><DayTypeTag type={row.type} /></td>
                    <td className="num">{times(row.volume_vs_typical)}</td>
                    <td className="num">{pct0(row.pct_headways_over_1_5x)}</td>
                    <td className="num">{row.p90_schedule_diff_min == null ? 'no data' : minutes(row.p90_schedule_diff_min)}</td>
                    <td className="num">{n0(row.n_delay_alerts)}</td>
                  </tr>,
                  row.longest_closure_header ? (
                    <tr key={`${id}-note`} className="note-row">
                      <td />
                      <td colSpan={5}>
                        <span className="alert-text">{row.longest_closure_header}</span>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {hard && (
        <p className="fine">
          On days like this, arrival times are matched against a schedule that was not being followed, so “late arrivals” can look worse than riders felt. The long gaps figure is the more reliable one.
        </p>
      )}
    </section>
  );
}
