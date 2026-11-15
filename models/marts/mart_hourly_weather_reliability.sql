-- Mart: reliability by line, hour of day, weekday/weekend and weather category.
-- Feeds the weather-impact charts. Small groups are noisy, so n_comparable and
-- n_headways are kept so the app can hide low-sample cells.
-- Grain: (route_id, weather_category, hour_local, is_weekend).
SELECT
    route_id,
    weather_category,
    hour_local,
    is_weekend,
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
WHERE hour_local IS NOT NULL
GROUP BY route_id, weather_category, hour_local, is_weekend