"""
Checks on two "unproven" items, all in one run:
  1. Duplicate groups that span 2+ routes: which routes, and is the row we keep
     on the trip's main route?
  2. Is stop_timestamp an arrival or a departure? Tested by internal consistency
     (do the duration columns line up with the timestamps?) and by comparing the
     timestamps with the scheduled arrival and departure times.

Usage:  uv run python checks/08_caveats.py
"""
import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
con = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)
con.execute("SET TimeZone = 'UTC'")
S = "staging.stg_lamp_stop_events"


def show(title, sql):
    """Run a query and print its result as a small table."""
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    print(f"\n=== {title} ===")
    print("  " + " | ".join(cols))
    for row in cur.fetchall():
        print("  " + " | ".join(str(v) for v in row))


# 1a. Which routes do the conflicting duplicate pairs involve?
show("1a. Duplicate groups spanning 2+ routes: route combinations", f"""
WITH g AS (
    SELECT service_date, trip_id, stop_sequence,
           list_sort(list_distinct(list(route_id)))  AS routes,
           list_sort(list_distinct(list(trip_kind))) AS kinds
    FROM {S}
    GROUP BY service_date, trip_id, stop_sequence
    HAVING COUNT(DISTINCT route_id) > 1
)
SELECT array_to_string(routes, ' + ') AS route_combination,
       array_to_string(kinds, ' + ')  AS trip_kinds,
       COUNT(*)                       AS groups
FROM g GROUP BY ALL ORDER BY groups DESC LIMIT 12
""")

# 1b. Is the row we keep on the trip's "main" route (the route with most of its rows)?
show("1b. Is the kept row on the trip's main route?", f"""
WITH per_route AS (
    SELECT service_date, trip_id, route_id, COUNT(*) AS n
    FROM {S} GROUP BY service_date, trip_id, route_id
),
trip_home AS (
    SELECT service_date, trip_id, arg_max(route_id, n) AS main_route, COUNT(*) AS routes_in_trip
    FROM per_route GROUP BY service_date, trip_id
),
conflict AS (
    SELECT service_date, trip_id, stop_sequence
    FROM {S} GROUP BY service_date, trip_id, stop_sequence
    HAVING COUNT(DISTINCT route_id) > 1
),
kept AS (
    SELECT s.service_date, s.trip_id, s.route_id AS kept_route
    FROM {S} s JOIN conflict c USING (service_date, trip_id, stop_sequence)
    WHERE s.key_row_number = 1
)
SELECT COUNT(*)                                                       AS conflict_groups,
       COUNT(*) FILTER (WHERE k.kept_route = h.main_route)            AS kept_is_main_route,
       ROUND(100.0 * COUNT(*) FILTER (WHERE k.kept_route = h.main_route) / COUNT(*), 1) AS pct_kept_is_main,
       COUNT(*) FILTER (WHERE h.routes_in_trip > 1)                   AS trips_with_rows_on_2plus_routes
FROM kept k JOIN trip_home h USING (service_date, trip_id)
""")

# 2a. Internal consistency of the timing columns (scheduled trips, kept rows only).
# Tolerance: 1 second. A high percentage means that relationship holds.
show("2a. Do the duration columns line up with the timestamps?", f"""
WITH seq AS (
    SELECT stop_ts_utc, move_ts_utc, dwell_time_seconds, travel_time_seconds,
           LEAD(move_ts_utc) OVER w AS next_move_ts,
           LAG(stop_ts_utc)  OVER w AS prev_stop_ts
    FROM {S}
    WHERE key_row_number = 1 AND trip_kind = 'scheduled'
    WINDOW w AS (PARTITION BY service_date, trip_id ORDER BY stop_sequence)
)
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE ABS(epoch(next_move_ts) - epoch(stop_ts_utc) - dwell_time_seconds) <= 1)
        / NULLIF(COUNT(*) FILTER (WHERE next_move_ts IS NOT NULL AND dwell_time_seconds IS NOT NULL), 0), 1)
        AS pct_dwell_equals_next_move_minus_stop,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ABS(epoch(stop_ts_utc) - epoch(move_ts_utc) - travel_time_seconds) <= 1)
        / NULLIF(COUNT(*) FILTER (WHERE move_ts_utc IS NOT NULL AND travel_time_seconds IS NOT NULL), 0), 1)
        AS pct_travel_equals_stop_minus_move,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ABS(epoch(move_ts_utc) - epoch(prev_stop_ts) - dwell_time_seconds) <= 1)
        / NULLIF(COUNT(*) FILTER (WHERE move_ts_utc IS NOT NULL AND prev_stop_ts IS NOT NULL AND dwell_time_seconds IS NOT NULL), 0), 1)
        AS pct_dwell_equals_move_minus_prev_stop,
  ROUND(median(dwell_time_seconds), 1) AS median_dwell_sec
FROM seq
""")

# 2b. Compare the actual time with the scheduled arrival and departure.
show("2b. Actual time versus scheduled arrival and scheduled departure (seconds)", f"""
SELECT COUNT(*) AS rows_used,
       ROUND(median(epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)), 1)       AS median_vs_sched_arrival,
       ROUND(median(epoch(stop_ts_utc) - epoch(scheduled_departure_ts_utc)), 1)     AS median_vs_sched_departure,
       ROUND(median(epoch(scheduled_departure_ts_utc) - epoch(scheduled_arrival_ts_utc)), 1) AS median_scheduled_dwell,
       ROUND(quantile_cont(ABS(epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)), 0.5), 1)   AS median_abs_vs_arrival,
       ROUND(quantile_cont(ABS(epoch(stop_ts_utc) - epoch(scheduled_departure_ts_utc)), 0.5), 1) AS median_abs_vs_departure
FROM {S}
WHERE key_row_number = 1 AND trip_kind = 'scheduled'
  AND stop_ts_utc IS NOT NULL
  AND scheduled_arrival_ts_utc IS NOT NULL AND scheduled_departure_ts_utc IS NOT NULL
  AND ABS(epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)) < 43200
""")