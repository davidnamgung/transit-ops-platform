import { createContext, createElement, useContext, useEffect, useState } from 'react';
import { ROUTE_ORDER } from './constants.js';
import { DAY_MS, toDate, toIso } from './format.js';

// Loads the four JSON files written by transform/export_for_app.py and builds
// the lookups every page uses. Anything wrong with the files is reported in plain words.

const FILES = {
  lineDays: 'line_days.json',
  episodes: 'episodes.json',
  hourly: 'hourly_weather.json',
  stations: 'stations.json',
};

// Only the columns the app actually reads. Anything else in the files is optional and is shown as "no data" if absent.
const REQUIRED = {
  lineDays: [
    'service_date', 'route_id', 'day_type', 'volume_vs_typical', 'pct_added', 'pct_headways_over_1_5x',
    'p90_schedule_diff_min', 'avg_temp_c', 'total_precip_mm', 'total_snow_cm', 'max_gust_kmh', 'n_delay_alerts',
  ],
  episodes: ['route_id', 'episode_type', 'start_date', 'end_date', 'n_days', 'label'],
  hourly: [
    'route_id', 'weather_category', 'hour_local', 'is_weekend', 'n_comparable', 'n_headways',
    'pct_headways_over_1_5x', 'p90_schedule_diff_min', 'pct_within_5min',
  ],
  stations: ['station_id', 'station_name', 'latitude', 'longitude', 'routes'],
};

const NUMERIC = {
  lineDays: [
    'n_events', 'volume_vs_typical', 'pct_added', 'n_comparable', 'n_headways', 'median_schedule_diff_min',
    'p90_schedule_diff_min', 'pct_headways_over_1_5x', 'avg_temp_c', 'total_precip_mm', 'total_snow_cm',
    'max_gust_kmh', 'n_long_service_change_alerts', 'n_short_service_change_alerts', 'n_station_alerts',
    'n_incident_alerts', 'n_delay_alerts', 'n_weather_alerts', 'n_planned_work_alerts', 'max_alerted_delay_min',
  ],
  episodes: ['n_days', 'avg_volume_vs_typical', 'avg_pct_added', 'avg_pct_long_gaps', 'max_daily_snow_cm', 'max_gust_kmh', 'delay_alerts'],
  hourly: [
    'hour_local', 'n_events', 'n_added_events', 'n_comparable', 'pct_events_comparable', 'median_schedule_diff_min',
    'p90_schedule_diff_min', 'pct_within_5min', 'n_headways', 'pct_headways_over_1_5x',
  ],
  stations: ['latitude', 'longitude'],
};

class DataError extends Error {}

async function fetchJson(name) {
  const url = `${import.meta.env.BASE_URL}data/${name}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new DataError(`Could not reach ${url}.`);
  }
  if (!res.ok) {
    throw new DataError(`Could not load data/${name} (HTTP ${res.status}). Run "npm run sync-data" in the app folder, then reload.`);
  }
  try {
    return await res.json();
  } catch {
    throw new DataError(`data/${name} is missing or is not valid JSON. Run "npm run sync-data" in the app folder, then reload.`);
  }
}

function validate(kind, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new DataError(`data/${FILES[kind]} is empty.`);
  }
  const have = new Set(Object.keys(rows[0]));
  const missing = REQUIRED[kind].filter((c) => !have.has(c));
  if (missing.length) {
    throw new DataError(
      `data/${FILES[kind]} is missing these columns: ${missing.join(', ')}. Re-run "uv run python transform/export_for_app.py" and then "npm run sync-data".`,
    );
  }
  for (const r of rows) {
    for (const c of NUMERIC[kind]) {
      if (r[c] != null && typeof r[c] !== 'number') {
        const v = Number(r[c]);
        r[c] = Number.isNaN(v) ? null : v;
      }
    }
  }
  return rows;
}

export async function loadModel() {
  const kinds = Object.keys(FILES);
  const settled = await Promise.allSettled(kinds.map(async (kind) => validate(kind, await fetchJson(FILES[kind]))));
  const problems = settled
    .filter((r) => r.status === 'rejected')
    .map((r) => (r.reason instanceof DataError ? r.reason.message : String(r.reason)));
  if (problems.length) throw new DataError(problems.join(' '));
  const [lineDays, episodes, hourly, stations] = settled.map((r) => r.value);

  // Calendar: every day between the first and last date, whether or not data exists.
  const dates = [...new Set(lineDays.map((r) => r.service_date))].sort();
  const start = toDate(dates[0]);
  const end = toDate(dates[dates.length - 1]);
  const nDays = Math.round((end - start) / DAY_MS) + 1;
  const calendar = Array.from({ length: nDays }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  const dayIso = calendar.map(toIso);
  const have = new Set(dates);
  const gaps = dayIso.filter((d) => !have.has(d));
  const idxOf = (iso) => Math.round((toDate(iso) - start) / DAY_MS);

  const routes = ROUTE_ORDER.filter((id) => lineDays.some((r) => r.route_id === id));
  const byLine = new Map(routes.map((id) => [id, new Array(nDays).fill(null)]));
  for (const r of lineDays) {
    r.idx = idxOf(r.service_date);
    r.type = r.day_type;
    byLine.get(r.route_id)?.splice(r.idx, 1, r);
  }

  const eps = episodes.map((e) => ({
    ...e,
    key: `${e.route_id}|${e.episode_type}|${e.start_date}`,
    startIdx: idxOf(e.start_date),
    endIdx: idxOf(e.end_date),
  }));

  const stationsOut = stations.map((s) => ({
    ...s,
    routeList: String(s.routes).split(',').map((x) => x.trim()).filter(Boolean),
  }));

  return { calendar, dayIso, nDays, start, end, gaps, routes, byLine, rows: lineDays, episodes: eps, hourly, stations: stationsOut, idxOf };
}

const DataContext = createContext({ status: 'loading' });

export function DataProvider({ children }) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    loadModel().then(
      (model) => alive && setState({ status: 'ready', model }),
      (error) => alive && setState({ status: 'error', error: error instanceof DataError ? error.message : String(error) }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return createElement(DataContext.Provider, { value: state }, children);
}

export const useData = () => useContext(DataContext);