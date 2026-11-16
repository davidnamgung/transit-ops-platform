"""
Prints checksums of the trip-based tables, to prove the pipeline gives the same answer on every machine.

The same raw files must give the same checksums whatever the operating system, processor, or number of
cores. Run this on two machines that used the same data window, and compare the "md5" columns. The
window dates and row counts are printed first so you can see the inputs match.

The alert-based tables are left out on purpose: the MBTA updates the alert file all day, so two builds
made hours apart can legitimately differ there.

Usage:  uv run python checks/09_machine_fingerprint.py
"""
import os
import platform
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

con = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)

# Only columns that every version of these tables has.
TABLES = {
    "daily mart": ("marts.mart_daily_line_reliability",
                   ["service_date", "route_id", "n_events", "n_added_events", "n_comparable",
                    "median_schedule_diff_min", "p90_schedule_diff_min", "pct_within_5min",
                    "n_headways", "pct_headways_over_1_5x"],
                   ["service_date", "route_id"]),
    "hourly mart": ("marts.mart_hourly_weather_reliability",
                    ["route_id", "weather_category", "hour_local", "is_weekend", "n_comparable",
                     "median_schedule_diff_min", "p90_schedule_diff_min", "pct_within_5min",
                     "n_headways", "pct_headways_over_1_5x"],
                    ["route_id", "weather_category", "hour_local", "is_weekend"]),
}

first, last, days, events = con.execute(
    "SELECT MIN(service_date), MAX(service_date), COUNT(DISTINCT service_date), COUNT(*) "
    "FROM staging.stg_lamp_stop_events").fetchall()[0]
threads = con.execute("SELECT current_setting('threads')").fetchall()[0][0]

print(f"machine       {platform.system()} {platform.machine()}, DuckDB {duckdb.__version__}, {threads} threads")
print(f"data window   {first} to {last}, {days} service days, {events:,} stop events\n")
for name, (table, columns, order) in TABLES.items():
    sql = (f"SELECT COUNT(*), md5(string_agg(CONCAT_WS('|', {', '.join(columns)}), ';' "
           f"ORDER BY {', '.join(order)})) FROM {table}")
    rows, checksum = con.execute(sql).fetchall()[0]
    print(f"{name:<12}  rows {rows:>6,}   md5 {checksum}")
