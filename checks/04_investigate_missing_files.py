"""
Why are service dates listed in LAMP's index.csv absent from our data?
For each missing date: show its index row and test the URL we constructed.

Usage:  uv run python checks/04_investigate_missing_files.py
"""
import os
from pathlib import Path

import duckdb
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
BASE = "https://performancedata.mbta.com/lamp/subway-on-time-performance-v1"

index = pd.read_csv("data/raw/lamp/index.csv")
print("index.csv columns:", list(index.columns))
print(index.head(3).to_string(), "\n")

wh = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)
have = {r[0] for r in wh.execute(
    "SELECT DISTINCT service_date FROM staging.stg_lamp_stop_events").fetchall()}
wh.close()
missing = sorted(set(pd.date_range(min(have), max(have)).date) - have)

as_text = index.astype(str)
for d in missing:
    day = d.isoformat()
    hits = index[as_text.apply(lambda col: col.str.contains(day, regex=False)).any(axis=1)]
    url = f"{BASE}/{day}-subway-on-time-performance-v1.parquet"
    with requests.get(url, stream=True, timeout=30) as r:  # stream: do not download the body
        status, size = r.status_code, r.headers.get("Content-Length")
    print(f"{day}: index rows={len(hits)}, our URL -> HTTP {status}, size={size}")
    if len(hits):
        print("    index row:", hits.iloc[0].to_dict())
        