import { fmtDuration, fmtWhen } from '../lib/health.js';
import { tip } from './Tooltip.jsx';

const WORD = { ok: 'ran and passed', failed: 'ran and failed', none: 'no run recorded', pending: 'no run yet today', before: 'before the history began' };

// One square per day, like the rest of the site. Green: the day's last run passed. Red: it failed.
// Hatched: the schedule produced no run that day. Dashed outline: today, and the run may still be coming.
export default function RunStrip({ days, selected, onSelect }) {
  return (
    <div className="run-strip" role="group" aria-label="Pipeline runs, one square per day">
      {days.map((d) => (
        <button
          key={d.date}
          type="button"
          className={`run-day run-${d.status}${selected === d.date ? ' sel' : ''}`}
          disabled={d.status === 'before'}
          aria-pressed={selected === d.date}
          aria-label={`${d.date}: ${WORD[d.status]}`}
          onClick={() => onSelect(d.date)}
          onPointerMove={(e) =>
            tip.show(e, (
              <div className="tip-body">
                <strong>{d.date}</strong>
                <div className="muted">{WORD[d.status]}</div>
                {d.runs.map((r) => (
                  <div key={r.run_id} className="tip-line">{fmtWhen(r.finished_utc)}<b>{r.status === 'success' ? 'passed' : 'failed'}, {fmtDuration(r.duration_sec)}</b></div>
                ))}
              </div>
            ))
          }
          onPointerLeave={() => tip.hide()}
        />
      ))}
    </div>
  );
}
