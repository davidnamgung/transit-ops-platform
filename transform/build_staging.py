"""
Build the warehouse: run every SQL file in models/<layer>/ against the raw
data, layer by layer (staging -> intermediate -> marts). Each file becomes a
table named after the file, in a schema named after the layer.

Safe to re-run: every table is rebuilt (CREATE OR REPLACE).

Usage:  uv run python transform/build_staging.py
Testing with fewer CPU threads (to check results do not depend on the machine):
        DUCKDB_THREADS=1 uv run python transform/build_staging.py
"""
import os
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)  # the SQL files use paths relative to the project root

DB_PATH = Path("data/warehouse/transit.duckdb")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

LAYERS = ["staging", "intermediate", "marts"]  # order matters: later layers read earlier ones

# Fail early, before touching the warehouse, if any layer has no SQL files.
for layer in LAYERS:
    if not list((Path("models") / layer).glob("*.sql")):
        raise SystemExit(
            f"No .sql files found in models/{layer}/. "
            "Check the folder and file names (run: find models -type f)."
        )

try:
    con = duckdb.connect(str(DB_PATH))
except duckdb.IOException as err:
    raise SystemExit(
        "Cannot open the warehouse: another program has it open.\n"
        "Close any notebook that uses it (restart its kernel, then close it).\n"
        "To see what is holding it:  lsof data/warehouse/transit.duckdb\n"
        f"Original error: {str(err)[:200]}"
    )

con.execute("SET TimeZone = 'UTC'")  # the pipeline always works in UTC
threads = os.environ.get("DUCKDB_THREADS")
if threads:
    con.execute(f"SET threads = {int(threads)}")
    print(f"Using {int(threads)} thread(s)")

for layer in LAYERS:
    con.execute(f"CREATE SCHEMA IF NOT EXISTS {layer}")
    print(f"\n== {layer} ==")
    for sql_file in sorted((Path("models") / layer).glob("*.sql")):
        name = sql_file.stem
        sql = sql_file.read_text().strip().rstrip(";")
        start = time.time()
        print(f"Building {layer}.{name} ...", end=" ", flush=True)
        con.execute(f"CREATE OR REPLACE TABLE {layer}.{name} AS\n{sql}")
        n_rows = con.execute(f"SELECT COUNT(*) FROM {layer}.{name}").fetchall()[0][0]
        print(f"{n_rows:,} rows in {time.time() - start:.1f}s")

con.close()
print(f"\nDone. Warehouse file: {DB_PATH} ({DB_PATH.stat().st_size / 1e6:,.0f} MB)")