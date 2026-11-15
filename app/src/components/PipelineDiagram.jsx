// The whole pipeline in one picture. Drawn as SVG so it stays sharp and follows the theme.
const COLS = [
  { x: 0, title: 'Public sources', sub: 'Downloaded on a schedule', items: ['MBTA trip records', 'MBTA service alerts', 'Open-Meteo weather', 'MBTA station list'] },
  { x: 1, title: 'Raw files', sub: 'Saved untouched', items: ['One Parquet file per day', 'Alert history file', 'Weather and station JSON'] },
  { x: 2, title: 'Staging', sub: 'Clean and typed', items: ['Real timestamps', 'Trip kinds', 'Duplicates flagged', 'Alerts rebuilt'] },
  { x: 3, title: 'Intermediate', sub: 'Joined and judged', items: ['Weather per hour', 'Alert kinds', 'Comparable events'] },
  { x: 4, title: 'Marts', sub: 'Answers', items: ['Daily measures', 'Hourly by weather', 'Day types', 'Episodes'] },
  { x: 5, title: 'This site', sub: 'Runs in the browser', items: ['Four small JSON files', 'Story and explorer'] },
];

export default function PipelineDiagram() {
  const colW = 148;
  const gap = 24;
  const w = COLS.length * colW + (COLS.length - 1) * gap;
  const rowH = 30;
  const h = 64 + 4 * rowH + 26;
  return (
    <div className="diagram-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="diagram" role="img" aria-label="Pipeline from public sources through raw files, staging, intermediate tables, and marts to this website">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 1 L9 5 L0 9" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        {COLS.map((c, i) => {
          const x = i * (colW + gap);
          return (
            <g key={c.title} transform={`translate(${x} 0)`}>
              <text x={0} y={18} className="dg-title">{c.title}</text>
              <text x={0} y={36} className="dg-sub">{c.sub}</text>
              {c.items.map((it, k) => (
                <g key={it} transform={`translate(0 ${48 + k * rowH})`}>
                  <rect width={colW} height={rowH - 6} rx={6} className={`dg-box dg-${i}`} />
                  <text x={10} y={(rowH - 6) / 2 + 4} className="dg-text">{it}</text>
                </g>
              ))}
              {i < COLS.length - 1 && <line x1={colW + 4} x2={colW + gap - 4} y1={48 + (rowH - 6) / 2 + 2 * rowH * 0.5} y2={48 + (rowH - 6) / 2 + 2 * rowH * 0.5} className="dg-arrow" markerEnd="url(#arr)" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
