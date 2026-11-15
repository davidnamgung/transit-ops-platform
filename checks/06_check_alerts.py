"""
Sanity checks on the alerts staging table, including a known-answer test.

Usage:  uv run python checks/06_check_alerts.py
"""
import os
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
con = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)
con.execute("SET TimeZone = 'UTC'")

A = "staging.stg_alerts"
LINES = "['Red','Orange','Blue','Green-B','Green-C','Green-D','Green-E','Mattapan']"
results = []


def scalar(sql):
    return con.execute(sql).fetchall()[0][0]


def check(name, bad_rows_sql, level="FAIL"):
    bad = scalar(bad_rows_sql)
    if bad == 0:
        print(f"[PASS] {name}")
        results.append("PASS")
    else:
        print(f"[{level}] {name}: {bad:,}")
        results.append(level)


print(f"Alerts in staging: {scalar(f'SELECT COUNT(*) FROM {A}'):,}\n")

check("alert_id is unique", f"SELECT COUNT(*) - COUNT(DISTINCT alert_id) FROM {A}")

check("fewer than 5% of alerts lack a start time",
      f"SELECT CASE WHEN AVG(CAST(start_ts_utc IS NULL AS INTEGER)) > 0.05 THEN 1 ELSE 0 END FROM {A}")

check("at least 1,000 alerts started inside our data window on our lines",
      f"""SELECT CASE WHEN COUNT(*) < 1000 THEN 1 ELSE 0 END FROM {A}
          WHERE start_ts_utc >= TIMESTAMPTZ '2025-11-08' AND start_ts_utc < TIMESTAMPTZ '2026-11-08'
            AND list_has_any(route_ids, {LINES})""")

# Known-answer test: alerts we have seen with our own eyes must be present with a start time.
check("known alerts (685308, 691316, 1039320) are present with a start time",
      f"SELECT 3 - COUNT(*) FROM {A} WHERE alert_id IN (685308, 691316, 1039320) AND start_ts_utc IS NOT NULL")

check("fewer than 1% of alerts end before they start",
      f"""SELECT CASE WHEN AVG(CAST(effective_end_utc < start_ts_utc AS INTEGER)) > 0.01 THEN 1 ELSE 0 END
          FROM {A} WHERE effective_end_utc IS NOT NULL AND start_ts_utc IS NOT NULL""",
      level="WARN")

check("fewer than 5% of alerts are open-ended",
      f"SELECT CASE WHEN AVG(CAST(is_open_ended AS INTEGER)) > 0.05 THEN 1 ELSE 0 END FROM {A}",
      level="WARN")

print(f"\nSummary: {results.count('PASS')} passed, "
      f"{results.count('WARN')} warnings, {results.count('FAIL')} failures")
sys.exit(1 if "FAIL" in results else 0)