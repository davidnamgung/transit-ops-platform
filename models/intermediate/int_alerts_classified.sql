-- Intermediate model: each alert with a kind, a duration, and (for delays) the
-- announced minutes. Rules come from reading real headers (notebooks 08 and 10).
WITH base AS (
    SELECT
        alert_id, effect, severity AS peak_severity, header, route_ids,
        start_ts_utc, effective_end_utc, is_open_ended,
        epoch(effective_end_utc) - epoch(start_ts_utc) AS duration_sec,
        lower(header)                                  AS h
    FROM staging.stg_alerts
    WHERE start_ts_utc IS NOT NULL
)
SELECT
    alert_id, effect, peak_severity, header, route_ids,
    start_ts_utc, effective_end_utc, is_open_ended, duration_sec,
    CASE
        WHEN effect IN ('DETOUR', 'NO_SERVICE', 'REDUCED_SERVICE',
                        'MODIFIED_SERVICE', 'ADDITIONAL_SERVICE') THEN
            CASE WHEN regexp_matches(h, 'not stopping|skipping|bypass')       THEN 'station_skip'
                 WHEN regexp_matches(h, 'station is closed|stations are closed')
                      AND NOT regexp_matches(h, 'between')                    THEN 'station_closure'
                 WHEN is_open_ended                                           THEN 'service_change_open_ended'
                 WHEN duration_sec >= 43200                                   THEN 'long_service_change'
                 ELSE 'short_service_change' END
        WHEN effect = 'ACCESSIBILITY_ISSUE'
             OR regexp_matches(h, 'elevator|escalator|parking|garage|pedal|bike|staircase|multi use path')
                                                                              THEN 'facility'
        WHEN h LIKE '%delay%'                                                 THEN 'delay'
        WHEN regexp_matches(h, 'temporarily (terminat|stopp|bypass|suspend)|will temporarily|standing by|service is stopped|trains are bypassing')
                                                                              THEN 'incident_disruption'
        WHEN regexp_matches(h, 'storm|extreme heat|heat advisory|snow|flood|weather')
                                                                              THEN 'weather_advisory'
        WHEN regexp_matches(h, 'maintenance|longer travel times|reduced speeds|inspection|construction|track work|work crew')
                                                                              THEN 'planned_work'
        ELSE 'other'
    END                                                                       AS alert_kind,
    TRY_CAST(NULLIF(regexp_extract(h, '(\d+)\s+minutes', 1), '') AS INTEGER)  AS delay_minutes
FROM base