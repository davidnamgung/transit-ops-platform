import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

// One tooltip for the whole app, driven by a tiny store.
// It follows the pointer, so it never animates its position. The first tooltip fades in
// quickly; once one has been open, the next appears instantly (no delay, no fade).

let state = { visible: false, x: 0, y: 0, content: null, instant: false };
let lastHide = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const tip = {
  show(e, content) {
    const instant = state.visible || performance.now() - lastHide < 400;
    state = { visible: true, x: e.clientX, y: e.clientY, content, instant };
    emit();
  },
  hide() {
    if (!state.visible) return;
    lastHide = performance.now();
    state = { ...state, visible: false };
    emit();
  },
};

export function TooltipLayer() {
  const s = useSyncExternalStore(subscribe, () => state);
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !s.visible) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    let left = s.x + 16;
    let top = s.y + 16;
    if (left + w > window.innerWidth - 8) left = s.x - w - 16;
    if (top + h > window.innerHeight - 8) top = s.y - h - 16;
    el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  });

  return (
    <div ref={ref} className={`tip${s.visible ? ' on' : ''}${s.instant ? ' instant' : ''}`} role="tooltip" aria-hidden={!s.visible}>
      {s.content}
    </div>
  );
}
