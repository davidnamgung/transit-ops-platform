-- Staging model: one row per alert, reconstructed from ALL of its versions.
-- The raw file has one row per (alert x version x affected entity), and the
-- newest version is often a closing record without an active period. So:
--   * text and category fields: from the newest version that has a value
--   * routes: the union across all versions
--   * start / end / closed times: earliest start, latest end, latest close seen
-- Times use the *_timestamp columns (unambiguous UTC), never the *_datetime ones.
-- An alert with no end and no closing time is flagged "open-ended"; we never
-- guess how long it lasted.
WITH versions AS (
    SELECT
        id,
        last_modified_timestamp,
        ANY_VALUE(effect)                                    AS effect,
        ANY_VALUE(effect_detail)                             AS effect_detail,
        ANY_VALUE(cause)                                     AS cause,
        ANY_VALUE(severity)                                  AS severity,
        ANY_VALUE(severity_level)                            AS severity_level,
        ANY_VALUE(alert_lifecycle)                           AS lifecycle,
        ANY_VALUE("header_text.translation.text")            AS header,
        ANY_VALUE("service_effect_text.translation.text")    AS service_effect,
        MIN(created_timestamp)                               AS created_timestamp,
        MIN("active_period.start_timestamp")                 AS start_timestamp,
        MAX("active_period.end_timestamp")                   AS end_timestamp,
        MAX(closed_timestamp)                                AS closed_timestamp,
        list_distinct(list("informed_entity.route_id"))      AS route_ids,
        bool_or("informed_entity.route_type" IN (0, 1))      AS touches_subway_type
    FROM read_parquet('data/raw/alerts/LAMP_RT_ALERTS.parquet')
    GROUP BY id, last_modified_timestamp
),
per_alert AS (
    SELECT
        id                                                   AS alert_id,
        arg_max(effect, last_modified_timestamp)         FILTER (WHERE effect IS NOT NULL)         AS effect,
        arg_max(effect_detail, last_modified_timestamp)  FILTER (WHERE effect_detail IS NOT NULL)  AS effect_detail,
        arg_max(cause, last_modified_timestamp)          FILTER (WHERE cause IS NOT NULL)          AS cause,
        arg_max(severity, last_modified_timestamp)       FILTER (WHERE severity IS NOT NULL)       AS severity,
        arg_max(severity_level, last_modified_timestamp) FILTER (WHERE severity_level IS NOT NULL) AS severity_level,
        arg_max(lifecycle, last_modified_timestamp)      FILTER (WHERE lifecycle IS NOT NULL)      AS lifecycle,
        arg_max(header, last_modified_timestamp)         FILTER (WHERE header IS NOT NULL)         AS header,
        arg_max(service_effect, last_modified_timestamp) FILTER (WHERE service_effect IS NOT NULL) AS service_effect,
        to_timestamp(MIN(created_timestamp))                 AS created_ts_utc,
        to_timestamp(MIN(start_timestamp))                   AS start_ts_utc,
        to_timestamp(MAX(end_timestamp))                     AS end_ts_utc,
        to_timestamp(MAX(closed_timestamp))                  AS closed_ts_utc,
        list_sort(list_distinct(flatten(list(route_ids))))   AS route_ids,
        bool_or(touches_subway_type)                         AS touches_subway_type,
        COUNT(*)                                             AS n_versions
    FROM versions
    GROUP BY id
),
with_end AS (
    SELECT *,
           CASE WHEN end_ts_utc IS NOT NULL AND closed_ts_utc IS NOT NULL
                     THEN LEAST(end_ts_utc, closed_ts_utc)
                WHEN end_ts_utc IS NOT NULL THEN end_ts_utc
                ELSE closed_ts_utc END                       AS effective_end_utc
    FROM per_alert
)
SELECT *, effective_end_utc IS NULL AS is_open_ended
FROM with_end
WHERE list_has_any(route_ids, ['Red','Orange','Blue','Green-B','Green-C','Green-D','Green-E','Mattapan'])
   OR touches_subway_type