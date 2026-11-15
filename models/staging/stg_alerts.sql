-- Staging model: one row per alert, using its newest version.
-- The raw file has one row per (alert x version x affected entity). We keep the
-- newest version of each alert and collapse its affected entities into a list.
-- Times use the *_timestamp columns (unambiguous UTC), never the *_datetime ones.
-- Many alerts have no end time and were never closed ("open-ended"). They are NOT
-- necessarily still active (some date from 2020), so we flag them, never guess.
WITH newest AS (
    SELECT id, effect, effect_detail, cause, severity, severity_level, alert_lifecycle,
           "header_text.translation.text"          AS header,
           "service_effect_text.translation.text"  AS service_effect,
           created_timestamp, last_modified_timestamp, closed_timestamp,
           "active_period.start_timestamp"         AS start_timestamp,
           "active_period.end_timestamp"           AS end_timestamp,
           "informed_entity.route_id"              AS route_id,
           "informed_entity.route_type"            AS route_type,
           MAX(last_modified_timestamp) OVER (PARTITION BY id) AS newest_version
    FROM read_parquet('data/raw/alerts/LAMP_RT_ALERTS.parquet')
),
per_alert AS (
    SELECT
        id                                           AS alert_id,
        ANY_VALUE(effect)                            AS effect,
        ANY_VALUE(effect_detail)                     AS effect_detail,
        ANY_VALUE(cause)                             AS cause,
        ANY_VALUE(severity)                          AS severity,
        ANY_VALUE(severity_level)                    AS severity_level,
        ANY_VALUE(alert_lifecycle)                   AS lifecycle,
        ANY_VALUE(header)                            AS header,
        ANY_VALUE(service_effect)                    AS service_effect,
        to_timestamp(MIN(created_timestamp))         AS created_ts_utc,
        to_timestamp(MIN(start_timestamp))           AS start_ts_utc,
        to_timestamp(MAX(end_timestamp))             AS end_ts_utc,
        bool_or(end_timestamp IS NULL)               AS has_open_period,
        to_timestamp(MAX(closed_timestamp))          AS closed_ts_utc,
        list_sort(list_distinct(list(route_id)))     AS route_ids,
        bool_or(route_type IN (0, 1))                AS touches_subway_type,
        COUNT(*)                                     AS n_entity_rows
    FROM newest
    WHERE last_modified_timestamp = newest_version
    GROUP BY id
),
with_end AS (
    SELECT *,
           CASE WHEN end_ts_utc IS NOT NULL AND NOT has_open_period
                     AND closed_ts_utc IS NOT NULL THEN LEAST(end_ts_utc, closed_ts_utc)
                WHEN end_ts_utc IS NOT NULL AND NOT has_open_period THEN end_ts_utc
                ELSE closed_ts_utc END               AS effective_end_utc
    FROM per_alert
)
SELECT *, effective_end_utc IS NULL AS is_open_ended
FROM with_end
WHERE list_has_any(route_ids, ['Red','Orange','Blue','Green-B','Green-C','Green-D','Green-E','Mattapan'])
   OR touches_subway_type