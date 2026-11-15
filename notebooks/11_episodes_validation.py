# %% [markdown]
# # Validating alert kinds, day types, and episodes (v1)
# 1-3. Do the finer alert kinds look right?   4. Long closures vs ADDED-heavy days
# 5.   Are the thresholds sensible?          6. Day types by line
# 7-8. Episode list and known cases          9. Did Green service rise in August?

# %% Setup
from pathlib import Path

import duckdb
import pandas as pd

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pyproject.toml").exists())
con = duckdb.connect(str(ROOT / "data/warehouse/transit.duckdb"), read_only=True)
con.execute("SET TimeZone = 'UTC'")
pd.set_option("display.width", 240)
pd.set_option("display.max_columns", 50)
pd.set_option("display.max_rows", 120)
pd.set_option("display.max_colwidth", 110)

C = "intermediate.int_alerts_classified"
LINES = "['Red','Orange','Blue','Green-B','Green-C','Green-D','Green-E','Mattapan']"
WINDOW = "start_ts_utc >= TIMESTAMPTZ '2025-11-08' AND start_ts_utc < TIMESTAMPTZ '2026-11-08'"


def q(sql):
    """Run SQL and return a pandas table."""
    cur = con.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


print("Setup complete. Episodes:", q("SELECT COUNT(*) AS n FROM marts.mart_line_episodes").iloc[0, 0])

# %% 1. Alert kinds in our window, on our lines
q(f"""
SELECT alert_kind, COUNT(*) AS alerts,
       ROUND(median(duration_sec) / 3600.0, 1) AS median_hours,
       ROUND(quantile_cont(duration_sec, 0.9) / 3600.0, 1) AS p90_hours
FROM {C} WHERE {WINDOW} AND list_has_any(route_ids, {LINES})
GROUP BY alert_kind ORDER BY alerts DESC
""")

# %% 2. Three sample headers per kind
q(f"""
SELECT alert_kind, LEFT(header, 115) AS header
FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY alert_kind ORDER BY hash(alert_id)) AS rn
      FROM {C} WHERE {WINDOW} AND list_has_any(route_ids, {LINES}))
WHERE rn <= 3 ORDER BY alert_kind, rn
""")

# %% 3. What is still in "other"?
q(f"""
SELECT effect, ROUND(duration_sec / 3600.0, 1) AS hours, LEFT(header, 115) AS header
FROM {C}
WHERE {WINDOW} AND list_has_any(route_ids, {LINES}) AND alert_kind = 'other'
ORDER BY hash(alert_id) LIMIT 20
""")

# %% 4. Long closures (stop-skips now excluded) vs ADDED-heavy days
q("""
SELECT CASE WHEN pct_added >= 90 THEN '1: 90%+ ADDED'
            WHEN pct_added <  20 THEN '3: normal (<20% ADDED)'
            ELSE '2: in between' END                                            AS day_type,
       COUNT(*)                                                                 AS line_days,
       COUNT(*) FILTER (WHERE n_long_service_change_alerts > 0)                 AS with_long_closure_alert,
       ROUND(100.0 * COUNT(*) FILTER (WHERE n_long_service_change_alerts > 0) / COUNT(*), 1) AS pct
FROM marts.mart_line_day_context GROUP BY 1 ORDER BY 1
""")

# %% 5. Are the thresholds sensible? Distribution per line
q("""
SELECT route_id,
       ROUND(quantile_cont(pct_headways_over_1_5x, 0.50), 1) AS long_gaps_p50,
       ROUND(quantile_cont(pct_headways_over_1_5x, 0.90), 1) AS long_gaps_p90,
       ROUND(quantile_cont(pct_headways_over_1_5x, 0.95), 1) AS long_gaps_p95,
       COUNT(*) FILTER (WHERE pct_headways_over_1_5x >= 40)  AS days_over_40pct,
       ROUND(quantile_cont(volume_vs_typical, 0.05), 2)      AS volume_p05,
       COUNT(*) FILTER (WHERE volume_vs_typical < 0.6)       AS days_volume_under_60pct
FROM marts.mart_line_day_context GROUP BY route_id ORDER BY route_id
""")

# %% 6. Day types by line
q("""
SELECT route_id,
       COUNT(*) FILTER (WHERE day_type = 'normal')                AS normal,
       COUNT(*) FILTER (WHERE day_type = 'planned_closure')       AS planned_closure,
       COUNT(*) FILTER (WHERE day_type = 'disruption')            AS disruption,
       COUNT(*) FILTER (WHERE day_type = 'schedule_matching_gap') AS matching_gap
FROM marts.mart_line_day_context GROUP BY route_id ORDER BY route_id
""")

# %% 7. The 40 longest episodes
q("""
SELECT route_id, episode_type, start_date, end_date, n_days, avg_volume_vs_typical AS vol,
       avg_pct_added AS pct_added, avg_pct_long_gaps AS long_gaps, LEFT(label, 70) AS label
FROM marts.mart_line_episodes ORDER BY n_days DESC, start_date LIMIT 40
""")

# %% 8. Known cases: episodes that overlap windows we already understand
q("""
SELECT route_id, episode_type, start_date, end_date, n_days, avg_volume_vs_typical AS vol,
       avg_pct_added AS pct_added, avg_pct_long_gaps AS long_gaps, LEFT(label, 70) AS label
FROM marts.mart_line_episodes
WHERE (route_id = 'Red'     AND start_date <= DATE '2026-08-02' AND end_date >= DATE '2026-07-01')
   OR (route_id = 'Red'     AND start_date <= DATE '2026-02-03' AND end_date >= DATE '2026-01-22')
   OR (route_id = 'Blue'    AND start_date <= DATE '2026-02-03' AND end_date >= DATE '2026-01-22')
   OR (route_id LIKE 'Green%' AND start_date <= DATE '2026-11-02' AND end_date >= DATE '2026-10-30')
   OR (route_id LIKE 'Green%' AND start_date <= DATE '2026-08-31' AND end_date >= DATE '2026-08-20')
ORDER BY route_id, start_date
""")

# %% 9. Did Green service rise while the Orange Line was suspended? (Aug 21-31)
q("""
SELECT service_date, dayname(service_date) AS weekday, route_id, n_events,
       volume_vs_typical, pct_added, day_type
FROM marts.mart_line_day_context
WHERE route_id IN ('Orange', 'Green-B', 'Green-D', 'Green-E')
  AND service_date BETWEEN DATE '2026-08-21' AND DATE '2026-08-31'
ORDER BY service_date, route_id
""")

# %% Release the warehouse (run this when you are done)
con.close()