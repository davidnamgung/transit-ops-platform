# %% [markdown]
# # Validating the alerts staging model
# 1. Open-ended alerts: how many, and are they stale?
# 2. How long do real alerts last?
# 3. What do alert headers look like, by effect?  (Needed to design keyword rules.)
# 4. Do alerts, with open-ended ones excluded, explain our episodes?
# 5. What fraction of ADDED-heavy line-days has a matching service-change alert?

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
pd.set_option("display.max_colwidth", 130)

A = "staging.stg_alerts"
LINES = "['Red','Orange','Blue','Green-B','Green-C','Green-D','Green-E','Mattapan']"
WINDOW = "start_ts_utc >= TIMESTAMPTZ '2025-11-08' AND start_ts_utc < TIMESTAMPTZ '2026-11-08'"
SERVICE_EFFECTS = "('DETOUR','NO_SERVICE','REDUCED_SERVICE','SIGNIFICANT_DELAYS')"


def q(sql):
    """Run SQL and return a pandas table."""
    cur = con.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


print(f"Setup complete. Alerts in staging: {q(f'SELECT COUNT(*) AS n FROM {A}').iloc[0, 0]:,}")

# %% 1a. Open-ended alerts overall
q(f"""
SELECT COUNT(*)                                              AS alerts,
       COUNT(*) FILTER (WHERE is_open_ended)                 AS open_ended,
       ROUND(100.0 * COUNT(*) FILTER (WHERE is_open_ended) / COUNT(*), 1) AS pct_open_ended,
       COUNT(*) FILTER (WHERE end_ts_utc IS NULL AND closed_ts_utc IS NOT NULL) AS no_end_but_closed
FROM {A}
""")

# %% 1b. Open-ended alerts by effect, and how many started before Aug 2026 (stale?)
q(f"""
SELECT effect,
       COUNT(*)                                                  AS alerts,
       COUNT(*) FILTER (WHERE is_open_ended)                     AS open_ended,
       COUNT(*) FILTER (WHERE is_open_ended
                          AND start_ts_utc < TIMESTAMPTZ '2026-08-01') AS open_ended_started_before_aug_2026
FROM {A} GROUP BY effect ORDER BY open_ended DESC
""")

# %% 2. Duration of alerts that do have an end (hours), by effect
q(f"""
SELECT effect, COUNT(*) AS alerts,
       ROUND(quantile_cont(epoch(effective_end_utc) - epoch(start_ts_utc), 0.5) / 3600.0, 1) AS median_hours,
       ROUND(quantile_cont(epoch(effective_end_utc) - epoch(start_ts_utc), 0.9) / 3600.0, 1) AS p90_hours
FROM {A}
WHERE NOT is_open_ended AND effective_end_utc >= start_ts_utc
GROUP BY effect ORDER BY alerts DESC
""")

# %% 3a. Alerts that started in our window, on our lines, by effect
q(f"""
SELECT effect, COUNT(*) AS alerts, ROUND(AVG(severity), 1) AS avg_severity
FROM {A}
WHERE {WINDOW} AND list_has_any(route_ids, {LINES})
GROUP BY effect ORDER BY alerts DESC
""")

# %% 3b. A repeatable pseudo-random sample of headers (service-related effects only)
q(f"""
SELECT effect, severity, LEFT(header, 125) AS header
FROM {A}
WHERE {WINDOW} AND list_has_any(route_ids, {LINES})
  AND effect IN ('DETOUR','NO_SERVICE','REDUCED_SERVICE','SIGNIFICANT_DELAYS','OTHER_EFFECT')
ORDER BY hash(alert_id)
LIMIT 30
""")

# %% 4. Probes: closed alerts only, longest first
def probe(title, route, start, end, limit=12):
    df = q(f"""
        SELECT alert_id, effect, severity,
               start_ts_utc AT TIME ZONE 'America/New_York'         AS starts_local,
               effective_end_utc AT TIME ZONE 'America/New_York'    AS ends_local,
               LEFT(header, 120) AS header
        FROM {A}
        WHERE list_contains(route_ids, '{route}')
          AND NOT is_open_ended
          AND effect IN ('DETOUR','NO_SERVICE','REDUCED_SERVICE','SIGNIFICANT_DELAYS','OTHER_EFFECT')
          AND start_ts_utc < (TIMESTAMP '{end}' + INTERVAL 1 DAY) AT TIME ZONE 'America/New_York'
          AND effective_end_utc > TIMESTAMP '{start}' AT TIME ZONE 'America/New_York'
        ORDER BY effective_end_utc - start_ts_utc DESC
        LIMIT {limit}""")
    print(f"\n=== {title} ===")
    print(df.to_string(index=False) if len(df) else "(no alerts found)")


probe("Red Line partial closure, Jul 21-30 2026", "Red", "2026-07-21", "2026-07-30")
probe("Red Line, Jul 1-13 2026 (70-90% ADDED, normal volume)", "Red", "2026-07-01", "2026-07-13")
probe("Blue Line, Jan 24-29 2026", "Blue", "2026-01-24", "2026-01-29")
probe("Red Line, Jan 24-29 2026", "Red", "2026-01-24", "2026-01-29")
probe("Blue Line, Feb 23-24 2026", "Blue", "2026-02-23", "2026-02-24")

# %% 5a. Is a line-day with 90%+ ADDED events explained by a service-change alert?
# Baseline: how often does an alert overlap on NORMAL days (under 20% ADDED)?
for label, cond in [("90%+ ADDED line-days", "n_added_events >= 0.9 * n_events"),
                    ("normal line-days (<20% ADDED)", "n_added_events < 0.2 * n_events")]:
    print(label)
    print(q(f"""
    WITH line_days AS (
        SELECT service_date, route_id,
               CAST(service_date AS TIMESTAMP) AT TIME ZONE 'America/New_York'     AS day_start,
               CAST(service_date + 1 AS TIMESTAMP) AT TIME ZONE 'America/New_York' AS day_end
        FROM marts.mart_daily_line_reliability
        WHERE {cond}
    ),
    svc AS (
        SELECT route_ids, start_ts_utc, effective_end_utc, is_open_ended
        FROM {A} WHERE effect IN {SERVICE_EFFECTS}
    )
    SELECT COUNT(*) AS line_days,
           COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM svc s
               WHERE list_contains(s.route_ids, d.route_id) AND NOT s.is_open_ended
                 AND s.start_ts_utc < d.day_end AND s.effective_end_utc > d.day_start))
               AS with_closed_alert,
           COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM svc s
               WHERE list_contains(s.route_ids, d.route_id)
                 AND s.start_ts_utc < d.day_end
                 AND COALESCE(s.effective_end_utc, TIMESTAMPTZ '2999-01-01') > d.day_start))
               AS with_any_alert_incl_open_ended
    FROM line_days d
    """).to_string(index=False))

# %% 5b. The 90%+ ADDED line-days with NO closed service-change alert (first 25)
q(f"""
WITH svc AS (
    SELECT route_ids, start_ts_utc, effective_end_utc
    FROM {A} WHERE effect IN {SERVICE_EFFECTS} AND NOT is_open_ended
)
SELECT d.service_date, dayname(d.service_date) AS weekday, d.route_id, d.n_events,
       ROUND(100.0 * d.n_added_events / d.n_events, 1) AS pct_added
FROM marts.mart_daily_line_reliability d
WHERE d.n_added_events >= 0.9 * d.n_events
  AND NOT EXISTS (
      SELECT 1 FROM svc s
      WHERE list_contains(s.route_ids, d.route_id)
        AND s.start_ts_utc < CAST(d.service_date + 1 AS TIMESTAMP) AT TIME ZONE 'America/New_York'
        AND s.effective_end_utc > CAST(d.service_date AS TIMESTAMP) AT TIME ZONE 'America/New_York')
ORDER BY d.service_date, d.route_id
LIMIT 25
""")

# %% Release the warehouse (run this when you are done)
con.close()