import { useEffect, useState } from 'react';
import { DataProvider, useData } from './lib/data.js';
import { ThemeContext, useThemeState } from './lib/hooks.js';
import { href, useRoute } from './lib/router.js';
import { TooltipLayer } from './components/Tooltip.jsx';
import Palette from './components/Palette.jsx';
import Story from './pages/Story.jsx';
import Explore from './pages/Explore.jsx';
import Lines from './pages/Lines.jsx';
import Episodes from './pages/Episodes.jsx';
import Weather from './pages/Weather.jsx';
import Report from './pages/Report.jsx';
import Method from './pages/Method.jsx';

const NAV = [
  { id: '', label: 'Story', path: [] },
  { id: 'explore', label: 'Explore', path: ['explore'] },
  { id: 'lines', label: 'Lines', path: ['lines', 'Red'] },
  { id: 'episodes', label: 'Episodes', path: ['episodes'] },
  { id: 'weather', label: 'Weather', path: ['weather'] },
  { id: 'report', label: 'Report', path: ['report'] },
  { id: 'method', label: 'Method', path: ['method'] },
];

function TopBar({ theme, toggleTheme }) {
  const { segs } = useRoute();
  const current = segs[0] || '';
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '');
  return (
    <header className="topbar">
      <div className="topbar-in">
        <a className="brand" href={href([])} aria-label="Headway, home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">Headway</span>
        </a>
        <nav aria-label="Main" className="topnav">
          <ul>
            {NAV.map((n) => (
              <li key={n.id}>
                <a className={`nav-link${current === n.id ? ' on' : ''}`} href={href(n.path)} aria-current={current === n.id ? 'page' : undefined}>{n.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="top-actions">
          <button type="button" className="btn btn-quiet" onClick={() => window.dispatchEvent(new CustomEvent('open-palette'))} aria-label="Search pages, lines, and episodes">
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <span className="top-label">Search</span>
            <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          <button type="button" className="btn btn-quiet" onClick={toggleTheme} aria-label={`Switch to ${theme === 'night' ? 'day' : 'night'} colors`}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              {theme === 'night' ? (
                <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" fill="currentColor" />
              ) : (
                <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" /></g>
              )}
            </svg>
            <span className="top-label">{theme === 'night' ? 'Night' : 'Day'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Routes({ model }) {
  const { segs } = useRoute();
  const page = segs[0] || '';
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  switch (page) {
    case 'explore': return <Explore model={model} />;
    case 'lines': return <Lines model={model} />;
    case 'episodes': return <Episodes model={model} />;
    case 'weather': return <Weather model={model} />;
    case 'report': return <Report model={model} />;
    case 'method': return <Method model={model} />;
    default: return <Story model={model} />;
  }
}

function Body() {
  const data = useData();
  if (data.status === 'loading') return <div className="page state"><p className="muted">Loading a year of service data…</p></div>;
  if (data.status === 'error') {
    return (
      <div className="page state">
        <h1 className="display-m">The data did not load</h1>
        <p className="lede">{data.error}</p>
        <p className="muted">In a terminal, from the app folder, run <code>npm run sync-data</code>, then reload this page.</p>
      </div>
    );
  }
  return <Routes model={data.model} />;
}

function PaletteHost({ onClose }) {
  const data = useData();
  return <Palette model={data.status === 'ready' ? data.model : null} onClose={onClose} />;
}

export default function App() {
  const { theme, toggle } = useThemeState();
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const open = () => setPalette(true);
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('open-palette', open);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('open-palette', open);
      window.removeEventListener('keydown', key);
    };
  }, []);
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <DataProvider>
        <a className="skip" href="#main">Skip to content</a>
        <TopBar theme={theme} toggleTheme={toggle} />
        <main className="main" id="main">
          <Body />
          <footer className="foot">
            Train and alert data: MBTA, used under the MassDOT Developers License Agreement. Weather: Open-Meteo.com. This project is independent and not affiliated with the MBTA.
          </footer>
        </main>
        {palette && <PaletteHost onClose={() => setPalette(false)} />}
        <TooltipLayer />
      </DataProvider>
    </ThemeContext.Provider>
  );
}
