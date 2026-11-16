import { HEALTH_URL } from './constants.js';

// The pipeline's run history: loading it, and turning it into the things the Platform Health page shows.
// Staleness is judged here, in the visitor's browser, against the clock. If the schedule silently stops,
// no new run arrives, and the page turns red on its own.

export const STALE_HOURS = 36; // a daily run, plus room for GitHub's scheduling delays
const HOUR = 3600000;
const DAY = 86400000;

async function fetchHistory(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null; // not there (yet)
  const text = await res.text();
  // A development server answers a missing file with the app's own HTML page; that means "not there", not "damaged".
  if (/^\s*</.test(text)) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The run history file could not be read as JSON.');
  }
}

// Keeps the entries that make sense and counts the ones that did not, so one odd entry never hides the rest.
export function validate(raw) {
  if (!raw || !Array.isArray(raw.runs)) throw new Error('The run history file is not in the expected shape (no "runs" list).');
  const runs = [];
  let skipped = 0;
  for (const r of raw.runs) {
    if (r && (r.status === 'success' || r.status === 'failed') && Number.isFinite(Date.parse(r.finished_utc))) runs.push(r);
    else skipped += 1;
  }
  runs.sort((a, b) => Date.parse(a.finished_utc) - Date.parse(b.finished_utc));
  return { runs, skipped, updated: raw.updated_utc || null, repository: raw.repository || null };
}

// Tries GitHub first, then a local copy (for working offline). Returns { runs: [] } when nothing exists yet.
export async function loadHealth() {
  const sources = [HEALTH_URL, `${import.meta.env.BASE_URL}data/health.json`];
  for (const url of sources) {
    let raw = null;
    try {
      raw = await fetchHistory(url);
    } catch (err) {
      if (err.message.startsWith('The run history')) throw err; // found, but damaged: say so
    }
    if (raw) return { ...validate(raw), source: url };
  }
  return { runs: [], skipped: 0, updated: null, repository: null, source: null };
}

export function assess(runs, now) {
  if (!runs.length) return { state: 'empty' };
  const last = runs[runs.length - 1];
  const hoursSince = (now - Date.parse(last.finished_utc)) / HOUR;
  const lastSuccess = [...runs].reverse().find((r) => r.status === 'success') || null;
  const recent = runs.slice(-30);
  const okCount = recent.filter((r) => r.status === 'success').length;
  const stale = hoursSince > STALE_HOURS;
  let state = 'healthy';
  if (last.status === 'failed') state = 'failing';
  else if (stale) state = 'stale';
  return { state, last, lastSuccess, hoursSince, stale, recentCount: recent.length, okCount };
}

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// One entry per UTC day for the last `days` days, oldest first. A day shows the outcome of its last run.
// Today with no run yet is "pending", not "missed", because the daily run may simply not have happened yet.
export function dayStrip(runs, now, days = 60) {
  const byDay = new Map();
  for (const r of runs) {
    const k = dayKey(Date.parse(r.finished_utc));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(r);
  }
  const today = dayKey(now);
  const firstRun = runs.length ? dayKey(Date.parse(runs[0].finished_utc)) : today;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(now - i * DAY);
    const list = byDay.get(date) || [];
    let status = 'none';
    if (list.length) status = list[list.length - 1].status === 'success' ? 'ok' : 'failed';
    else if (date === today) status = 'pending';
    else if (date < firstRun) status = 'before'; // before the history began: nothing to judge
    out.push({ date, status, runs: list });
  }
  return out;
}

export function stripSummary(strip) {
  const judged = strip.filter((d) => d.status !== 'before' && d.status !== 'pending').slice(-30);
  return {
    days: judged.length,
    ok: judged.filter((d) => d.status === 'ok').length,
    failed: judged.filter((d) => d.status === 'failed').length,
    missed: judged.filter((d) => d.status === 'none').length,
  };
}

export function downloadSeconds(run) {
  return (run.stages || []).filter((s) => s.name.startsWith('download/')).reduce((a, s) => a + (s.seconds || 0), 0);
}

export const fmtDuration = (sec) => {
  if (sec == null || Number.isNaN(sec)) return 'unknown';
  if (sec < 90) return `${Math.round(sec)} seconds`;
  const m = Math.floor(sec / 60);
  return `${m} min ${Math.round(sec - m * 60)} s`;
};

export function fmtAgo(hours) {
  if (hours < 1 / 60) return 'just now';
  if (hours < 1) return `${Math.round(hours * 60)} minutes ago`;
  if (hours < 48) {
    const h = Math.round(hours);
    return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  }
  return `${Math.round(hours / 24)} days ago`;
}

export const fmtWhen = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
