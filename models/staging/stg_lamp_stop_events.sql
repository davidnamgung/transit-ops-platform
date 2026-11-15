-- Staging model: one row per train stop event, cleaned and typed.
-- Flags rather than deletes: schedule_diff_sec, trip_kind, key_row_number.
-- Reads every raw LAMP file. union_by_name = true means files with slightly
-- different columns still combine instead of failing.
WITH raw AS (
    SELECT
        *,
        strptime(CAST(service_date AS VARCHAR), '%Y%m%d')::DATE AS service_dt
    FROM read_parquet(
        'data/raw/lamp/20*.parquet',
        union_by_name = true,
        filename = true
    )
),
typed AS (
    SELECT
        -- identifiers
        service_dt                                    AS service_date,
        route_id,
        branch_route_id,
        trunk_route_id,
        trip_id,
        trip_id LIKE 'ADDED%'                         AS is_added_trip,
        CASE WHEN trip_id LIKE 'ADDED%'  THEN 'added'
             WHEN trip_id LIKE 'NONREV%' THEN 'nonrevenue'
             ELSE 'scheduled' END                     AS trip_kind,
        vehicle_id,
        vehicle_label,
        len(string_split(vehicle_consist, '|'))       AS n_cars,
        CAST(direction_id AS INTEGER)                 AS direction_id,
        direction,
        direction_destination,
        stop_id,
        parent_station,
        stop_sequence,
        stop_count,

        -- actual times: UTC instants, plus Boston local time for display
        to_timestamp(stop_timestamp)                                  AS stop_ts_utc,
        to_timestamp(stop_timestamp) AT TIME ZONE 'America/New_York'  AS stop_ts_local,
        to_timestamp(move_timestamp)                                  AS move_ts_utc,

        -- measured durations (seconds)
        travel_time_seconds,
        dwell_time_seconds,
        headway_trunk_seconds,
        headway_branch_seconds,

        -- scheduled times: seconds after the service day's midnight (Boston)
        (service_dt::TIMESTAMP + to_seconds(scheduled_arrival_time))
            AT TIME ZONE 'America/New_York'           AS scheduled_arrival_ts_utc,
        (service_dt::TIMESTAMP + to_seconds(scheduled_departure_time))
            AT TIME ZONE 'America/New_York'           AS scheduled_departure_ts_utc,
        scheduled_travel_time                         AS scheduled_travel_time_seconds,
        scheduled_headway_trunk                       AS scheduled_headway_trunk_seconds,
        scheduled_headway_branch                      AS scheduled_headway_branch_seconds,

        -- kept raw until we verify what they mean
        start_time                                    AS trip_start_seconds_after_midnight,
        occupancy_status,
        occupancy_percentage,

        -- lineage
        regexp_extract(filename, '[^/]+$')            AS source_file
    FROM raw
)
SELECT
    *,
    -- Raw difference between actual and scheduled time, in seconds.
    -- Positive = later than scheduled. A neutral name: we have not yet
    -- verified whether stop_ts is an arrival or a departure time.
    epoch(stop_ts_utc) - epoch(scheduled_arrival_ts_utc)   AS schedule_diff_sec,
    -- 1 = the row we keep for this (service_date, trip, stop_sequence); 2+ are set aside.
    -- The ORDER BY lists many columns so that two duplicates are never "tied":
    -- a tie would let the database pick either row, and rebuilds would differ.
    ROW_NUMBER() OVER (
        PARTITION BY service_date, trip_id, stop_sequence
        ORDER BY stop_ts_utc NULLS LAST, vehicle_id NULLS LAST, stop_id NULLS LAST,
                 route_id, branch_route_id NULLS LAST, trunk_route_id NULLS LAST,
                 direction_id NULLS LAST, scheduled_arrival_ts_utc NULLS LAST,
                 scheduled_departure_ts_utc NULLS LAST, travel_time_seconds NULLS LAST,
                 dwell_time_seconds NULLS LAST, headway_trunk_seconds NULLS LAST,
                 headway_branch_seconds NULLS LAST, source_file
    )                                                      AS key_row_number
FROM typed