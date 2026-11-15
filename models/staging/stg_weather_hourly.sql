-- Staging model: one row per hour of Boston weather, in UTC.
-- The raw JSON stores each measurement as a list; unnest() turns those
-- parallel lists into rows.
WITH unpacked AS (
    SELECT
        filename,
        unnest(hourly."time")           AS time_text,
        unnest(hourly.temperature_2m)   AS temperature_c,
        unnest(hourly.precipitation)    AS precipitation_mm,
        unnest(hourly.snowfall)         AS snowfall_cm,
        unnest(hourly.wind_speed_10m)   AS wind_speed_kmh,
        unnest(hourly.wind_gusts_10m)   AS wind_gust_kmh
    FROM read_json('data/raw/weather/boston_hourly_*.json', filename = true)
)
SELECT
    (strptime(time_text, '%Y-%m-%dT%H:%M') AT TIME ZONE 'UTC')   AS hour_utc,
    ((strptime(time_text, '%Y-%m-%dT%H:%M') AT TIME ZONE 'UTC')
        AT TIME ZONE 'America/New_York')                         AS hour_local,
    temperature_c,
    precipitation_mm,
    snowfall_cm,
    wind_speed_kmh,
    wind_gust_kmh,
    regexp_extract(filename, '[^/]+$')                           AS source_file
FROM unpacked
-- If two downloaded files overlap, keep the hour from the newest file.
QUALIFY ROW_NUMBER() OVER (PARTITION BY time_text ORDER BY filename DESC) = 1
