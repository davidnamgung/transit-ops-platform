import { DAY_TYPES, DAY_TYPE_ORDER, LINE_BY_ID } from '../lib/constants.js';
import { n0, pct0 } from '../lib/format.js';
import { Bullet } from './Bullet.jsx';
import { tip } from './Tooltip.jsx';

// One bar per line: how its days split between normal days and each kind of exception.
export default function StackedBars({ rows }) {
  return (
    <ul className="sbars">
      {rows.map(({ id, counts, total, unusual }) => {
        const l = LINE_BY_ID[id];
        return (
          <li key={id} className="sbar-row">
            <span className="line-cell"><Bullet line={l} size="sm" />{l.name}</span>
            <span
              className="sbar"
              role="img"
              aria-label={`${l.name}: ${DAY_TYPE_ORDER.map((t) => `${counts[t]} ${DAY_TYPES[t].label.toLowerCase()}`).join(', ')}`}
              onPointerMove={(e) =>
                tip.show(e, (
                  <div className="tip-body">
                    <strong>{l.label}</strong>
                    {DAY_TYPE_ORDER.map((t) => (
                      <div key={t} className="tip-line"><span className={`swatch swatch-${DAY_TYPES[t].css}`} />{DAY_TYPES[t].label}<b>{n0(counts[t])} days</b></div>
                    ))}
                  </div>
                ))
              }
              onPointerLeave={() => tip.hide()}
            >
              {DAY_TYPE_ORDER.map((t) => {
                const share = total ? (counts[t] / total) * 100 : 0;
                return counts[t] ? (
                  <i key={t} className={`seg-${DAY_TYPES[t].css}`} style={{ width: `${share}%` }}>
                    {share >= 9 && <span>{Math.round(share)}%</span>}
                  </i>
                ) : null;
              })}
            </span>
            <span className="sbar-num">{pct0(total ? (unusual / total) * 100 : 0)}</span>
          </li>
        );
      })}
    </ul>
  );
}
