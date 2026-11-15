# %% [markdown]
# # Follow-up questions from notebook 03
# 1. Are the "very early" Red/Orange events overnight movements?
# 2. Do the Blue "very late" days line up with severe weather?
# 3. Could the 1-hour daylight-saving shift hide inside the comparable events?
# 4. When did ADDED-trip surges start and stop, and do they line up with
#    schedule (GTFS) updates?

# %% Setup
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import pandas as pd
import requests

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pyproject.toml").exists())
con = duckdb.connect(str(ROOT / "data/warehouse/transit.duckdb"), read_only=True)
con.execute("SET TimeZone = 'UTC'")
pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 50)
pd.set_option("display.max_rows", 100)

E = "intermediate.int_stop_events_weather"
D = "marts.mart_daily_line_reliability"


def q(sql):
    """Run SQL and return a pandas table."""
    cur = con.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


print(f"Setup complete. Rows: {q(f'SELECT COUNT(*) AS n FROM {E}').iloc[0, 0]:,}")

# %% 1. Hour of day (Boston time) of events more than 3h EARLIER than schedule
# If they cluster in the small hours, they are probably overnight movements
# carrying scheduled trip IDs, not passenger delays.
early = q(f"""
SELECT route_id, hour_local,
       COUNT(*) FILTER (WHERE NOT is_added_trip AND schedule_diff_sec < -10800) AS n_very_early,
       COUNT(*) AS n_events
FROM {E}
WHERE route_id IN ('Red', 'Orange') AND hour_local IS NOT NULL
GROUP BY ALL
""")
early["pct_very_early"] = (100 * early.n_very_early / early.n_events).round(2)
p = early.pivot(index="hour_local", columns="route_id", values="pct_very_early")
p.plot(kind="bar", figsize=(10, 4), title="% of events >3h EARLIER than schedule, by local hour")
plt.ylabel("% of events")
plt.show()
p

# %% 2a. The Blue Line stress days: how much service ran, and what was the weather?
q(f"""
WITH typical AS (SELECT route_id, median(n_events) AS typical_events FROM {D} GROUP BY route_id)
SELECT d.service_date, dayname(d.service_date) AS weekday, d.route_id,
       d.n_events, ROUND(d.n_events / t.typical_events, 2) AS events_vs_typical,
       d.n_comparable, d.n_very_late_events, d.median_schedule_diff_min,
       d.total_snow_cm, d.total_precip_mm, d.max_gust_kmh
FROM {D} d JOIN typical t USING (route_id)
WHERE d.service_date IN (DATE '2026-01-26', DATE '2026-01-27', DATE '2026-01-28', DATE '2026-02-23')
ORDER BY d.service_date, d.route_id
""")

# %% 2b. Snowiest days of the year (does the list include those four dates?)
q(f"""
SELECT service_date, dayname(service_date) AS weekday, MAX(total_snow_cm) AS snow_cm
FROM {D}
GROUP BY service_date
ORDER BY snow_cm DESC
LIMIT 10
""")

# %% 2c. Days with the most "very late" events across all lines, with that day's snowfall
q(f"""
SELECT service_date, dayname(service_date) AS weekday,
       SUM(n_very_late_events) AS very_late_events,
       MAX(total_snow_cm) AS snow_cm,
       MAX(max_gust_kmh)  AS max_gust_kmh
FROM {D}
GROUP BY service_date
ORDER BY very_late_events DESC
LIMIT 10
""")

# %% 3a. Daylight saving. Clocks changed on 2026-03-08 and 2026-11-01 (both Sundays).
# A 1-hour conversion error would shift the median by about +-60 minutes on those days only.
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

# %% 3b. For reference: the typical median by weekday over the whole year
q(f"""
SELECT dayname(service_date) AS weekday,
       ROUND(median(schedule_diff_sec / 60.0) FILTER (WHERE is_schedule_comparable), 2)
           AS typical_median_min
FROM {E}
GROUP BY 1
ORDER BY 1
""")

# %% 4a. The Red Line July episode, day by day
q(f"""
SELECT service_date, dayname(service_date) AS weekday,
       COUNT(*) AS n_events,
       ROUND(100.0 * COUNT(*) FILTER (WHERE is_added_trip) / COUNT(*), 1) AS pct_added
FROM {E}
WHERE route_id = 'Red' AND service_date BETWEEN DATE '2026-06-20' AND DATE '2026-08-10'
GROUP BY service_date
ORDER BY service_date
""")

# %% 4b. Schedule (GTFS) versions: download the small feed_info files for 2025 and 2026
gtfs_dir = ROOT / "data/raw/lamp_gtfs"
gtfs_dir.mkdir(parents=True, exist_ok=True)
for year in (2025, 2026):
    dest = gtfs_dir / f"feed_info_{year}.parquet"
    if not dest.exists():  # skip if we already have it
        r = requests.get(
            f"https://performancedata.mbta.com/lamp/gtfs_archive/{year}/feed_info.parquet",
            timeout=60,
        )
        r.raise_for_status()
        dest.write_bytes(r.content)

feeds = q(f"""
SELECT feed_version, feed_start_date, feed_end_date, gtfs_active_date, gtfs_end_date
FROM read_parquet('{gtfs_dir}/feed_info_*.parquet', union_by_name = true)
WHERE gtfs_active_date >= 20251101
ORDER BY gtfs_active_date
""")
print(f"{len(feeds)} schedule versions became active in our window")
feeds

# %% 4c. ADDED-trip share by day, with vertical lines where a new schedule took effect
daily_added = q(f"""
SELECT service_date, route_id,
       100.0 * COUNT(*) FILTER (WHERE is_added_trip) / COUNT(*) AS pct_added
FROM {E}
GROUP BY ALL
ORDER BY service_date
""")
daily_added["service_date"] = pd.to_datetime(daily_added["service_date"])

fig, ax = plt.subplots(figsize=(12, 5))
for route in ["Red", "Orange", "Blue", "Green-D"]:
    s = daily_added[daily_added.route_id == route]
    ax.plot(s.service_date, s.pct_added, label=route, linewidth=1)
for d in pd.to_datetime(feeds["gtfs_active_date"].astype(str), format="%Y%m%d"):
    ax.axvline(d, color="grey", alpha=0.3, linewidth=0.8)
ax.set_ylabel("% of events on ADDED trips")
ax.set_title("ADDED-trip share by day (grey lines: a new schedule version became active)")
ax.legend()
plt.show()

# %% Release the warehouse (run this when you are done)
con.close()