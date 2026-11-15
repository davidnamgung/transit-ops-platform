"""
Print a fingerprint of the warehouse: values that must be identical after any
rebuild from the same raw data. Two ways to use it:
  * run it twice WITHOUT rebuilding: all lines must match (tests the checksums)
  * run it, rebuild, run it again: all lines must match (tests determinism)
The two "daily mart" lines test whether hash() itself is stable between runs.

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
    "daily mart (hash checksum)": "SELECT bit_xor(hash(service_date, route_id, n_events, n_comparable, n_headways)) FROM marts.mart_daily_line_reliability",
    "daily mart (md5 checksum)": """SELECT md5(string_agg(CONCAT_WS('|', service_date, route_id, n_events, n_comparable,
                                    n_headways, COALESCE(median_schedule_diff_min, -999)), ';'
                                    ORDER BY service_date, route_id))
                                    FROM marts.mart_daily_line_reliability""",
    "alerts": "SELECT COUNT(*) FROM staging.stg_alerts",
    "alert kinds (md5)": "SELECT md5(string_agg(CAST(alert_id AS VARCHAR) || ':' || alert_kind, ',' ORDER BY alert_id)) FROM intermediate.int_alerts_classified",
    "line-day alerts (md5)": """SELECT md5(string_agg(CONCAT_WS('|', service_date, route_id, n_long_service_change_alerts,
                                    n_delay_alerts, COALESCE(longest_closure_header, '')), ';'
                                    ORDER BY service_date, route_id))
                                    FROM intermediate.int_line_day_alerts""",
    "day types (md5)": """SELECT md5(string_agg(CONCAT_WS('|', service_date, route_id, day_type), ';'
                                    ORDER BY service_date, route_id))
                                    FROM marts.mart_line_day_context""",
    "episodes": "SELECT COUNT(*) FROM marts.mart_line_episodes",
}
for name, sql in QUERIES.items():
    try:
        print(f"{name:<34} {con.execute(sql).fetchall()[0][0]}")
    except duckdb.CatalogException:
        print(f"{name:<34} (table not built yet)")