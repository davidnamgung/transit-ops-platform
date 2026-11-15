import { createContext, useCallback, useContext, useLayoutEffect, useState } from 'react';

export const ThemeContext = createContext({ theme: 'night', toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function useThemeState() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'day');
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'night' ? 'day' : 'night';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('theme', next);
      } catch {
        /* private mode: the choice just will not persist */
      }
      return next;
    });
  }, []);
  return { theme, toggle };
}

// Tracks the width of an element (for charts that draw to fit).
export function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
