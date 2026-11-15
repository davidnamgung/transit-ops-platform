import { DAY_TYPES, LINE_BY_ID } from '../lib/constants.js';
import { dateRange, plural } from '../lib/format.js';
import { Bullet, DayTypeTag } from './Bullet.jsx';

// A short, clickable list of episodes.
export default function EpisodeList({ episodes, onPick, emptyText = 'Nothing unusual in view.', selectedKey }) {
  if (!episodes.length) return <p className="muted">{emptyText}</p>;
  return (
    <ul className="ep-list">
      {episodes.map((e) => {
        const l = LINE_BY_ID[e.route_id];
        return (
          <li key={e.key}>
            <button type="button" className={`ep-item${selectedKey === e.key ? ' on' : ''}`} onClick={() => onPick(e)}>
              <span className="ep-top">
                <Bullet line={l} size="sm" />
                <DayTypeTag type={e.episode_type} />
                <span className="ep-dates">{dateRange(e.start_date, e.end_date)}</span>
                <span className="ep-days">{plural(e.n_days, 'day')}</span>
              </span>
              <span className="ep-label">{e.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
