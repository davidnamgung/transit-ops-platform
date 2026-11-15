"""
Download station names and locations for every subway line from the MBTA API.

Stations rarely change, so files younger than a week are kept. The API key is
optional: with one the limit is higher, without one it is still enough for 8 requests.

Usage:
    uv run python ingestion/07_refresh_stations.py
    uv run python ingestion/07_refresh_stations.py --max-age-days 0    # force a refresh

Exit code: 1 if any line cannot be downloaded or has no stations.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("MBTA_API_KEY")
ROUTES = ["Red", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E", "Mattapan"]
OUT = Path("data/raw/stops")

parser = argparse.ArgumentParser()
parser.add_argument("--max-age-days", type=float, default=7)
args = parser.parse_args()

OUT.mkdir(parents=True, exist_ok=True)
headers = {"x-api-key": KEY} if KEY else {}
print("API key:", "found" if KEY else "not set (using the anonymous limit)")
failed = []
for route in ROUTES:
    dest = OUT / f"stops_{route}.json"
    if dest.exists() and (time.time() - dest.stat().st_mtime) / 86400 < args.max_age_days:
        print(f"  {route:<9} kept (fresh enough)")
        continue
    payload = None
    for attempt in range(1, 4):
        try:
            r = requests.get(
                "https://api-v3.mbta.com/stops",
                params={"filter[route]": route, "filter[location_type]": 1, "page[limit]": 100},
                headers=headers,
                timeout=30,
            )
            r.raise_for_status()
            payload = r.json()
            break
        except (requests.RequestException, ValueError) as err:
            wait = 2**attempt
            print(f"  {route}: attempt {attempt}/3 failed ({err}); retrying in {wait}s")
            time.sleep(wait)
    n = len(payload["data"]) if payload else 0
    if n == 0:
        failed.append(route)
        print(f"  {route:<9} FAILED")
        continue
    tmp = dest.with_suffix(".part")
    tmp.write_text(json.dumps(payload))
    tmp.rename(dest)
    print(f"  {route:<9} {n} stations")
    time.sleep(3.2 if not KEY else 0.2)  # stay under the anonymous limit of 20 requests a minute

if failed:
    print("FAILED lines:", failed)
    sys.exit(1)
