# %% [markdown]
# # Coverage, ADDED trips, and the excluded events
# Questions:
# A/B/C. Which line-days are missing or have no comparable events, and why?
# D/E.   What are ADDED trips, and is their share steady or concentrated?
# F.     What are the scheduled-trip events beyond 3 hours: real disruptions or artifacts?
# G.     Why do some events have unknown weather?

# %% Setup
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import pandas as pd

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pyproject.toml").exists())
con = duckdb.connect(str(ROOT / "data/warehouse/transit.duckdb"), read_only=True)
con.execute("SET TimeZone = 'UTC'")
pd.set_option("display.width", 200)
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

# %% A. Coverage by line: days present, absent, and with no comparable events
q(f"""
WITH span AS (SELECT COUNT(DISTINCT service_date) AS total_days FROM {D})
SELECT route_id,
       COUNT(*)                                  AS days_present,
       (SELECT total_days FROM span) - COUNT(*)  AS days_absent,
       COUNT(*) FILTER (WHERE n_comparable = 0)  AS days_with_zero_comparable,
       SUM(n_events)                             AS total_events
FROM {D}
GROUP BY route_id
ORDER BY route_id
""")

# %% B. When is each line absent? (consecutive missing days are grouped into one run)
# Trick: subtracting a running row number from a date gives the same value for
# every day in an unbroken streak. This pattern is called "gaps and islands".
q(f"""
WITH cal AS (SELECT DISTINCT service_date FROM {D}),
     routes AS (SELECT DISTINCT route_id FROM {D}),
     missing AS (
         SELECT r.route_id, c.service_date
         FROM routes r CROSS JOIN cal c
         LEFT JOIN {D} d ON d.route_id = r.route_id AND d.service_date = c.service_date
         WHERE d.route_id IS NULL
     ),
     numbered AS (
         SELECT *, service_date - CAST(ROW_NUMBER() OVER (
                       PARTITION BY route_id ORDER BY service_date) AS INTEGER) AS streak
         FROM missing
     )
SELECT route_id,
       MIN(service_date) AS first_missing_day,
       MAX(service_date) AS last_missing_day,
       COUNT(*)          AS n_days
FROM numbered
GROUP BY route_id, streak
ORDER BY route_id, first_missing_day
""")

# %% C. Line-days with zero comparable events, by month (counts of days)
zero = q(f"""
SELECT route_id, strftime(service_date, '%Y-%m') AS month, COUNT(*) AS days
FROM {D}
WHERE n_comparable = 0
GROUP BY ALL
""")
zero.pivot(index="month", columns="route_id", values="days").fillna(0).astype(int)

# %% D. Share of events on ADDED trips, by line and month
added = q(f"""
SELECT route_id, strftime(service_date, '%Y-%m') AS month,
       ROUND(100.0 * COUNT(*) FILTER (WHERE is_added_trip) / COUNT(*), 1) AS pct_added
FROM {E}
GROUP BY ALL
""")
p = added.pivot(index="month", columns="route_id", values="pct_added")
fig, ax = plt.subplots(figsize=(9, 5))
im = ax.imshow(p.values, aspect="auto")
ax.set_xticks(range(len(p.columns)))
ax.set_xticklabels(p.columns, rotation=45, ha="right")
ax.set_yticks(range(len(p.index)))
ax.set_yticklabels(p.index)
fig.colorbar(im, label="% of events on ADDED trips")
ax.set_title("Share of stop events on ADDED trips, by line and month")
plt.show()
p

# %% E. Do ADDED trips look like real trips? (per-trip profile; stop_count is unverified)
q(f"""
WITH t AS (
    SELECT service_date, trip_id, is_added_trip, route_id,
           COUNT(*)        AS n_events,
           MAX(stop_count) AS stop_count
    FROM {S}
    WHERE key_row_number = 1
    GROUP BY service_date, trip_id, is_added_trip, route_id
)
SELECT is_added_trip,
       COUNT(*)                                          AS trips,
       ROUND(AVG(n_events), 1)                           AS avg_events_per_trip,
       ROUND(AVG(stop_count), 1)                         AS avg_stop_count_field,
       ROUND(AVG(n_events / NULLIF(stop_count, 0)), 2)   AS avg_events_per_stop_count
FROM t
GROUP BY is_added_trip
""")

# %% F1. The excluded scheduled-trip events: by how many hours are they off?
# Spikes at exactly +-1 hour suggest a daylight-saving bug; spikes at +-24 suggest a
# service-day bug; a smooth spread suggests real disruptions or mismatched events.
q(f"""
SELECT ROUND(schedule_diff_sec / 3600.0) AS diff_hours_rounded, COUNT(*) AS n_events
FROM {E}
WHERE NOT is_added_trip AND schedule_diff_sec IS NOT NULL AND NOT is_schedule_comparable
GROUP BY 1
ORDER BY 1
""")

# %% F2. Which days and lines hold the most excluded events?
q(f"""
SELECT service_date, dayname(service_date) AS weekday, route_id,
       COUNT(*) AS n_excluded,
       ROUND(median(schedule_diff_sec / 60.0), 0) AS median_diff_min
FROM {E}
WHERE NOT is_added_trip AND schedule_diff_sec IS NOT NULL AND NOT is_schedule_comparable
GROUP BY ALL
ORDER BY n_excluded DESC
LIMIT 15
""")

# %% F3. Excluded events by line
q(f"""
SELECT route_id,
       COUNT(*) AS n_excluded,
       COUNT(*) FILTER (WHERE schedule_diff_sec > 0) AS n_later_than_schedule,
       COUNT(*) FILTER (WHERE schedule_diff_sec < 0) AS n_earlier_than_schedule
FROM {E}
WHERE NOT is_added_trip AND schedule_diff_sec IS NOT NULL AND NOT is_schedule_comparable
GROUP BY route_id
ORDER BY n_excluded DESC
""")

# %% G. Why is weather unknown for 1% of events?
q(f"""
SELECT CASE WHEN stop_ts_utc IS NULL THEN 'no stop timestamp'
            WHEN service_date = (SELECT MAX(service_date) FROM {E}) THEN 'last service day'
            ELSE 'other' END AS reason,
       COUNT(*) AS n_events
FROM {E}
WHERE weather_category = 'unknown'
GROUP BY 1
ORDER BY 2 DESC
""")

# %% Release the warehouse (run this when you are done)
con.close()