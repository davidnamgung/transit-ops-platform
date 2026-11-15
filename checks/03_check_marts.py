"""
Checks on the intermediate and mart layers, plus a report showing what the
staging flags do to the data.

Usage:  uv run python checks/03_check_marts.py
"""
import os
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

con = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)
con.execute("SET TimeZone = 'UTC'")

STG = "staging.stg_lamp_stop_events"
INT = "intermediate.int_stop_events_weather"
DAILY = "marts.mart_daily_line_reliability"
HOURLY = "marts.mart_hourly_weather_reliability"
results = []


def rows(sql):
    return con.execute(sql).fetchall()


def scalar(sql):
    return rows(sql)[0][0]


def check(name, bad_rows_sql, level="FAIL", total=None):
    bad = scalar(bad_rows_sql)
    if bad == 0:
        print(f"[PASS] {name}")
        results.append("PASS")
        return
    pct = f" ({100 * bad / total:.3f}% of rows)" if total else ""
    print(f"[{level}] {name}: {bad:,}{pct}")
    results.append(level)


print("== FLAG IMPACT REPORT (please paste this section back) ==")
total, dup = rows(f"SELECT COUNT(*), COUNT(*) FILTER (WHERE key_row_number > 1) FROM {STG}")[0]
print(f"staging rows: {total:,}; set aside as duplicate keys: {dup:,} ({100 * dup / total:.3f}%)")

print("\nschedule comparability by trip kind (duplicates excluded):")
print("   (kind, events, pct_with_schedule, pct_beyond_3h_of_those)")
for r in rows(f"""
    SELECT trip_kind AS kind,
           COUNT(*) AS events,
           ROUND(100.0 * COUNT(schedule_diff_sec) / COUNT(*), 1) AS pct_with_schedule,
           ROUND(100.0 * COUNT(*) FILTER (WHERE schedule_diff_sec IS NOT NULL
                                           AND ABS(schedule_diff_sec) > 10800)
                 / NULLIF(COUNT(schedule_diff_sec), 0), 2) AS pct_beyond_3h
    FROM {INT} GROUP BY 1 ORDER BY 1"""):
    print("  ", r)

print("\nschedule difference among comparable events, in minutes:")
labels = ["p01", "p05", "p25", "p50", "p75", "p95", "p99"]
vals = rows(f"""SELECT quantile_cont(schedule_diff_sec / 60.0,
                                    [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99])
                FROM {INT} WHERE is_schedule_comparable""")[0][0]
print("  ", {l: round(v, 2) for l, v in zip(labels, vals)})

print("\nevents by weather category (category, events, pct):")
for r in rows(f"""SELECT weather_category, COUNT(*),
                         ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2)
                  FROM {INT} GROUP BY 1 ORDER BY 2 DESC"""):
    print("  ", r)

print("\n== CHECKS ==")
check("intermediate has exactly the de-duplicated staging rows",
      f"SELECT ABS((SELECT COUNT(*) FROM {INT}) - (SELECT COUNT(*) FROM {STG} WHERE key_row_number = 1))")

check("daily mart: one row per (service_date, route_id)",
      f"SELECT COUNT(*) FROM (SELECT 1 FROM {DAILY} GROUP BY service_date, route_id HAVING COUNT(*) > 1)")

check("hourly mart: one row per (route, weather, hour, weekend)",
      f"""SELECT COUNT(*) FROM (SELECT 1 FROM {HOURLY}
                               GROUP BY route_id, weather_category, hour_local, is_weekend
                               HAVING COUNT(*) > 1)""")

check("daily mart: percentages are between 0 and 100",
      f"""SELECT COUNT(*) FROM {DAILY}
          WHERE pct_within_5min NOT BETWEEN 0 AND 100
             OR pct_headways_over_1_5x NOT BETWEEN 0 AND 100""")

check("hourly mart: percentages are between 0 and 100",
      f"""SELECT COUNT(*) FROM {HOURLY}
          WHERE pct_within_5min NOT BETWEEN 0 AND 100
             OR pct_headways_over_1_5x NOT BETWEEN 0 AND 100""")

check("daily mart covers every service date in staging",
      f"""SELECT ABS((SELECT COUNT(DISTINCT service_date) FROM {STG})
                    - (SELECT COUNT(DISTINCT service_date) FROM {DAILY}))""")

check("fewer than 0.1% of scheduled-trip events fall beyond the 12-hour cap",
      f"""SELECT CASE WHEN 1.0 * COUNT(*) FILTER (WHERE NOT is_schedule_comparable) / COUNT(*) > 0.001
                      THEN 1 ELSE 0 END
          FROM {INT} WHERE trip_kind = 'scheduled' AND schedule_diff_sec IS NOT NULL""",
      level="WARN")

check("every line-day in the daily mart has some comparable events",
      f"SELECT COUNT(*) FROM {DAILY} WHERE n_comparable = 0", level="WARN")

check("every line-day in the daily mart has daily weather",
      f"SELECT COUNT(*) FROM {DAILY} WHERE avg_temp_c IS NULL", level="WARN")

print(f"\nSummary: {results.count('PASS')} passed, "
      f"{results.count('WARN')} warnings, {results.count('FAIL')} failures")
sys.exit(1 if "FAIL" in results else 0)