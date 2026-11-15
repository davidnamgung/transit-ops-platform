-- Staging model: one row per station, with the lines that serve it.
WITH unpacked AS (
    SELECT regexp_extract(filename, 'stops_(.+)\.json$', 1) AS route_id,
           unnest(data)                                      AS stop
    FROM read_json('data/raw/stops/stops_*.json', filename = true)
),
flat AS (
    SELECT route_id,
           stop.id                   AS station_id,
           stop.attributes.name      AS station_name,
           stop.attributes.latitude  AS latitude,
           stop.attributes.longitude AS longitude
    FROM unpacked
)
SELECT station_id,
       ANY_VALUE(station_name)                      AS station_name,
       ANY_VALUE(latitude)                          AS latitude,
       ANY_VALUE(longitude)                         AS longitude,
       string_agg(DISTINCT route_id, ', ' ORDER BY route_id) AS routes
FROM flat
GROUP BY station_id