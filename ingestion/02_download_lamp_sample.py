"""
Download one day of MBTA subway performance data (LAMP) and inspect it.

Why: the live API only shows "now". LAMP publishes one Parquet file per
service date, which powers our historical analysis.
We do NOT assume column names. We read the schema first.
"""
from datetime import date, timedelta
from pathlib import Path

import duckdb
import requests

BASE = "https://performancedata.mbta.com/lamp/subway-on-time-performance-v1"
OUT_DIR = Path("data/raw/lamp")
OUT_DIR.mkdir(parents=True, exist_ok=True)
MAX_MB = 500  # safety limit so we never accidentally download something huge


def download(url, dest):
    """Stream a file to disk. Returns True on success, False if not found."""
    with requests.get(url, stream=True, timeout=60) as r:
        if r.status_code == 404:
            return False
        r.raise_for_status()
        size_mb = int(r.headers.get("Content-Length", 0)) / 1_000_000
        if size_mb > MAX_MB:
            raise SystemExit(f"File is {size_mb:.0f} MB, over the {MAX_MB} MB limit.")
        # Write to a temporary file first, then rename. If the download is
        # interrupted, we never leave a half-written file that looks complete.
        tmp = dest.with_suffix(".part")
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
        tmp.rename(dest)
    return True


con = duckdb.connect()  # an in-memory DuckDB database

# 1. The index lists every service date that has been published.
index_path = OUT_DIR / "index.csv"
if not download(f"{BASE}/index.csv", index_path):
    raise SystemExit("Could not find index.csv. The LAMP site may have changed.")
print("INDEX FILE (first 5 rows):")
print(con.sql(f"SELECT * FROM read_csv('{index_path}') LIMIT 5"))
n_dates = con.sql(f"SELECT COUNT(*) FROM read_csv('{index_path}')").fetchall()[0][0]
print(f"Total rows in index: {n_dates}\n")

# 2. Download one day. Start 10 days ago (inside our weather window)
#    and step back until we find a published file.
parquet_path = None
for days_back in range(10, 17):
    service_date = (date.today() - timedelta(days=days_back)).isoformat()
    url = f"{BASE}/{service_date}-subway-on-time-performance-v1.parquet"
    dest = OUT_DIR / f"{service_date}.parquet"
    print(f"Trying {service_date} ...")
    # If we already have the file, skip the download. Running the script
    # twice gives the same result. This property is called "idempotent".
    if dest.exists() or download(url, dest):
        parquet_path = dest
        break

if parquet_path is None:
    raise SystemExit("No file found in the last 16 days. Check index.csv.")

size_mb = parquet_path.stat().st_size / 1_000_000
print(f"\nUsing service date {service_date} ({size_mb:.1f} MB on disk)")

# 3. Inspect with DuckDB: schema, row count, one sample row.
p = str(parquet_path)

print("\nSCHEMA (column name, type):")
for name, dtype, *_ in con.sql(f"DESCRIBE SELECT * FROM read_parquet('{p}')").fetchall():
    print(f"  {name:<40} {dtype}")

rows = con.sql(f"SELECT COUNT(*) FROM read_parquet('{p}')").fetchall()[0][0]
print(f"\nROWS: {rows:,}")

rel = con.sql(f"SELECT * FROM read_parquet('{p}') LIMIT 1")
sample = rel.fetchall()
if sample:
    print("\nONE SAMPLE ROW:")
    for col, val in zip(rel.columns, sample[0]):
        print(f"  {col:<40} {val}")