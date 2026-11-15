import { LINE_BY_ID } from '../lib/constants.js';
import { fmtDay, minutes, pct0, times } from '../lib/format.js';
import { DayTypeTag } from './Bullet.jsx';

// The tooltip shown when you point at a day on a line.
export function dayTip(model, routeId, idx) {
  const l = LINE_BY_ID[routeId];
  const row = model.byLine.get(routeId)[idx];
  const date = fmtDay(model.calendar[idx]);
  if (!row) {
    return (
      <div className="tip-body">
        <strong>{l.label}</strong>
        <div className="muted">{date}</div>
        <div>No data was published for this day</div>
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
}
