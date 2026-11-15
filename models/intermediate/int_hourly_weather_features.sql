-- Intermediate model: hourly weather plus "recent weather" totals.
-- Weather affects trains with a lag (snow that fell yesterday still matters
-- today), so we add rolling totals over the previous 24 and 72 hours.
-- A total is NULL until a full window of history exists, rather than
-- quietly undercounting during the first days of our data.
-- Named so it builds BEFORE int_stop_events_weather (files build alphabetically).
SELECT
    hour_utc,
    hour_local,
    temperature_c,
    precipitation_mm,
    snowfall_cm,
    wind_speed_kmh,
    wind_gust_kmh,
    CASE WHEN COUNT(*) OVER w24 = 24 THEN ROUND(SUM(snowfall_cm) OVER w24, 1) END       AS snow_24h_cm,
    CASE WHEN COUNT(*) OVER w72 = 72 THEN ROUND(SUM(snowfall_cm) OVER w72, 1) END       AS snow_72h_cm,
    CASE WHEN COUNT(*) OVER w24 = 24 THEN ROUND(SUM(precipitation_mm) OVER w24, 1) END  AS precip_24h_mm
FROM staging.stg_weather_hourly
WINDOW w24 AS (ORDER BY hour_utc ROWS BETWEEN 23 PRECEDING AND CURRENT ROW),
       w72 AS (ORDER BY hour_utc ROWS BETWEEN 71 PRECEDING AND CURRENT ROW)