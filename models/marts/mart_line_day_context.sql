-- Mart: one row per service date and line, combining measured service, weather,
-- alerts, and a day_type. Grain: (service_date, route_id).
-- Thresholds are provisional and documented in docs/metrics.md.
WITH base AS (
    SELECT d.*, dayofweek(d.service_date) IN (0, 6) AS is_weekend
    FROM marts.mart_daily_line_reliability d
),
typical AS (
    SELECT route_id, is_weekend, median(n_events) AS typical_events
    FROM base
    GROUP BY route_id, is_weekend
),
joined AS (
    SELECT
        b.service_date, b.route_id, b.is_weekend, b.n_events,
        ROUND(b.n_events / t.typical_events, 2)           AS volume_vs_typical,
        ROUND(100.0 * b.n_added_events / b.n_events, 1)   AS pct_added,
        b.n_comparable, b.n_headways,
        b.median_schedule_diff_min, b.p90_schedule_diff_min, b.pct_headways_over_1_5x,
        b.avg_temp_c, b.total_precip_mm, b.total_snow_cm, b.max_gust_kmh,
        a.n_long_service_change_alerts, a.n_short_service_change_alerts, a.n_station_alerts,
        a.n_incident_alerts, a.n_delay_alerts, a.n_weather_alerts, a.n_planned_work_alerts,
        a.max_alerted_delay_min, a.longest_closure_header
    FROM base b
    JOIN typical t USING (route_id, is_weekend)
    LEFT JOIN intermediate.int_line_day_alerts a USING (service_date, route_id)
)
SELECT *,
    CASE
        WHEN n_long_service_change_alerts > 0
             AND (pct_added >= 50 OR volume_vs_typical < 0.8)          THEN 'planned_closure'
        WHEN pct_headways_over_1_5x >= 40 OR volume_vs_typical < 0.6   THEN 'disruption'
        WHEN pct_added >= 90                                           THEN 'schedule_matching_gap'
        ELSE 'normal'
    END AS day_type
FROM joinedgit add .
