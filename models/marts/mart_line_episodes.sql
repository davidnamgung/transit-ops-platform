-- Mart: episodes = runs of consecutive unusual days on one line.
-- Trick ("gaps and islands"): subtracting a running row number from the date gives
-- the same value for every day in an unbroken run.
-- Grain: one row per episode (route_id, episode_type, start_date).
WITH runs AS (
    SELECT *,
           service_date - CAST(ROW_NUMBER() OVER (
               PARTITION BY route_id, day_type ORDER BY service_date) AS INTEGER) AS run_key
    FROM marts.mart_line_day_context
    WHERE day_type <> 'normal'
),
agg AS (
    SELECT
        route_id,
        day_type                                  AS episode_type,
        MIN(service_date)                         AS start_date,
        MAX(service_date)                         AS end_date,
        COUNT(*)                                  AS n_days,
        ROUND(AVG(volume_vs_typical), 2)          AS avg_volume_vs_typical,
        ROUND(AVG(pct_added), 1)                  AS avg_pct_added,
        ROUND(AVG(pct_headways_over_1_5x), 1)     AS avg_pct_long_gaps,
        ROUND(MAX(total_snow_cm), 1)              AS max_daily_snow_cm,
        MAX(max_gust_kmh)                         AS max_gust_kmh,
        SUM(n_delay_alerts)                       AS delay_alerts,
        MIN(longest_closure_header)               AS closure_alert_header
    FROM runs
    GROUP BY route_id, day_type, run_key
)
SELECT *,
    CASE episode_type
        WHEN 'planned_closure' THEN COALESCE(LEFT(closure_alert_header, 140), 'Planned service change')
        WHEN 'disruption' THEN
            CASE WHEN max_daily_snow_cm >= 5 THEN 'Disruption during or after heavy snow'
                 WHEN max_gust_kmh >= 80     THEN 'Disruption during high winds'
                 ELSE 'Disruption (no clear weather or alert cause)' END
        ELSE 'Trips not matched to the schedule at a normal service level (possible data gap)'
    END AS label
FROM agg
ORDER BY start_date, route_id