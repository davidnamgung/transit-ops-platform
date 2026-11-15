-- Mart: one row per service date and line. Feeds the trend charts and the
-- "worst days" analysis. Grain: (service_date, route_id).
WITH daily_weather AS (
    SELECT
        CAST(hour_local AS DATE)           AS service_date,
        ROUND(AVG(temperature_c), 1)       AS avg_temp_c,
        ROUND(SUM(precipitation_mm), 1)    AS total_precip_mm,
        ROUND(SUM(snowfall_cm), 1)         AS total_snow_cm,
        ROUND(MAX(wind_gust_kmh), 0)       AS max_gust_kmh
    FROM staging.stg_weather_hourly
    GROUP BY 1
),
reliability AS (
    SELECT
        service_date,
        route_id,
        COUNT(*)                                          AS n_events,
        COUNT(*) FILTER (WHERE is_schedule_comparable)    AS n_comparable,
        ROUND(median(schedule_diff_sec / 60.0)
              FILTER (WHERE is_schedule_comparable), 2)   AS median_schedule_diff_min,
        ROUND(quantile_cont(schedule_diff_sec / 60.0, 0.9)
              FILTER (WHERE is_schedule_comparable), 2)   AS p90_schedule_diff_min,
        ROUND(100.0 * AVG(CASE WHEN is_schedule_comparable
                               THEN CAST(ABS(schedule_diff_sec) <= 300 AS INTEGER) END), 2)
                                                          AS pct_within_5min,
        COUNT(headway_ratio)                              AS n_headways,
        ROUND(100.0 * AVG(CAST(headway_ratio > 1.5 AS INTEGER)), 2)
                                                          AS pct_headways_over_1_5x
    FROM intermediate.int_stop_events_weather
    GROUP BY service_date, route_id
)
SELECT r.*, w.avg_temp_c, w.total_precip_mm, w.total_snow_cm, w.max_gust_kmh
FROM reliability r
LEFT JOIN daily_weather w USING (service_date)