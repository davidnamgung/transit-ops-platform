import { DAY_TYPES } from '../lib/constants.js';

// The round route marker used on subway signs: colored circle, one or two letters.
export function Bullet({ line, size = 'md' }) {
  return (
    <span className={`bullet bullet-${size} bullet-${line.css}`} aria-hidden="true">
      {line.bullet}
    </span>
  );
}

export function DayTypeTag({ type }) {
  const t = DAY_TYPES[type] || DAY_TYPES.normal;
  return (
    <span className={`tag tag-${t.css}`}>
      <i aria-hidden="true" />
      {t.label}
    </span>
  );
}
