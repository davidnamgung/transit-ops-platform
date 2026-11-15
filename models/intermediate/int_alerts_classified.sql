-- Intermediate model: each alert with a kind, a duration, and (for delays) the
-- announced minutes. Rules come from reading real headers (see notebook 08).
SELECT
    alert_id,
    effect,
    severity                                                  AS peak_severity,
    header,
    route_ids,
    start_ts_utc,
    effective_end_utc,
    is_open_ended,
    epoch(effective_end_utc) - epoch(start_ts_utc)            AS duration_sec,
    CASE
        WHEN effect IN ('DETOUR', 'NO_SERVICE', 'REDUCED_SERVICE',
                        'MODIFIED_SERVICE', 'ADDITIONAL_SERVICE') THEN
            CASE WHEN is_open_ended THEN 'service_change_open_ended'
                 WHEN epoch(effective_end_utc) - epoch(start_ts_utc) >= 43200
                      THEN 'long_service_change'            -- 12 hours or more
                 ELSE 'short_service_change' END
        WHEN effect = 'ACCESSIBILITY_ISSUE'
             OR regexp_matches(lower(header), 'elevator|escalator|parking|garage|pedal|bike')
                                                              THEN 'facility'
        WHEN lower(header) LIKE '%delay%'                     THEN 'delay'
        ELSE 'other'
    END                                                       AS alert_kind,
    TRY_CAST(NULLIF(regexp_extract(lower(header), '(\d+)\s+minutes', 1), '') AS INTEGER)
                                                              AS delay_minutes
FROM staging.stg_alerts
WHERE start_ts_utc IS NOT NULL