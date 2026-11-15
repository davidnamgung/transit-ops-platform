# %% [markdown]
# # Headways, ADDED episodes, storm aftermath
# 1. Daylight saving (re-run of 3a)
# 2. Are headway metrics still sound on ADDED trips?
# 3. Red Line July episodes: headways in each period
# 4. Red Line Jul 21-30: was part of the line closed?
# 5. Which stations lost service that week?
# 6. Are ADDED episodes "labeling only" or real service cuts?
# 7. Blue and Red storm aftermath with a fair baseline
# 8. Red early-morning anomaly: where and what?

# %% Setup
from pathlib import Path

import duckdb
import pandas as pd

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pyproject.toml").exists())
con = duckdb.connect(str(ROOT / "data/warehouse/transit.duckdb"), read_only=True)
con.execute("SET TimeZone = 'UTC'")
pd.set_option("display.width", 220)
pd.set_option("display.max_columns", 50)
pd.set_option("display.max_rows", 100)

E = "intermediate.int_stop_events_weather"
S = "staging.stg_lamp_stop_events"
D = "marts.mart_daily_line_reliability"


def q(sql):
    """Run SQL and return a pandas table."""
    cur = con.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


print(f"Setup complete. Rows: {q(f'SELECT COUNT(*) AS n FROM {E}').iloc[0, 0]:,}")

# %% 1. Daylight saving: clocks changed Sun 2026-03-08 and Sun 2026-11-01.
# Compare the Sunday medians with the typical Sunday value (about 0.30 min).
# A jump of about +-60 minutes would mean a time-conversion bug.
q(f"""
SELECT service_date, dayname(service_date) AS weekday,
       COUNT(*) FILTER (WHERE is_schedule_comparable) AS n_comparable,
       ROUND(median(schedule_diff_sec / 60.0) FILTER (WHERE is_schedule_comparable), 2)
           AS median_diff_min
FROM {E}
WHERE service_date BETWEEN DATE '2026-03-05' AND DATE '2026-03-11'
   OR service_date BETWEEN DATE '2026-10-29' AND DATE '2026-11-04'
GROUP BY service_date
ORDER BY service_date
""")

# %% 2. Headway ratio (actual / scheduled gap): ADDED vs scheduled trips
q(f"""
SELECT CASE WHEN is_added_trip THEN 'ADDED' ELSE 'scheduled' END AS kind,
       COUNT(*)                                           AS n_events,
       ROUND(100.0 * COUNT(headway_ratio) / COUNT(*), 1)  AS pct_with_headway,
       ROUND(quantile_cont(headway_ratio, 0.5), 2)        AS median_ratio,
       ROUND(quantile_cont(headway_ratio, 0.9), 2)        AS p90_ratio,
       ROUND(100.0 * AVG(CAST(headway_ratio > 1.5 AS INTEGER)), 2) AS pct_over_1_5x
FROM {E}
GROUP BY is_added_trip
ORDER BY 1
""")

# %% 3. Red Line headways in three periods: normal, ADDED surge, ADDED + half volume
q(f"""
SELECT CASE WHEN service_date BETWEEN DATE '2026-06-20' AND DATE '2026-06-30'
                 THEN '1  Jun 20-30  (normal)'
            WHEN service_date BETWEEN DATE '2026-07-01' AND DATE '2026-07-13'
                 THEN '2  Jul 1-13   (ADDED 70-90%, normal volume)'
            ELSE     '3  Jul 21-30  (ADDED ~99%, half volume)' END AS period,
       COUNT(*)                                           AS n_events,
       COUNT(headway_ratio)                               AS n_headways,
       ROUND(quantile_cont(headway_ratio, 0.5), 2)        AS median_ratio,
       ROUND(quantile_cont(headway_ratio, 0.9), 2)        AS p90_ratio,
       ROUND(100.0 * AVG(CAST(headway_ratio > 1.5 AS INTEGER)), 2) AS pct_over_1_5x
FROM {E}
WHERE route_id = 'Red'
  AND (service_date BETWEEN DATE '2026-06-20' AND DATE '2026-06-30'
    OR service_date BETWEEN DATE '2026-07-01' AND DATE '2026-07-13'
    OR service_date BETWEEN DATE '2026-07-21' AND DATE '2026-07-30')
GROUP BY 1
ORDER BY 1
""")

# %% 4. Red Line, Jul 17 - Aug 2: stations and trips per day
q(f"""
SELECT service_date, dayname(service_date) AS weekday,
       COUNT(*)                                   AS n_events,
       COUNT(DISTINCT parent_station)             AS n_stations,
       COUNT(DISTINCT trip_id)                    AS n_trips,
       ROUND(1.0 * COUNT(*) / COUNT(DISTINCT trip_id), 1) AS events_per_trip,
       ROUND(100.0 * COUNT(*) FILTER (WHERE is_added_trip) / COUNT(*), 1) AS pct_added
FROM {S}
WHERE key_row_number = 1 AND route_id = 'Red'
  AND service_date BETWEEN DATE '2026-07-17' AND DATE '2026-08-02'
GROUP BY service_date
ORDER BY service_date
""")

# %% 5. Which Red stations lost service? (stations with zero events sort first)
q(f"""
SELECT parent_station,
       COUNT(*) FILTER (WHERE service_date BETWEEN DATE '2026-07-06' AND DATE '2026-07-12')
           AS events_normal_week,
       COUNT(*) FILTER (WHERE service_date BETWEEN DATE '2026-07-22' AND DATE '2026-07-28')
           AS events_reduced_week
FROM {S}
WHERE key_row_number = 1 AND route_id = 'Red'
  AND service_date BETWEEN DATE '2026-07-06' AND DATE '2026-07-28'
GROUP BY parent_station
ORDER BY events_reduced_week, events_normal_week DESC
""")

# %% 6. Every line-day with 90%+ ADDED events: was the volume normal or cut?
# Typical volume is the median for that line on weekdays or weekends separately.
q(f"""
WITH day AS (
    SELECT service_date, route_id, dayofweek(service_date) IN (0, 6) AS is_weekend,
           COUNT(*) AS n_events,
           100.0 * COUNT(*) FILTER (WHERE is_added_trip) / COUNT(*) AS pct_added
    FROM {E}
    GROUP BY service_date, route_id
),
typ AS (SELECT route_id, is_weekend, median(n_events) AS typical FROM day GROUP BY route_id, is_weekend)
SELECT d.route_id,
       COUNT(*)                                                         AS days_90pct_added,
       COUNT(*) FILTER (WHERE d.n_events / t.typical < 0.6)             AS volume_below_60pct,
       COUNT(*) FILTER (WHERE d.n_events / t.typical BETWEEN 0.6 AND 0.85) AS volume_60_to_85pct,
       COUNT(*) FILTER (WHERE d.n_events / t.typical > 0.85)            AS volume_normal
FROM day d JOIN typ t USING (route_id, is_weekend)
WHERE d.pct_added >= 90
GROUP BY d.route_id
ORDER BY d.route_id
""")

# %% 7. Storm aftermath: Blue and Red, Jan 22 - Feb 3, with a fair baseline
q(f"""
WITH d AS (SELECT *, dayofweek(service_date) IN (0, 6) AS is_weekend FROM {D}),
typ AS (SELECT route_id, is_weekend, median(n_events) AS typical FROM d GROUP BY route_id, is_weekend)
SELECT d.route_id, d.service_date, dayname(d.service_date) AS weekday, d.n_events,
       ROUND(d.n_events / t.typical, 2) AS volume_vs_typical,
       d.median_schedule_diff_min, d.n_very_late_events, d.total_snow_cm
FROM d JOIN typ t USING (route_id, is_weekend)
WHERE d.route_id IN ('Blue', 'Red')
  AND d.service_date BETWEEN DATE '2026-01-22' AND DATE '2026-02-03'
ORDER BY d.route_id, d.service_date
""")

# %% 8a. Red "very early" events at 4-7 AM: which stations, directions, trip positions?
q(f"""
SELECT parent_station, direction,
       COUNT(*)                                       AS n_events,
       COUNT(DISTINCT service_date)                   AS days,
       ROUND(median(schedule_diff_sec / 3600.0), 1)   AS median_hours_early,
       ROUND(median(stop_sequence), 0)                AS median_stop_sequence,
       ROUND(median(stop_count), 0)                   AS median_events_in_trip
FROM {S}
WHERE key_row_number = 1 AND route_id = 'Red' AND NOT is_added_trip
  AND schedule_diff_sec < -10800
  AND EXTRACT(hour FROM stop_ts_local) BETWEEN 4 AND 7
GROUP BY parent_station, direction
ORDER BY n_events DESC
LIMIT 12
""")

# %% 8b. A repeatable pseudo-random sample of those events
q(f"""
SELECT service_date, trip_id, direction_destination, stop_sequence, stop_count,
       stop_ts_local,
       scheduled_arrival_ts_utc AT TIME ZONE 'America/New_York' AS scheduled_local,
       ROUND(schedule_diff_sec / 3600.0, 1) AS diff_hours
FROM {S}
WHERE key_row_number = 1 AND route_id = 'Red' AND NOT is_added_trip
  AND schedule_diff_sec < -10800
  AND EXTRACT(hour FROM stop_ts_local) BETWEEN 4 AND 7
ORDER BY hash(service_date, trip_id, stop_sequence)
LIMIT 12
""")

# %% Release the warehouse (run this when you are done)
con.close()