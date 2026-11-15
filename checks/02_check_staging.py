"""
Data-quality checks on the staging layer.

FAIL = something is wrong; downstream work should stop.
WARN = unusual; investigate before trusting the numbers.
Exit code 1 if any check FAILs, so automation can halt a broken pipeline.

Checks are written as ranges where exact zero would be unrealistic (for example, about
0.15% of records are legitimate duplicates), because a test that is always red gets ignored.

Usage:  uv run python checks/02_check_staging.py
"""
import os
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

con = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)
con.execute("SET TimeZone = 'UTC'")

EVENTS = "staging.stg_lamp_stop_events"
WEATHER = "staging.stg_weather_hourly"
STATIONS = "staging.stg_stations"
KNOWN_ROUTES = "'Red','Orange','Blue','Green-B','Green-C','Green-D','Green-E','Mattapan'"
results = []


def scalar(sql):
    return con.execute(sql).fetchall()[0][0]


def check(name, bad_rows_sql, level="FAIL", total=None, examples_sql=None):
    """Run a query that counts bad rows. Zero bad rows = PASS."""
    bad = scalar(bad_rows_sql)
    if bad == 0:
        print(f"[PASS] {name}")
        results.append("PASS")
        return
    pct = f" ({100 * bad / total:.3f}% of rows)" if total else ""
    print(f"[{level}] {name}: {bad:,}{pct}")
    if examples_sql:
        for row in con.execute(examples_sql).fetchall()[:5]:
            print("        e.g.", row)
    results.append(level)


n_events = scalar(f"SELECT COUNT(*) FROM {EVENTS}")
print(f"Checking {n_events:,} stop events\n")

print("-- Subway events --")
check("the table is not empty", f"SELECT CASE WHEN COUNT(*) < 1000000 THEN 1 ELSE 0 END FROM {EVENTS}")

check("key columns are never null",
      f"""SELECT COUNT(*) FROM {EVENTS}
          WHERE service_date IS NULL OR route_id IS NULL OR trip_id IS NULL OR stop_id IS NULL""")

check("route_id is a known line",
      f"SELECT COUNT(*) FROM {EVENTS} WHERE route_id NOT IN ({KNOWN_ROUTES})",
      level="WARN", total=n_events,
      examples_sql=f"SELECT DISTINCT route_id FROM {EVENTS} WHERE route_id NOT IN ({KNOWN_ROUTES})")

check("under 0.5% of rows are duplicates of the same trip, stop position, and day",
      f"""SELECT CASE WHEN 1.0 * COUNT(*) FILTER (WHERE key_row_number > 1) / COUNT(*) > 0.005
                      THEN 1 ELSE 0 END FROM {EVENTS}""",
      level="WARN")

check("event happens on its service date or the next calendar day (Boston time)",
      f"""SELECT COUNT(*) FROM {EVENTS}
          WHERE stop_ts_local IS NOT NULL
            AND CAST(stop_ts_local AS DATE) NOT IN (service_date, service_date + 1)""",
      level="WARN", total=n_events,
      examples_sql=f"""SELECT service_date, trip_id, stop_ts_local FROM {EVENTS}
                       WHERE stop_ts_local IS NOT NULL
                         AND CAST(stop_ts_local AS DATE) NOT IN (service_date, service_date + 1)""")

check("travel and dwell times are never negative",
      f"SELECT COUNT(*) FROM {EVENTS} WHERE travel_time_seconds < 0 OR dwell_time_seconds < 0",
      level="WARN", total=n_events)

check("at least 300 service days are present",
      f"SELECT CASE WHEN COUNT(DISTINCT service_date) < 300 THEN 1 ELSE 0 END FROM {EVENTS}",
      level="WARN")

print("\n-- Weather --")
check("no duplicate hours", f"SELECT COUNT(*) - COUNT(DISTINCT hour_utc) FROM {WEATHER}")

check("no missing hours between first and last",
      f"""SELECT CAST((epoch(MAX(hour_utc)) - epoch(MIN(hour_utc))) / 3600 + 1 AS BIGINT)
                 - COUNT(*) FROM {WEATHER}""")

check("no null weather values",
      f"""SELECT COUNT(*) FROM {WEATHER}
          WHERE temperature_c IS NULL OR precipitation_mm IS NULL OR snowfall_cm IS NULL
             OR wind_speed_kmh IS NULL OR wind_gust_kmh IS NULL""",
      level="WARN")

check("temperatures are physically plausible (between -40 and 45 C)",
      f"SELECT COUNT(*) FROM {WEATHER} WHERE temperature_c < -40 OR temperature_c > 45")

print("\n-- Joining weather to events --")
# The last service day runs past the end of our weather window, so it is excluded.
check("every event hour has a weather row (last service day excluded)",
      f"""SELECT COUNT(*) FROM {EVENTS} e
          LEFT JOIN {WEATHER} w ON date_trunc('hour', e.stop_ts_utc) = w.hour_utc
          WHERE e.stop_ts_utc IS NOT NULL AND w.hour_utc IS NULL
            AND e.service_date < (SELECT MAX(service_date) FROM {EVENTS})""",
      level="WARN", total=n_events)

print("\n-- Stations --")
check("at least 100 stations are loaded", f"SELECT CASE WHEN COUNT(*) < 100 THEN 1 ELSE 0 END FROM {STATIONS}",
      level="WARN")

print(f"\nSummary: {results.count('PASS')} passed, "
      f"{results.count('WARN')} warnings, {results.count('FAIL')} failures")
sys.exit(1 if "FAIL" in results else 0)
