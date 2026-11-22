import { useEffect, useMemo, useRef, useState } from 'react';
import { DAY_TYPES, LINES, LINE_BY_ID } from '../lib/constants.js';
import { dateRange } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { Bullet } from './Bullet.jsx';

// Press Ctrl or Cmd + K to jump anywhere. It opens and closes instantly on purpose:
// a shortcut used all day should never make you wait for an animation.
export default function Palette({ model, onClose }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const returnTo = useRef(document.activeElement);

  useEffect(() => {
    inputRef.current?.focus();
    const back = returnTo.current;
    return () => back?.focus?.();
  }, []);

  const all = useMemo(() => {
    const pages = [
      { key: 'p-story', group: 'Pages', label: 'Overview', hint: 'The year in brief, then the story', go: () => navigate([]) },
      { key: 'p-explore', group: 'Pages', label: 'Explore', hint: 'Every day on every line', go: () => navigate(['explore']) },
      { key: 'p-episodes', group: 'Pages', label: 'Episodes', hint: 'Closures, disruptions, and gaps', go: () => navigate(['episodes']) },
      { key: 'p-weather', group: 'Pages', label: 'Weather', hint: 'How rain and snow change service', go: () => navigate(['weather']) },
      { key: 'p-report', group: 'Pages', label: 'Report', hint: 'The analysis, with the evidence', go: () => navigate(['report']) },
      { key: 'p-health', group: 'Pages', label: 'Health', hint: 'Is the pipeline running, and how fresh is the data?', go: () => navigate(['health']) },
      { key: 'p-method', group: 'Pages', label: 'Method', hint: 'How the pipeline was built and checked', go: () => navigate(['method']) },
    ];
    if (!model) return pages;
    const lines = LINES.filter((l) => model.byLine.has(l.id)).map((l) => ({
      key: `l-${l.id}`, group: 'Lines', label: l.label, hint: 'Reliability, hour by hour, and where it runs', line: l, go: () => navigate(['lines', l.id]),
    }));
    const eps = [...model.episodes]
      .sort((a, b) => b.n_days - a.n_days)
      .map((e) => ({
        key: `e-${e.key}`, group: 'Episodes', label: `${LINE_BY_ID[e.route_id].label}, ${dateRange(e.start_date, e.end_date)}`,
        hint: `${DAY_TYPES[e.episode_type].label}. ${e.label}`, line: LINE_BY_ID[e.route_id], go: () => navigate(['episodes'], { ep: e.key }),
      }));
    return [...pages, ...lines, ...eps];
  }, [model]);

  const results = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return all.filter((i) => i.group !== 'Episodes');
    return all.filter((i) => {
      const hay = `${i.label} ${i.hint}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    }).slice(0, 40);
  }, [all, q]);

  useEffect(() => {
    setActive(0);
  }, [q]);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (item) => {
    if (!item) return;
    item.go();
    onClose();
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  };

  return (
    <div className="pal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="pal-input"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Jump to a page, a line, or an episode"
          aria-label="Search pages, lines, and episodes"
          aria-controls="pal-list"
          aria-activedescendant={results[active] ? `pal-${results[active].key}` : undefined}
          role="combobox"
          aria-expanded="true"
          autoComplete="off"
          spellCheck="false"
        />
        <ul className="pal-list" id="pal-list" role="listbox" ref={listRef}>
          {results.map((r, i) => (
            <li key={r.key} id={`pal-${r.key}`} role="option" aria-selected={i === active} className={`pal-item${i === active ? ' on' : ''}`}
              onMouseMove={() => setActive(i)} onClick={() => run(r)}>
              {r.line ? <Bullet line={r.line} size="sm" /> : <span className="pal-dot" aria-hidden="true" />}
              <span className="pal-text">
                <span className="pal-label">{r.label}</span>
                <span className="pal-hint">{r.hint}</span>
              </span>
              <span className="pal-group">{r.group}</span>
            </li>
          ))}
          {results.length === 0 && <li className="pal-empty">Nothing matches “{q}”. Try a line name, a month, or a word like snow or closure.</li>}
        </ul>
      </div>
    </div>
  );
}
