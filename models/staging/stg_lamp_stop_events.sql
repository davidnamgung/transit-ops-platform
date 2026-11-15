-- Staging model: one row per train stop event, cleaned and typed.
-- Changes in this version: adds schedule_diff_sec and key_row_number (flags,
-- not deletions).
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
    -- 1 = first row for this (service_date, trip, stop_sequence); 2+ are set aside.
    ROW_NUMBER() OVER (
        PARTITION BY service_date, trip_id, stop_sequence
        ORDER BY stop_ts_utc NULLS LAST, vehicle_id
    )                                                      AS key_row_number
FROM typed