import { useMemo, useRef, useState } from 'react';
import { LINE_BY_ID } from '../lib/constants.js';
import { useElementWidth } from '../lib/hooks.js';
import { tip } from './Tooltip.jsx';

const H = 360;
const PAD = 22;

// Stations drawn where they really are. The chosen line lights up.
export default function StationMap({ stations, routeId }) {
  const ref = useRef(null);
  const width = useElementWidth(ref) || 420;
  const [hover, setHover] = useState(null);
  const l = routeId ? LINE_BY_ID[routeId] : null;

  const pts = useMemo(() => {
    const lat0 = stations.reduce((s, p) => s + p.latitude, 0) / stations.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const raw = stations.map((s) => ({ s, x: s.longitude * k, y: -s.latitude }));
    const xs = raw.map((p) => p.x);
    const ys = raw.map((p) => p.y);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const scale = Math.min((width - PAD * 2) / (x1 - x0 || 1), (H - PAD * 2) / (y1 - y0 || 1));
    const ox = (width - (x1 - x0) * scale) / 2;
    const oy = (H - (y1 - y0) * scale) / 2;
    return raw.map((p) => ({ ...p, px: ox + (p.x - x0) * scale, py: oy + (p.y - y0) * scale }));
  }, [stations, width]);

  const on = (p) => !routeId || p.s.routeList.includes(routeId);
  const move = (e) => {
    const box = ref.current.querySelector('svg').getBoundingClientRect();
    const mx = e.clientX - box.left;
    const my = e.clientY - box.top;
    let best = null;
    let bd = 14 * 14;
    for (const p of pts) {
      const d = (p.px - mx) ** 2 + (p.py - my) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    setHover(best);
    if (best) {
      tip.show(e, (
        <div className="tip-body">
          <strong>{best.s.station_name}</strong>
          <div className="muted">{best.s.routeList.map((r) => LINE_BY_ID[r]?.name || r).join(', ')}</div>
        </div>
      ));
    } else tip.hide();
  };

  return (
    <div className="chart map" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={l ? `Map of ${stations.filter((s) => s.routeList.includes(routeId)).length} stations on the ${l.label}` : 'Map of subway stations'}
        onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        {pts.filter((p) => !on(p)).map((p) => <circle key={`${p.s.station_id}-${p.s.station_name}`} cx={p.px} cy={p.py} r={2.6} className="st st-off" />)}
        {pts.filter(on).map((p) => (
          <circle key={`${p.s.station_id}-${p.s.station_name}`} cx={p.px} cy={p.py} r={routeId ? 4.6 : 3.2} className="st st-on"
            style={l ? { fill: `var(--line-${l.css})` } : undefined} />
        ))}
        {hover && <circle cx={hover.px} cy={hover.py} r={8} className="st-ring" />}
      </svg>
    </div>
  );
}
