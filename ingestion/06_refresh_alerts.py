"""
Download LAMP's alert history, replacing the local copy when it is older than a day.

The file holds every alert since 2019 (about 134 MB), so a fresh copy each day is
cheap. After downloading, the file is opened and sanity-checked before it is used.

Usage:
    uv run python ingestion/06_refresh_alerts.py
    uv run python ingestion/06_refresh_alerts.py --max-age-hours 0     # force a fresh copy

Exit code: 1 if the download fails or the file looks wrong.
"""
import argparse
import sys
import time
from pathlib import Path

import duckdb

from lamp_utils import download

URL = "https://performancedata.mbta.com/lamp/tableau/alerts/LAMP_RT_ALERTS.parquet"
DEST = Path("data/raw/alerts/LAMP_RT_ALERTS.parquet")
MIN_ROWS = 1_000_000  # the real file has about 5 million rows

parser = argparse.ArgumentParser()
parser.add_argument("--max-age-hours", type=float, default=20)
args = parser.parse_args()

age_h = (time.time() - DEST.stat().st_mtime) / 3600 if DEST.exists() else None
if age_h is not None and age_h < args.max_age_hours:
    print(f"Alert file is {age_h:.1f} hours old (limit {args.max_age_hours}); keeping it.")
else:
    print("Downloading the alert history ...")
    status = download(URL, DEST)
    if status != "ok":
        print(f"FAILED: alert download did not succeed (status: {status}).")
        sys.exit(1)

try:
    con = duckdb.connect()
    rows, newest = con.execute(
        f"SELECT COUNT(*), MAX(created_timestamp) FROM read_parquet('{DEST}')"
    ).fetchall()[0]
except duckdb.Error as err:
    print(f"FAILED: alert file could not be read: {err}")
    sys.exit(1)

print(f"Alert file: {DEST.stat().st_size / 1e6:,.1f} MB, {rows:,} rows, newest alert created at Unix time {newest}")
if rows < MIN_ROWS:
    print(f"FAILED: only {rows:,} rows, expected at least {MIN_ROWS:,}. The file may be truncated or changed.")
    sys.exit(1)
