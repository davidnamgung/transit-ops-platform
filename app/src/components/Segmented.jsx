import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// A row of mutually exclusive options with a highlight that slides to the chosen one.
export function Segmented({ label, options, value, onChange }) {
  const refs = useRef({});
  const [pos, setPos] = useState(null);
  const [animate, setAnimate] = useState(false);

  const measure = () => {
    const el = refs.current[value];
    if (el) setPos({ x: el.offsetLeft, w: el.offsetWidth });
  };
  useLayoutEffect(() => {
    measure();
  }, [value, options]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true)); // no slide on first paint
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', measure);
    };
  });

  const onKeyDown = (e) => {
    const i = options.findIndex((o) => o.id === value);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = options[(i + 1) % options.length];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = options[(i - 1 + options.length) % options.length];
    if (next) {
      e.preventDefault();
      onChange(next.id);
      refs.current[next.id]?.focus();
    }
  };

  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {pos && (
        <span
          className={`seg-ind${animate ? ' animate' : ''}`}
          style={{ transform: `translateX(${pos.x}px)`, width: pos.w }}
          aria-hidden="true"
        />
      )}
      {options.map((o) => (
        <button
          key={o.id}
          ref={(el) => (refs.current[o.id] = el)}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          className={`seg-opt${o.id === value ? ' on' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
