import { Bullet } from './Bullet.jsx';

// Toggle buttons for showing or hiding lines. At least one must stay on.
export function LineChips({ groups, active, onToggle, label = 'Lines shown' }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {groups.map((g) => {
        const on = active.has(g.id);
        return (
          <button
            key={g.id}
            type="button"
            className={`chip${on ? ' on' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(g.id)}
          >
            <Bullet line={g} size="sm" />
            {g.label}
          </button>
        );
      })}
    </div>
  );
}
