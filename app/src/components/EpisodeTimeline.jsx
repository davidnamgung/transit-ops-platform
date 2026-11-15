import { useMemo, useRef } from 'react';
import { DAY_TYPES, LINE_BY_ID } from '../lib/constants.js';
import { dateRange, fmtMonth, plural } from '../lib/format.js';
import { useElementWidth } from '../lib/hooks.js';
import { tip } from './Tooltip.jsx';

const LANE = 34;
const AXIS = 28;
const LEFT = 120;

// Every episode as a bar on its line's lane. Click one to read it.
export default function EpisodeTimeline({ model, episodes, lanes, selectedKey, onSelect }) {
  const ref = useRef(null);
  const width = useElementWidth(ref) || 900;
  const plotW = Math.max(520, width - LEFT - 10);
  const cw = plotW / model.nDays;
  const height = AXIS + lanes.length * LANE + 4;
  const months = useMemo(() => model.calendar.map((d, i) => ({ d, i })).filter(({ d }) => d.getUTCDate() === 1), [model]);

  return (
    <div className="chart tl-wrap" ref={ref}>
      <div className="tl-scroll">
        <svg width={LEFT + plotW + 10} height={height} role="img" aria-label="Timeline of episodes by line. The table below lists the same episodes.">
          {months.map(({ d, i }, k) => (
            <g key={i}>
              <line x1={LEFT + i * cw} x2={LEFT + i * cw} y1={AXIS - 6} y2={height - 2} className="grid-line" />
              {(k % 1 === 0) && <text x={LEFT + i * cw + 4} y={AXIS - 12} className="axis-text">{fmtMonth(d)}{(d.getUTCMonth() === 0 || k === 0) ? ` ’${String(d.getUTCFullYear()).slice(2)}` : ''}</text>}
            </g>
          ))}
          {lanes.map((id, li) => {
            const l = LINE_BY_ID[id];
            const cy = AXIS + li * LANE + LANE / 2;
            return (
              <g key={id}>
                <line x1={LEFT} x2={LEFT + plotW} y1={cy} y2={cy} className="lane-line" />
                <g transform={`translate(0 ${cy})`}>
                  <circle cx={11} r={10} className={`bl bl-${l.css}`} />
                  <text x={11} className={`bl-text bl-text-${l.css}`}>{l.bullet}</text>
                  <text x={28} className="rib-name">{l.name}</text>
                </g>
              </g>
            );
          })}
          {episodes.map((e) => {
            const li = lanes.indexOf(e.route_id);
            if (li < 0) return null;
            const t = DAY_TYPES[e.episode_type];
            const x = LEFT + e.startIdx * cw;
            const w = Math.max(5, (e.endIdx - e.startIdx + 1) * cw);
            const sel = selectedKey === e.key;
            return (
              <rect
                key={e.key}
                x={x}
                y={AXIS + li * LANE + 7}
                width={w}
                height={LANE - 14}
                rx={3}
                className={`ep-bar ep-bar-${t.css}${sel ? ' sel' : ''}`}
                onPointerMove={(ev) =>
                  tip.show(
                    ev,
                    <div className="tip-body">
                      <strong>{LINE_BY_ID[e.route_id].label}</strong>
                      <span className={`tag tag-${t.css}`}><i />{t.label}</span>
                      <div className="muted">{dateRange(e.start_date, e.end_date)} ({plural(e.n_days, 'day')})</div>
                      <div>{e.label}</div>
                      <div className="tip-hint">Click for details</div>
                    </div>,
                  )
                }
                onPointerLeave={() => tip.hide()}
                onClick={() => onSelect(e.key)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
