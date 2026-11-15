# %% [markdown]
# # Alert kinds and line-day alert features
# 1-3. Do the kinds look right? What lands in "other"?
# 4.   Long service-change alerts versus ADDED-heavy days
# 5.   The ADDED-heavy days still unexplained
# 6.   Do days with more delay alerts show worse measured service?
# 7.   Blue and Red storm: alerts versus measurements

# %% Setup
from pathlib import Path

import duckdb
import pandas as pd

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pyproject.toml").exists())
con = duckdb.connect(str(ROOT / "data/warehouse/transit.duckdb"), read_only=True)
con.execute("SET TimeZone = 'UTC'")
pd.set_option("display.width", 230)
pd.set_option("display.max_columns", 50)
pd.set_option("display.max_rows", 100)
pd.set_option("display.max_colwidth", 130)

C = "intermediate.int_alerts_classified"
LINES = "['Red','Orange','Blue','Green-B','Green-C','Green-D','Green-E','Mattapan']"
WINDOW = "start_ts_utc >= TIMESTAMPTZ '2025-11-08' AND start_ts_utc < TIMESTAMPTZ '2026-11-08'"


def q(sql):
    """Run SQL and return a pandas table."""
    cur = con.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


print("Setup complete. Classified alerts:", q(f"SELECT COUNT(*) AS n FROM {C}").iloc[0, 0])

# %% 1. Alert kinds in our window, on our lines
q(f"""
SELECT alert_kind, COUNT(*) AS alerts,
       ROUND(median(duration_sec) / 3600.0, 1)                  AS median_hours,
       ROUND(quantile_cont(duration_sec, 0.9) / 3600.0, 1)      AS p90_hours,
       ROUND(AVG(peak_severity), 1)                             AS avg_peak_severity
FROM {C}
WHERE {WINDOW} AND list_has_any(route_ids, {LINES})
GROUP BY alert_kind ORDER BY alerts DESC
""")

# %% 2. Four sample headers per kind (repeatable pseudo-random sample)
q(f"""
SELECT alert_kind, LEFT(header, 125) AS header
FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY alert_kind ORDER BY hash(alert_id)) AS rn
      FROM {C} WHERE {WINDOW} AND list_has_any(route_ids, {LINES}))
WHERE rn <= 4
ORDER BY alert_kind, rn
""")

# %% 3. What is in "other"? (30 samples, to refine the rules)
q(f"""
SELECT effect, ROUND(peak_severity) AS sev, ROUND(duration_sec / 3600.0, 1) AS hours,
       LEFT(header, 120) AS header
FROM {C}
WHERE {WINDOW} AND list_has_any(route_ids, {LINES}) AND alert_kind = 'other'
ORDER BY hash(alert_id) LIMIT 30
""")

# %% 4. ADDED-heavy line-days versus normal days: any LONG service-change alert that day?
q("""
SELECT CASE WHEN d.n_added_events >= 0.9 * d.n_events THEN '1: 90%+ ADDED'
            WHEN d.n_added_events <  0.2 * d.n_events THEN '3: normal (<20% ADDED)'
            ELSE '2: in between' END                                        AS day_type,
       COUNT(*)                                                             AS line_days,
       COUNT(*) FILTER (WHERE l.n_long_service_change_alerts > 0)           AS with_long_alert,
       ROUND(100.0 * COUNT(*) FILTER (WHERE l.n_long_service_change_alerts > 0) / COUNT(*), 1) AS pct
FROM marts.mart_daily_line_reliability d
JOIN intermediate.int_line_day_alerts l USING (service_date, route_id)
GROUP BY 1 ORDER BY 1
""")

# %% 5. 90%+ ADDED line-days with NO long service-change alert: what else overlaps?
q(f"""
WITH unexplained AS (
    SELECT d.service_date, d.route_id, ROUND(100.0 * d.n_added_events / d.n_events, 1) AS pct_added
    FROM marts.mart_daily_line_reliability d
    JOIN intermediate.int_line_day_alerts l USING (service_date, route_id)
    WHERE d.n_added_events >= 0.9 * d.n_events AND l.n_long_service_change_alerts = 0
)
SELECT u.service_date, dayname(u.service_date) AS weekday, u.route_id, u.pct_added,
       COUNT(DISTINCT c.alert_id)                                              AS other_alerts,
       LEFT(ANY_VALUE(c.header), 100)                                          AS example_header
FROM unexplained u
LEFT JOIN {C} c
       ON list_contains(c.route_ids, u.route_id)
      AND c.alert_kind IN ('short_service_change', 'service_change_open_ended', 'other')
      AND c.start_ts_utc < CAST(u.service_date + 1 AS TIMESTAMP) AT TIME ZONE 'America/New_York'
      AND COALESCE(c.effective_end_utc, TIMESTAMPTZ '2999-01-01')
          > CAST(u.service_date AS TIMESTAMP) AT TIME ZONE 'America/New_York'
GROUP BY u.service_date, u.route_id, u.pct_added
ORDER BY u.service_date, u.route_id
""")

# %% 6. Do days with more delay alerts show worse measured service?
q("""
SELECT CASE WHEN l.n_delay_alerts = 0 THEN '0'
            WHEN l.n_delay_alerts <= 2 THEN '1-2'
            WHEN l.n_delay_alerts <= 5 THEN '3-5'
            ELSE '6+' END                                         AS delay_alerts_that_day,
       COUNT(*)                                                   AS line_days,
       ROUND(median(d.pct_headways_over_1_5x), 1)                 AS median_pct_long_gaps,
       ROUND(median(d.p90_schedule_diff_min), 1)                  AS median_p90_schedule_diff_min,
       ROUND(median(d.pct_within_5min), 1)                        AS median_pct_within_5min
FROM marts.mart_daily_line_reliability d
JOIN intermediate.int_line_day_alerts l USING (service_date, route_id)
WHERE d.n_comparable > 0
GROUP BY 1 ORDER BY 1
""")

# %% 7. Storm: alerts versus measurements, Blue and Red, Jan 22 - Feb 3
q("""
SELECT d.route_id, d.service_date, dayname(d.service_date) AS weekday, d.n_events,
       d.median_schedule_diff_min, d.n_very_late_events, d.pct_headways_over_1_5x,
       l.n_delay_alerts, l.max_alerted_delay_min, l.n_long_service_change_alerts
FROM marts.mart_daily_line_reliability d
JOIN intermediate.int_line_day_alerts l USING (service_date, route_id)
WHERE d.route_id IN ('Blue', 'Red') AND d.service_date BETWEEN DATE '2026-01-22' AND DATE '2026-02-03'
ORDER BY d.route_id, d.service_date
""")

# %% Release the warehouse (run this when you are done)
con.close()