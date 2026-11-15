"""
Export the marts as JSON files for the web app (the app reads these files).
Safe to re-run: files are overwritten.

Usage:  uv run python transform/export_for_app.py
"""
import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

OUT = Path("exports")
OUT.mkdir(exist_ok=True)
con = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)

EXPORTS = {
    "line_days": "SELECT * FROM marts.mart_line_day_context ORDER BY service_date, route_id",
    "episodes": "SELECT * FROM marts.mart_line_episodes ORDER BY start_date, route_id",
    "hourly_weather": """SELECT * FROM marts.mart_hourly_weather_reliability
                         ORDER BY route_id, weather_category, hour_local, is_weekend""",
    "stations": """SELECT station_id, station_name, latitude, longitude, routes
                   FROM staging.stg_stations ORDER BY station_name""",
}

for name, sql in EXPORTS.items():
    path = OUT / f"{name}.json"
    n_rows = con.execute(f"SELECT COUNT(*) FROM ({sql})").fetchall()[0][0]
    con.execute(f"COPY ({sql}) TO '{path}' (FORMAT JSON, ARRAY true)")
    size_kb = path.stat().st_size / 1000
    print(f"{name:<16} {n_rows:>6,} rows  {size_kb:>8,.0f} KB  -> {path}")