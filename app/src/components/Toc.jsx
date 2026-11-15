import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../lib/hooks.js';

// A sticky table of contents for the long pages. It scrolls with buttons rather than anchor links,
// because the page address is already used for routing. The highlighted item is the last section
// whose top has passed under the header.
export default function Toc({ items, label = 'On this page' }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let current = items[0]?.id;
      for (const i of items) {
        const el = document.getElementById(i.id);
        if (el && el.getBoundingClientRect().top <= 150) current = i.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [items]);
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  return (
    <nav className="toc" aria-label={label}>
      <p className="toc-title">{label}</p>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" className={`toc-link${active === i.id ? ' on' : ''}`} aria-current={active === i.id ? 'true' : undefined} onClick={() => go(i.id)}>{i.label}</button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
