// Numbers that come from the pipeline runs rather than from the exported files.
// They describe the build of the data window below. When the pipeline is automated these
// will be exported with the data; until then, update this file after a rebuild.

export const FACTS = {
  asOf: 'the November 2026 build',
  window: { start: '2025-11-08', end: '2026-11-07', requestedDays: 365 },
  files: { onDisk: 364, withRows: 348, empty: 16, unpublished: 1, unpublishedDate: '2026-01-06' },
  raw: {
    stopEvents: 14538608,
    keptAfterDedupe: 14516874,
    duplicateRowsFlagged: 21734,
    duplicateGroups: 21647,
    duplicateGroupsSpanningRoutes: 16865,
    keptMainRoutePct: 96.7,
  },
  tripKinds: { scheduled: 11793246, added: 2663619, nonrevenue: 60009 },
  trips: { scheduled: 694591, added: 562661, nonrevenue: 4194 },
  schedule: {
    comparableEvents: 11754166,
    medianSec: 54,
    p05Min: -7.77,
    p25Min: -1.38,
    p75Min: 4.47,
    p95Min: 15.38,
    p99Min: 34.88,
    medianAbsSec: 176,
    beyond12h: 147,
    medianDwellSec: 48,
  },
  nonrev: { shareOfOldExclusions: 91, oldExclusions: 47618, nonrevExclusions: 43332 },
  alerts: { rawRows: 5199988, distinct: 414068, versions: 987485, onOurLines: 22381, classified: 22336, openEnded: 168 },
  alertOverlap: { addedHeavyDays: 280, withLongAlert: 246, normalDays: 2096, normalWithLongAlert: 116 },
  weather: { hours: 8760, dry: 83.14, rain: 12.77, snow: 1.93, heavyRain: 1.12, unknown: 1.04 },
  stations: 125,
  checks: { martChecks: 9, alertChecks: 7 },
  build: { tables: 12, megabytes: 3200, seconds: 70 },
  // About the project itself. Update the test count when it changes (run `uv run pytest`).
  project: { tests: 92 },
};

export const MODELS = [
  { layer: 'staging', name: 'stg_lamp_stop_events', grain: 'One row per train stop event (14.5 million)', does: 'Converts raw columns to real timestamps and dates, labels each trip as scheduled, ADDED, or non-revenue, computes the difference from the schedule, and flags duplicates.' },
  { layer: 'staging', name: 'stg_weather_hourly', grain: 'One row per hour (8,760)', does: 'Unpacks the weather file into one row per hour, in UTC with a Boston-time column.' },
  { layer: 'staging', name: 'stg_alerts', grain: 'One row per alert (22,381 on the subway lines)', does: 'Rebuilds each alert from all of its versions: latest text, union of routes, earliest start, latest end, peak severity.' },
  { layer: 'staging', name: 'stg_stations', grain: 'One row per station (125)', does: 'Station names and coordinates, with the lines that serve each.' },
  { layer: 'intermediate', name: 'int_alerts_classified', grain: 'One row per alert with a start time', does: 'Sorts alerts into kinds (long service change, delay, facility, and others) from the effect, the duration, and the headline text.' },
  { layer: 'intermediate', name: 'int_hourly_weather_features', grain: 'One row per hour', does: 'Adds rolling totals for the previous 24 and 72 hours of snow and rain.' },
  { layer: 'intermediate', name: 'int_line_day_alerts', grain: 'One row per line and day', does: 'Counts the alerts of each kind that were in effect that day.' },
  { layer: 'intermediate', name: 'int_stop_events_weather', grain: 'One row per kept stop event (14.5 million)', does: 'Drops flagged duplicates, joins the weather for the hour, and applies the rules for which events can be compared with the schedule.' },
  { layer: 'marts', name: 'mart_daily_line_reliability', grain: 'One row per line and day (2,780)', does: 'The daily measures: service level, ADDED share, long gaps, late arrivals, plus coverage counts.' },
  { layer: 'marts', name: 'mart_hourly_weather_reliability', grain: 'One row per line, weather, hour, weekday or weekend (1,518)', does: 'The measures by hour of day and kind of weather.' },
  { layer: 'marts', name: 'mart_line_day_context', grain: 'One row per line and day (2,780)', does: 'Joins measures, weather, and alerts, then assigns each day its type.' },
  { layer: 'marts', name: 'mart_line_episodes', grain: 'One row per episode (102)', does: 'Groups consecutive days of the same unusual type into episodes with a plain-language label.' },
];

export const CHECKS = [
  { script: 'checks/02_check_staging.py', guards: 'Staging', tests: 'Key columns are never empty, every route is a known line, one row per trip and stop, event times fall on the right day, weather has no missing or duplicate hours, every event hour has weather.' },
  { script: 'checks/03_check_marts.py', guards: 'Intermediate and marts', tests: 'The intermediate table equals the deduplicated staging rows, each mart has one row per its grain, percentages stay between 0 and 100, fewer than 0.1% of scheduled events sit beyond the 12-hour cap, every line-day has weather.' },
  { script: 'checks/05_inspect_files_on_disk.py', guards: 'Raw files', tests: 'Every downloaded file: row count, whether it holds one service date, whether that date matches the filename. This is what exposed the 16 empty files.' },
  { script: 'checks/06_check_alerts.py', guards: 'Alerts', tests: 'Alert ids are unique, fewer than 5% lack a start time, at least 1,000 alerts start in the window, three alerts known to exist are present with the right peak severity, almost none end before they start.' },
  { script: 'checks/07_fingerprint.py', guards: 'Reproducibility', tests: 'Prints row counts and md5 checksums of the daily mart, alert kinds, line-day alerts, day types, and episodes. Identical checksums after a rebuild prove identical results.' },
  { script: 'checks/08_caveats.py', guards: 'Column meanings', tests: 'Tests whether the stop time is an arrival, and whether duplicates that span routes keep the right route.' },
];
