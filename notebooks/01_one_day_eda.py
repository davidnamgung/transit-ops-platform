# %% [markdown]
# # One day of MBTA subway data: first exploration
# Goal: understand the shape of the data before building anything on it.

# %% Setup
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import pandas as pd

# Find the project root (the folder containing pyproject.toml).
ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pyproject.toml").exists())
PATH = ROOT / "data/raw/lamp/2026-11-04.parquet"

con = duckdb.connect()
con.execute("SET TimeZone = 'America/New_York'")  # show timestamps in Boston time

# A VIEW is a saved query. "stop_events" now means "the whole file".
con.execute(f"CREATE OR REPLACE VIEW stop_events AS SELECT * FROM read_parquet('{PATH}')")


def q(sql):
    """Run a SQL query and return the result as a pandas table."""
    cur = con.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


rows = q("SELECT COUNT(*) AS n FROM stop_events").iloc[0, 0]
print(f"Setup complete. Rows in stop_events: {rows:,}")

# %% 1. How big is this day?
q("""
SELECT COUNT(*)                       AS stop_events,
       COUNT(DISTINCT trip_id)        AS trips,
       COUNT(DISTINCT vehicle_id)     AS vehicles,
       COUNT(DISTINCT parent_station) AS stations
FROM stop_events
""")

# %% 2. Which lines are in here?
q("""
SELECT route_id,
       COUNT(*)                AS stop_events,
       COUNT(DISTINCT trip_id) AS trips
FROM stop_events
GROUP BY route_id
ORDER BY stop_events DESC
""")

# %% 3. How much is missing, column by column? (percent of rows that are NULL)
cols = [
    "move_timestamp", "stop_timestamp", "travel_time_seconds", "dwell_time_seconds",
    "headway_trunk_seconds", "scheduled_travel_time", "scheduled_headway_trunk", "vehicle_id",
]
select_list = ",\n".join(
    f"ROUND(100.0 * COUNT(*) FILTER (WHERE {c} IS NULL) / COUNT(*), 1) AS {c}" for c in cols
)
q(f"SELECT {select_list} FROM stop_events").T  # .T flips rows/columns so it reads easily

# %% 4. The timestamp puzzle: when do events actually start and end?
q("""
SELECT MIN(to_timestamp(stop_timestamp)) AS first_event_local,
       MAX(to_timestamp(stop_timestamp)) AS last_event_local,
       COUNT(DISTINCT service_date)      AS distinct_service_dates
FROM stop_events
""")

# %% 5. What are the ADDED trips?
q("""
SELECT CASE WHEN trip_id LIKE 'ADDED%' THEN 'added (not in schedule?)'
            ELSE 'scheduled' END AS trip_kind,
       COUNT(DISTINCT trip_id)   AS trips,
       COUNT(*)                  AS stop_events
FROM stop_events
GROUP BY 1
""")

# %% 6. First chart: activity by hour of the day, per line
hourly = q("""
SELECT EXTRACT(hour FROM to_timestamp(stop_timestamp)) AS hour_local,
       route_id,
       COUNT(*) AS stop_events
FROM stop_events
GROUP BY 1, 2
ORDER BY 1, 2
""")
hourly.pivot(index="hour_local", columns="route_id", values="stop_events").plot(
    figsize=(10, 4), title="Stop events by local hour, 2026-11-04"
)
plt.ylabel("stop events")
plt.show()

# %% 7. Actual vs scheduled: extra travel time per line (seconds)
q("""
SELECT route_id,
       COUNT(*) AS measured_segments,
       ROUND(AVG(travel_time_seconds - scheduled_travel_time), 1)    AS avg_extra_sec,
       ROUND(MEDIAN(travel_time_seconds - scheduled_travel_time), 1) AS median_extra_sec
FROM stop_events
WHERE travel_time_seconds IS NOT NULL
  AND scheduled_travel_time IS NOT NULL
GROUP BY route_id
ORDER BY avg_extra_sec DESC
""")

# %% 8. Actual vs scheduled: time between trains (minutes)
q("""
SELECT route_id,
       ROUND(AVG(headway_trunk_seconds) / 60.0, 1)  AS avg_actual_headway_min,
       ROUND(AVG(scheduled_headway_trunk) / 60.0, 1) AS avg_scheduled_headway_min
FROM stop_events
WHERE headway_trunk_seconds IS NOT NULL
  AND scheduled_headway_trunk IS NOT NULL
GROUP BY route_id
ORDER BY route_id
""")