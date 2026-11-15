# %% [markdown]
# # Exploring the LAMP alerts history
# Goal: understand the structure before building an "episodes" model.
# 1. What is one row? 2. Time coverage. 3. Lines and effects in our window.
# 4. Do alerts explain the episodes we found? 5. Do the step-14 tables look right?

# %% Setup
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import duckdb
import pandas as pd

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pyproject.toml").exists())
ALERTS = ROOT / "data/raw/alerts/LAMP_RT_ALERTS.parquet"
con = duckdb.connect()  # in memory: does not touch the warehouse
con.execute("SET TimeZone = 'UTC'")
pd.set_option("display.width", 220)
pd.set_option("display.max_columns", 50)
pd.set_option("display.max_rows", 100)
pd.set_option("display.max_colwidth", 120)

# Columns with dots in their names must be quoted. We give them clean names in a view.
con.execute(f"""
CREATE VIEW alerts AS
SELECT id AS alert_id, cause, effect, effect_detail, severity, severity_level, alert_lifecycle,
       "header_text.translation.text"  AS header,
       created_timestamp, last_modified_timestamp, closed_timestamp,
       "active_period.start_timestamp" AS start_ts,
       "active_period.end_timestamp"   AS end_ts,
       "informed_entity.route_id"      AS route_id,
       "informed_entity.route_type"    AS route_type,
       "informed_entity.stop_id"       AS stop_id
FROM read_parquet('{ALERTS}')
""")

ROUTES = "'Red','Orange','Blue','Green-B','Green-C','Green-D','Green-E','Mattapan'"


def q(sql):
    """Run SQL on the alerts and return a pandas table."""
    cur = con.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


def epoch(day, end=False):
    """Boston midnight at the start (or end) of a day, as Unix seconds."""
    t = datetime.fromisoformat(day) + (timedelta(days=1) if end else timedelta(0))
    return int(t.replace(tzinfo=ZoneInfo("America/New_York")).timestamp())


LO, HI = epoch("2025-11-08"), epoch("2026-11-07", end=True)  # our data window
IN_WINDOW = f"start_ts < {HI} AND COALESCE(end_ts, 9999999999) > {LO}"
print("Setup complete. Alert rows:", q("SELECT COUNT(*) AS n FROM alerts").iloc[0, 0])

# %% 1a. Rows versus distinct alerts versus versions
q("""
SELECT COUNT(*)                                         AS row_count,
       COUNT(DISTINCT alert_id)                         AS distinct_alerts,
       ROUND(1.0 * COUNT(*) / COUNT(DISTINCT alert_id), 1) AS avg_rows_per_alert,
       COUNT(DISTINCT (alert_id, last_modified_timestamp))  AS alert_versions
FROM alerts
""")

# %% 1b. What makes an alert span many rows?
q("""
WITH per AS (
    SELECT alert_id, COUNT(*) AS n_rows,
           COUNT(DISTINCT last_modified_timestamp) AS n_versions,
           COUNT(DISTINCT route_id)                AS n_routes,
           COUNT(DISTINCT stop_id)                 AS n_stops,
           COUNT(DISTINCT start_ts)                AS n_periods
    FROM alerts GROUP BY alert_id
)
SELECT median(n_rows)                 AS median_rows,
       quantile_cont(n_rows, 0.9)     AS p90_rows,
       MAX(n_rows)                    AS max_rows,
       ROUND(100.0 * AVG(CAST(n_versions > 1 AS INTEGER)), 1) AS pct_alerts_with_multiple_versions,
       ROUND(100.0 * AVG(CAST(n_routes > 1 AS INTEGER)), 1)   AS pct_alerts_with_multiple_routes,
       ROUND(100.0 * AVG(CAST(n_periods > 1 AS INTEGER)), 1)  AS pct_alerts_with_multiple_periods
FROM per
""")

# %% 2. Time coverage: alerts created per year
q("""
SELECT EXTRACT(year FROM to_timestamp(created_timestamp)) AS year_created,
       COUNT(DISTINCT alert_id) AS alerts
FROM alerts GROUP BY 1 ORDER BY 1
""")

# %% 3a. Alerts active in our window, by line (including alerts tagged only by route type)
q(f"""
SELECT COALESCE(route_id, '(no route id)') AS route_id, COUNT(DISTINCT alert_id) AS alerts
FROM alerts
WHERE {IN_WINDOW} AND (route_id IN ({ROUTES}) OR route_type IN (0, 1))
GROUP BY 1 ORDER BY 2 DESC
""")

# %% 3b. Effects and severity levels on our lines in the window
q(f"""
SELECT effect, severity_level, COUNT(DISTINCT alert_id) AS alerts
FROM alerts
WHERE {IN_WINDOW} AND route_id IN ({ROUTES})
GROUP BY ALL ORDER BY alerts DESC LIMIT 25
""")

# %% 4. Do alerts explain the episodes we found? (highest-severity alerts first)
def probe(title, route, start, end, limit=8):
    lo, hi = epoch(start), epoch(end, end=True)
    df = q(f"""
        SELECT alert_id, effect, severity,
               to_timestamp(MIN(start_ts)) AT TIME ZONE 'America/New_York' AS starts_local,
               to_timestamp(MAX(end_ts))   AT TIME ZONE 'America/New_York' AS ends_local,
               LEFT(ANY_VALUE(header), 110) AS header
        FROM alerts
        WHERE route_id = '{route}' AND start_ts < {hi} AND COALESCE(end_ts, 9999999999) > {lo}
        GROUP BY alert_id, effect, severity
        ORDER BY severity DESC, starts_local
        LIMIT {limit}""")
    print(f"\n=== {title} ===")
    print(df.to_string(index=False) if len(df) else "(no alerts found)")


probe("Red Line partial closure, Jul 21-30 2026", "Red", "2026-07-21", "2026-07-30")
probe("Green-D, Halloween weekend Oct 31 - Nov 1 2026", "Green-D", "2026-10-31", "2026-11-01")
probe("Blue Line storm, Jan 25-28 2026", "Blue", "2026-01-25", "2026-01-28")
probe("Red Line storm aftermath, Jan 25-28 2026", "Red", "2026-01-25", "2026-01-28")
probe("Blue Line storm, Feb 23 2026", "Blue", "2026-02-23", "2026-02-23")

# %% 5. Do the step-14 tables look right?
wh = duckdb.connect(str(ROOT / "data/warehouse/transit.duckdb"), read_only=True)
wh.execute("SET TimeZone = 'UTC'")


def w(sql):
    """Run SQL on the warehouse and return a pandas table."""
    cur = wh.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


print(w("SELECT COUNT(*) AS stations FROM staging.stg_stations").to_string(index=False))
print(w("SELECT * FROM staging.stg_stations ORDER BY station_name LIMIT 6").to_string(index=False))
print(w("""SELECT COUNT(*) AS hours, COUNT(snow_24h_cm) AS with_24h, COUNT(snow_72h_cm) AS with_72h,
                 MAX(snow_72h_cm) AS max_72h_snow_cm
          FROM intermediate.int_hourly_weather_features""").to_string(index=False))
print(w("""SELECT COUNT(*) AS line_days_without_schedule_comparison,
                 COUNT(*) FILTER (WHERE n_headways >= 100)      AS with_100plus_headways,
                 COUNT(*) FILTER (WHERE COALESCE(n_headways, 0) = 0) AS with_no_headways
          FROM marts.mart_daily_line_reliability WHERE n_comparable = 0""").to_string(index=False))

# %% Release the warehouse (run this when you are done)
wh.close()
con.close()