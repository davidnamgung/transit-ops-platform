# %% [markdown]
# # Investigating the two staging warnings
# A. Duplicate (trip, stop_sequence) rows: what are they?
# B. Actual vs scheduled times more than 3 hours apart: where do they come from?

# %% Setup
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import pandas as pd

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pyproject.toml").exists())
# read_only=True: we are only looking, so we cannot damage the warehouse.
con = duckdb.connect(str(ROOT / "data/warehouse/transit.duckdb"), read_only=True)
con.execute("SET TimeZone = 'UTC'")
pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 50)

E = "staging.stg_lamp_stop_events"


def q(sql):
    """Run SQL and return a pandas table."""
    cur = con.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


print(f"Setup complete. Rows: {q(f'SELECT COUNT(*) AS n FROM {E}').iloc[0, 0]:,}")

# %% A1. What differs inside each duplicate group?
# If n_vehicles, n_stop_ids and n_timestamps are all 1, the rows are exact copies.
q(f"""
WITH dups AS (
    SELECT service_date, trip_id, stop_sequence,
           COUNT(*)                    AS n_rows,
           COUNT(DISTINCT vehicle_id)  AS n_vehicles,
           COUNT(DISTINCT stop_id)     AS n_stop_ids,
           COUNT(DISTINCT stop_ts_utc) AS n_timestamps,
           COUNT(DISTINCT route_id)    AS n_routes
    FROM {E}
    GROUP BY service_date, trip_id, stop_sequence
    HAVING COUNT(*) > 1
)
SELECT n_rows, n_vehicles, n_stop_ids, n_timestamps, n_routes, COUNT(*) AS groups
FROM dups
GROUP BY ALL
ORDER BY groups DESC
""")

# %% A2. Look at one duplicate group side by side (columns 0 and 1 are the two rows)
q(f"""
SELECT * FROM {E}
WHERE service_date = DATE '2026-01-07' AND trip_id = '73220984' AND stop_sequence = 570
""").T

# %% A3. Where do duplicates concentrate?
q(f"""
WITH dups AS (
    SELECT service_date, trip_id, stop_sequence FROM {E}
    GROUP BY service_date, trip_id, stop_sequence HAVING COUNT(*) > 1
)
SELECT e.route_id, e.parent_station, e.stop_sequence, COUNT(*) AS rows_in_dup_groups
FROM {E} e
JOIN dups d ON e.service_date = d.service_date
           AND e.trip_id = d.trip_id
           AND e.stop_sequence = d.stop_sequence
GROUP BY ALL
ORDER BY rows_in_dup_groups DESC
LIMIT 10
""")

# %% B0. What does LAMP's "service day" mean? Early-morning events by calendar day
# 'same day' = the event's calendar date equals its service_date.
q(f"""
SELECT CASE WHEN CAST(stop_ts_local AS DATE) = service_date
            THEN 'same day' ELSE 'next day' END AS event_calendar_day,
       EXTRACT(hour FROM stop_ts_local)         AS hour_local,
       is_added_trip,
       COUNT(*)                                 AS n_events
FROM {E}
WHERE stop_ts_local IS NOT NULL AND EXTRACT(hour FROM stop_ts_local) < 6
GROUP BY ALL
ORDER BY event_calendar_day, hour_local, is_added_trip
""")

# %% B1. Distribution of (actual - scheduled) in minutes: ADDED vs scheduled trips
q(f"""
WITH d AS (
    SELECT is_added_trip,
           (epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)) / 60.0 AS diff_min
    FROM {E}
    WHERE stop_ts_utc IS NOT NULL
)
SELECT is_added_trip,
       COUNT(*)                                                           AS n_events,
       ROUND(100.0 * COUNT(diff_min) / COUNT(*), 1)                       AS pct_with_schedule,
       ROUND(quantile_cont(diff_min, 0.05), 1)                            AS p05_min,
       ROUND(quantile_cont(diff_min, 0.25), 1)                            AS p25_min,
       ROUND(quantile_cont(diff_min, 0.50), 1)                            AS median_min,
       ROUND(quantile_cont(diff_min, 0.75), 1)                            AS p75_min,
       ROUND(quantile_cont(diff_min, 0.95), 1)                            AS p95_min,
       ROUND(100.0 * COUNT(*) FILTER (WHERE ABS(diff_min) > 180)
                   / NULLIF(COUNT(diff_min), 0), 2)                       AS pct_beyond_3h
FROM d
GROUP BY is_added_trip
""")

# %% B2. Share of events beyond 3 hours, by local hour of day
by_hour = q(f"""
SELECT EXTRACT(hour FROM stop_ts_local) AS hour_local,
       is_added_trip,
       COUNT(*) AS n_events,
       ROUND(100.0 * COUNT(*) FILTER (
           WHERE ABS(epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)) > 10800
       ) / COUNT(*), 2) AS pct_beyond_3h
FROM {E}
WHERE stop_ts_utc IS NOT NULL AND scheduled_arrival_ts_utc IS NOT NULL
GROUP BY ALL
ORDER BY hour_local, is_added_trip
""")
pivot = by_hour.pivot(index="hour_local", columns="is_added_trip", values="pct_beyond_3h")
pivot.columns = ["scheduled trips" if not c else "ADDED trips" for c in pivot.columns]
pivot.plot(kind="bar", figsize=(11, 4), title="% of events more than 3h from schedule, by hour")
plt.ylabel("% of events")
plt.show()
by_hour

# %% B3. Which dates are worst? (scheduled trips only)
q(f"""
SELECT service_date,
       dayname(service_date) AS weekday,
       COUNT(*) AS n_events,
       COUNT(*) FILTER (WHERE ABS(epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)) > 10800)
           AS n_beyond_3h,
       ROUND(100.0 * COUNT(*) FILTER (
           WHERE ABS(epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)) > 10800
       ) / COUNT(*), 1) AS pct_beyond_3h
FROM {E}
WHERE stop_ts_utc IS NOT NULL AND scheduled_arrival_ts_utc IS NOT NULL AND NOT is_added_trip
GROUP BY service_date
ORDER BY pct_beyond_3h DESC
LIMIT 10
""")

# %% B4. A spread-out sample of beyond-3h rows from scheduled (non-ADDED) trips
q(f"""
SELECT service_date, dayname(service_date) AS weekday, route_id, trip_id, direction,
       parent_station, stop_sequence, stop_ts_local,
       scheduled_arrival_ts_utc AT TIME ZONE 'America/New_York' AS scheduled_local,
       ROUND((epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)) / 60.0) AS diff_min
FROM {E}
WHERE stop_ts_utc IS NOT NULL AND scheduled_arrival_ts_utc IS NOT NULL AND NOT is_added_trip
  AND ABS(epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)) > 10800
ORDER BY hash(service_date, trip_id, stop_sequence)   -- pseudo-random but repeatable
LIMIT 12
""")
# %%
