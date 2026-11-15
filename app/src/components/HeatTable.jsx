import { useMemo } from 'react';
import { LINE_BY_ID } from '../lib/constants.js';
import { fmtMonth } from '../lib/format.js';
import { makeRamp } from '../lib/ramps.js';
import { Bullet } from './Bullet.jsx';
import { tip } from './Tooltip.jsx';

const lum = (rgb) => {
  const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(rgb) || [0, 0, 0, 0];
  return (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255;
};

// Lines down the side, months across, a number in every cell, colored by size.
export default function HeatTable({ table, theme, domain = [0, 60], unit = '%' }) {
  const ramp = useMemo(() => makeRamp(theme), [theme]);
  return (
    <div className="heat-table-wrap">
      <table className="heat-table">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Line</span></th>
            {table.months.map((m) => (
              <th key={m.key} scope="col">{fmtMonth(m.date)}<span className="th-year"> ’{String(m.date.getUTCFullYear()).slice(2)}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.id}>
              <th scope="row"><span className="line-cell"><Bullet line={LINE_BY_ID[r.id]} size="sm" />{LINE_BY_ID[r.id].name}</span></th>
              {r.cells.map((v, k) => {
                const fill = v == null ? null : ramp(Math.max(0, Math.min(1, (v - domain[0]) / (domain[1] - domain[0]))));
                return (
                  <td
                    key={k}
                    style={fill ? { background: fill, color: lum(fill) > 0.62 ? '#101a26' : '#f4f7fa' } : undefined}
                    className={v == null ? 'ht-empty' : ''}
                    onPointerMove={(e) => v != null && tip.show(e, (
                      <div className="tip-body"><strong>{LINE_BY_ID[r.id].label}, {fmtMonth(table.months[k].date)}</strong><div>{Math.round(v)}{unit} of trips were not in the schedule</div></div>
                    ))}
                    onPointerLeave={() => tip.hide()}
                  >
                    {v == null ? '' : Math.round(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
