# %% [markdown]
# # Verifying the trip_kind rule
# 1. What trip-ID prefixes exist? (Are there kinds besides ADDED and NONREV?)
# 2. Of the events the old 3-hour rule excluded, which prefix were they?
# 3. After the new rule, what remains far from schedule?
# 4. Do non-revenue trips distort headways?
# 5. What happened on Oct 31 - Nov 1, 2026?
# 6. Which service dates are missing from the warehouse?
# 7. Duplicate keys: what differs inside each group? (still outstanding)

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

# %% 1. Every trip-ID prefix in the data (letters before the first dash)
q(f"""
SELECT COALESCE(NULLIF(regexp_extract(trip_id, '^([A-Za-z_]+)', 1), ''), '(digits only)') AS id_prefix,
       COUNT(DISTINCT CAST(service_date AS VARCHAR) || trip_id) AS trips,
       COUNT(*) AS events
FROM {S}
WHERE key_row_number = 1
GROUP BY 1
ORDER BY events DESC
""")

# %% 2. The events the OLD rule excluded (non-ADDED, beyond 3h): which prefix, which line?
q(f"""
SELECT COALESCE(NULLIF(regexp_extract(trip_id, '^([A-Za-z_]+)', 1), ''), '(digits only)') AS id_prefix,
       route_id,
       COUNT(*) AS events_beyond_3h
FROM {S}
WHERE key_row_number = 1 AND NOT is_added_trip
  AND schedule_diff_sec IS NOT NULL AND ABS(schedule_diff_sec) > 10800
GROUP BY ALL
ORDER BY events_beyond_3h DESC
""")

# %% 3. After the new rule: scheduled-trip events still far from schedule, by line
q(f"""
SELECT route_id,
       COUNT(*) FILTER (WHERE ABS(schedule_diff_sec) > 10800)           AS beyond_3h,
       COUNT(*) FILTER (WHERE ABS(schedule_diff_sec) > 43200)           AS beyond_12h_excluded,
       COUNT(*) FILTER (WHERE schedule_diff_sec > 10800)                AS late_beyond_3h,
       COUNT(*) FILTER (WHERE schedule_diff_sec < -10800)               AS early_beyond_3h,
       COUNT(DISTINCT service_date) FILTER (WHERE ABS(schedule_diff_sec) > 10800) AS days_affected
FROM {E}
WHERE trip_kind = 'scheduled' AND schedule_diff_sec IS NOT NULL
GROUP BY route_id
ORDER BY beyond_3h DESC
""")

# %% 4. Headways by trip kind: do non-revenue trips distort the gaps?
q(f"""
SELECT trip_kind,
       COUNT(*)                                           AS n_events,
       ROUND(100.0 * COUNT(headway_ratio) / COUNT(*), 1)  AS pct_with_headway,
       ROUND(quantile_cont(headway_ratio, 0.5), 2)        AS median_ratio,
       ROUND(quantile_cont(headway_ratio, 0.9), 2)        AS p90_ratio,
       ROUND(100.0 * AVG(CAST(headway_ratio > 1.5 AS INTEGER)), 2) AS pct_over_1_5x
FROM {E}
GROUP BY trip_kind
ORDER BY trip_kind
""")

# %% 5. Oct 30 - Nov 2: what changed on the Halloween weekend?
q(f"""
SELECT service_date, dayname(service_date) AS weekday, route_id,
       n_events, n_added_events, n_nonrevenue_events, n_comparable, pct_events_comparable
FROM {D}
WHERE service_date BETWEEN DATE '2026-10-30' AND DATE '2026-11-02'
ORDER BY service_date, route_id
""")

# %% 6. Service dates missing from the warehouse (computed in Python: simplest)
have = q(f"SELECT DISTINCT service_date FROM {S}")["service_date"]
all_days = pd.date_range(have.min(), have.max()).date
missing = sorted(set(all_days) - set(have))
print(f"{len(have)} dates present, {len(missing)} missing between {have.min()} and {have.max()}")
pd.DataFrame({"missing_date": missing, "weekday": [d.strftime("%A") for d in missing]})

# %% 7. Duplicate keys: what differs inside each duplicate group?
q(f"""
WITH dups AS (
    SELECT service_date, trip_id, stop_sequence,
           COUNT(*)                    AS n_rows,
           COUNT(DISTINCT vehicle_id)  AS n_vehicles,
           COUNT(DISTINCT stop_id)     AS n_stop_ids,
           COUNT(DISTINCT stop_ts_utc) AS n_timestamps
    FROM {S}
    GROUP BY ALL
    HAVING COUNT(*) > 1
)
SELECT n_rows, n_vehicles, n_stop_ids, n_timestamps, COUNT(*) AS groups
FROM dups
GROUP BY ALL
ORDER BY groups DESC
""")

# %% Release the warehouse (run this when you are done)
con.close()