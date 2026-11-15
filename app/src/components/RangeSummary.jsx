import { useMemo } from 'react';
import { DAY_TYPES, DAY_TYPE_ORDER, LINE_BY_ID } from '../lib/constants.js';
import { n0, pct0 } from '../lib/format.js';
import { Bullet } from './Bullet.jsx';
import { tip } from './Tooltip.jsx';

// For the days in view, how many of each kind of day did each line have?
export default function RangeSummary({ model, lines, range }) {
  const [a, b] = range || [0, model.nDays - 1];
  const summary = useMemo(
    () =>
      lines.map((id) => {
        const counts = { normal: 0, planned_closure: 0, disruption: 0, schedule_matching_gap: 0, nodata: 0 };
        const arr = model.byLine.get(id);
        for (let i = a; i <= b; i++) {
          const r = arr[i];
          if (!r) counts.nodata += 1;
          else counts[r.type] += 1;
        }
        return { id, counts, total: b - a + 1 };
      }),
    [model, lines, a, b],
  );

  return (
    <section className="panel summary" aria-label="Days by kind for each line">
      <h2>Days in view</h2>
      <p className="muted">{n0(b - a + 1)} days. Bars show how each line’s days split.</p>
      <ul className="sum-list">
        {summary.map(({ id, counts, total }) => {
          const l = LINE_BY_ID[id];
          const unusual = counts.planned_closure + counts.disruption + counts.schedule_matching_gap;
          return (
            <li key={id} className="sum-row">
              <span className="line-cell"><Bullet line={l} size="sm" />{l.name}</span>
              <span
                className="stack"
                role="img"
                aria-label={`${l.name}: ${counts.normal} normal days, ${counts.planned_closure} planned closures, ${counts.disruption} disruptions, ${counts.schedule_matching_gap} schedule gaps, ${counts.nodata} days without data`}
                onPointerMove={(e) =>
                  tip.show(
                    e,
                    <div className="tip-body">
                      <strong>{l.label}</strong>
                      {DAY_TYPE_ORDER.map((t) => (
                        <div key={t} className="tip-line">
                          <span className={`swatch swatch-${DAY_TYPES[t].css}`} />
                          {DAY_TYPES[t].label}
                          <b>{n0(counts[t])}</b>
                        </div>
                      ))}
                      {counts.nodata > 0 && (
                        <div className="tip-line">
                          <span className="swatch swatch-nodata" />No data<b>{n0(counts.nodata)}</b>
                        </div>
                      )}
                    </div>,
                  )
                }
                onPointerLeave={() => tip.hide()}
              >
                {DAY_TYPE_ORDER.map((t) =>
                  counts[t] ? <i key={t} className={`seg-${DAY_TYPES[t].css}`} style={{ flexGrow: counts[t] }} /> : null,
                )}
                {counts.nodata ? <i className="seg-nodata" style={{ flexGrow: counts.nodata }} /> : null}
              </span>
              <span className="sum-num num">{pct0(total ? (unusual / total) * 100 : 0)}</span>
            </li>
          );
        })}
      </ul>
      <p className="fine">The percentage is the share of days that were not normal.</p>
    </section>
  );
}
