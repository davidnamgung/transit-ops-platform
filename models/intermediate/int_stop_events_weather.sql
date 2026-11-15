-- Intermediate model: deduplicated stop events with time features and weather.
-- Everything the marts need, at event level, with the judgment rules in one place.
SELECT
    e.service_date,
    e.route_id,
    e.direction_id,
    e.parent_station,
    e.is_added_trip,
    e.stop_ts_utc,
    e.stop_ts_local,

    -- time features. Weekday is based on service_date, not the calendar date,
    -- so a 1 AM Saturday-night train counts as Saturday service.
    EXTRACT(hour FROM e.stop_ts_local)       AS hour_local,
    dayofweek(e.service_date)                AS day_of_week,     -- 0 = Sunday
    EXTRACT(month FROM e.service_date)       AS month,
    dayofweek(e.service_date) IN (0, 6)      AS is_weekend,

    -- schedule comparison (see docs/metrics.md for the 3-hour rule)
    e.schedule_diff_sec,
    (NOT e.is_added_trip
        AND e.schedule_diff_sec IS NOT NULL
        AND ABS(e.schedule_diff_sec) <= 10800)   AS is_schedule_comparable,

    -- measured vs scheduled durations
    e.travel_time_seconds,
    e.scheduled_travel_time_seconds,
    e.dwell_time_seconds,
    e.headway_trunk_seconds,
    e.scheduled_headway_trunk_seconds,
    e.headway_trunk_seconds / NULLIF(e.scheduled_headway_trunk_seconds, 0)  AS headway_ratio,

    -- weather for the hour the event happened
    w.temperature_c,
    w.precipitation_mm,
    w.snowfall_cm,
    w.wind_gust_kmh,
    CASE
        WHEN w.precipitation_mm IS NULL THEN 'unknown'
        WHEN w.snowfall_cm >= 0.1       THEN 'snow'
        WHEN w.precipitation_mm >= 2.5  THEN 'heavy_rain'
        WHEN w.precipitation_mm >= 0.1  THEN 'rain'
        ELSE 'dry'
    END                                      AS weather_category
FROM staging.stg_lamp_stop_events e
LEFT JOIN staging.stg_weather_hourly w
       ON date_trunc('hour', e.stop_ts_utc) = w.hour_utc
WHERE e.key_row_number = 1