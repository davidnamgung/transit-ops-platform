"""
Build the staging layer: run each SQL file in models/staging/ against the
raw data and save the result as a table in a local DuckDB file.

Safe to re-run: every table is rebuilt from the raw files (CREATE OR REPLACE).

Usage:  uv run python transform/build_staging.py
"""
import os
import time
from pathlib import Path

import duckdb

# The SQL files use paths relative to the project root, so always start there.
ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

DB_PATH = Path("data/warehouse/transit.duckdb")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

models = sorted(Path("models/staging").glob("*.sql"))
if not models:
    raise SystemExit("No SQL files found in models/staging/.")

con = duckdb.connect(str(DB_PATH))
con.execute("SET TimeZone = 'UTC'")  # the pipeline always works in UTC
con.execute("CREATE SCHEMA IF NOT EXISTS staging")

for sql_file in models:
    name = sql_file.stem  # filename without .sql, e.g. stg_weather_hourly
    sql = sql_file.read_text().strip().rstrip(";")
    start = time.time()
    print(f"Building staging.{name} ...", end=" ", flush=True)
    con.execute(f"CREATE OR REPLACE TABLE staging.{name} AS\n{sql}")
    n_rows = con.execute(f"SELECT COUNT(*) FROM staging.{name}").fetchall()[0][0]
    print(f"{n_rows:,} rows in {time.time() - start:.1f}s")

con.close()
print(f"\nDone. Warehouse file: {DB_PATH} ({DB_PATH.stat().st_size / 1e6:,.0f} MB)")