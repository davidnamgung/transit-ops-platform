-- Intermediate model: one row per service date and line, summarizing the alerts
-- in effect that day. An alert counts if it overlaps the service day (Boston time).
-- Named so it builds after int_alerts_classified (files build alphabetically).
WITH days AS (
    SELECT DISTINCT service_date, route_id
    FROM staging.stg_lamp_stop_events
),
alert_routes AS (
    SELECT *, unnest(route_ids) AS route_id
    FROM intermediate.int_alerts_classified
)
SELECT
    d.service_date,
    d.route_id,
    COUNT(DISTINCT a.alert_id) FILTER (WHERE a.alert_kind = 'long_service_change')       AS n_long_service_change_alerts,
    COUNT(DISTINCT a.alert_id) FILTER (WHERE a.alert_kind = 'short_service_change')      AS n_short_service_change_alerts,
    COUNT(DISTINCT a.alert_id) FILTER (WHERE a.alert_kind = 'delay')                     AS n_delay_alerts,
    MAX(a.delay_minutes)       FILTER (WHERE a.alert_kind = 'delay')                     AS max_alerted_delay_min,
    arg_max(a.header, a.duration_sec) FILTER (WHERE a.alert_kind = 'long_service_change') AS longest_service_change_header
FROM days d
LEFT JOIN alert_routes a
       ON a.route_id = d.route_id
      AND a.start_ts_utc < CAST(d.service_date + 1 AS TIMESTAMP) AT TIME ZONE 'America/New_York'
      AND COALESCE(a.effective_end_utc, CAST(d.service_date + 1 AS TIMESTAMP)
                       AT TIME ZONE 'America/New_York')
          > CAST(d.service_date AS TIMESTAMP) AT TIME ZONE 'America/New_York'
GROUP BY d.service_date, d.route_id