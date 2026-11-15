"""
Print a fingerprint of the warehouse: totals that must be identical after any
rebuild from the same raw data. Run it, rebuild, run it again. If the numbers
differ, the build is not deterministic.

Usage:  uv run python checks/07_fingerprint.py
"""
import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
con = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)

QUERIES = {
    "staging rows": "SELECT COUNT(*) FROM staging.stg_lamp_stop_events",
    "rows kept after dedupe": "SELECT COUNT(*) FROM staging.stg_lamp_stop_events WHERE key_row_number = 1",
    "comparable events": "SELECT COUNT(*) FROM intermediate.int_stop_events_weather WHERE is_schedule_comparable",
    "sum of schedule diff (sec)": "SELECT ROUND(SUM(schedule_diff_sec)) FROM intermediate.int_stop_events_weather WHERE is_schedule_comparable",
    "events with a headway": "SELECT COUNT(headway_ratio) FROM intermediate.int_stop_events_weather",
    "line-days, no comparable events": "SELECT COUNT(*) FROM marts.mart_daily_line_reliability WHERE n_comparable = 0",
    "daily mart checksum": "SELECT bit_xor(hash(service_date, route_id, n_events, n_comparable, n_headways)) FROM marts.mart_daily_line_reliability",
    "alerts": "SELECT COUNT(*) FROM staging.stg_alerts",
}
for name, sql in QUERIES.items():
    print(f"{name:<34} {con.execute(sql).fetchall()[0][0]}")