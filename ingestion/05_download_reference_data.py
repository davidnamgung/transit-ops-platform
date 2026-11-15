"""
Download reference data and check our data gaps.
  1. Station names and locations from the MBTA API
  2. LAMP's alerts history (service alerts over time)
  3. Inspect the alerts schema. We do not assume column names.
  4. Check whether our 17 missing service dates are listed in LAMP's index.csv

Usage:  uv run python ingestion/05_download_reference_data.py
"""
import json
import os
from pathlib import Path

import duckdb
import pandas as pd
import requests
from dotenv import load_dotenv

from lamp_utils import download  # the shared helper from earlier

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
load_dotenv()
KEY = os.getenv("MBTA_API_KEY")
if not KEY:
    raise SystemExit("MBTA_API_KEY not found. Check your .env file.")

# 1. Stations: one request per line (location_type 1 = a whole station, not a platform)
ROUTES = ["Red", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E", "Mattapan"]
stops_dir = Path("data/raw/stops")
stops_dir.mkdir(parents=True, exist_ok=True)
print("STATIONS")
for route in ROUTES:
    r = requests.get(
        "https://api-v3.mbta.com/stops",
        params={"filter[route]": route, "filter[location_type]": 1, "page[limit]": 100},
        headers={"x-api-key": KEY},
        timeout=30,
    )
    r.raise_for_status()
    payload = r.json()
    (stops_dir / f"stops_{route}.json").write_text(json.dumps(payload))
    print(f"  {route:<9} {len(payload['data'])} stations")

# 2. Alerts history (the download helper stops if the file is over 500 MB)
URL = "https://performancedata.mbta.com/lamp/tableau/alerts/LAMP_RT_ALERTS.parquet"
alerts_path = Path("data/raw/alerts/LAMP_RT_ALERTS.parquet")
if alerts_path.exists():
    print("\nAlerts file already downloaded.")
else:
    status = download(URL, alerts_path)
    if status != "ok":
        raise SystemExit(f"Alerts download did not succeed (status: {status}).")
print(f"\nALERTS FILE: {alerts_path.stat().st_size / 1e6:,.1f} MB")

# 3. Inspect the alerts schema
con = duckdb.connect()
p = str(alerts_path)
print("\nALERTS SCHEMA (column name, type):")
for name, dtype, *_ in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{p}')").fetchall():
    print(f"  {name:<40} {dtype}")
n_rows = con.execute(f"SELECT COUNT(*) FROM read_parquet('{p}')").fetchall()[0][0]
print(f"\nALERT ROWS: {n_rows:,}")
cur = con.execute(f"SELECT * FROM read_parquet('{p}') LIMIT 1")
cols = [d[0] for d in cur.description]
sample = cur.fetchall()
if sample:
    print("\nONE SAMPLE ROW:")
    for col, val in zip(cols, sample[0]):
        print(f"  {col:<40} {str(val)[:100]}")

# 4. Our missing service dates versus LAMP's index
wh = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)
have = {r[0] for r in wh.execute(
    "SELECT DISTINCT service_date FROM staging.stg_lamp_stop_events").fetchall()}
wh.close()
missing = sorted(set(pd.date_range(min(have), max(have)).date) - have)

index = pd.read_csv("data/raw/lamp/index.csv").astype(str)
in_index = [
    d for d in missing
    if index.apply(lambda col: col.str.contains(d.isoformat(), regex=False)).any().any()
]
print(f"\nGAP CHECK: {len(missing)} dates missing from our warehouse; "
      f"{len(in_index)} of them are listed in LAMP's index.csv")
if in_index:
    print("Listed in the index but we do not have the file (re-run script 03):")
    print(" ", [d.isoformat() for d in in_index])
else:
    print("None are listed, so LAMP never published them: these are true gaps in the source.")