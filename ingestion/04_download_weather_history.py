"""
Download hourly Boston weather for the same window as the subway data.

We do not set a timezone, so Open-Meteo returns GMT (UTC). That follows our
project rule: store timestamps in UTC, convert to Boston time only for display.

Exit code: 1 if the download fails or the result is not exactly days x 24 hours,
so an automated run can stop and alert.

Usage:
    uv run python ingestion/04_download_weather_history.py            # 365 days
    uv run python ingestion/04_download_weather_history.py --prune    # also remove older weather files
"""
import argparse
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

parser = argparse.ArgumentParser()
parser.add_argument("--days", type=int, default=365)
parser.add_argument("--end-offset", type=int, default=7)
parser.add_argument("--prune", action="store_true", help="delete older weather files after a good download")
args = parser.parse_args()

end = date.today() - timedelta(days=args.end_offset)
start = end - timedelta(days=args.days - 1)

params = {
    "latitude": 42.3601,
    "longitude": -71.0589,
    "start_date": start.isoformat(),
    "end_date": end.isoformat(),
    "hourly": "temperature_2m,precipitation,snowfall,wind_speed_10m,wind_gusts_10m",
}

payload = None
for attempt in range(1, 4):
    try:
        r = requests.get("https://archive-api.open-meteo.com/v1/archive", params=params, timeout=120)
        r.raise_for_status()
        payload = r.json()
        break
    except (requests.RequestException, ValueError) as err:
        wait = 2**attempt
        print(f"  attempt {attempt}/3 failed ({err}); retrying in {wait}s")
        time.sleep(wait)
if payload is None:
    print("FAILED: could not download weather after 3 attempts.")
    sys.exit(1)

# Validate right away: did we get what we asked for?
hourly = payload["hourly"]
expected, actual = args.days * 24, len(hourly["time"])
nulls = {k: sum(v is None for v in vals) for k, vals in hourly.items() if k != "time"}
print(f"Timezone returned by API: {payload.get('timezone')}")
print(f"Window: {start} to {end}")
print(f"Hourly rows: {actual} (expected {expected})")
print(f"Missing values per column: {nulls}")
print(f"First timestamp: {hourly['time'][0]}   Last: {hourly['time'][-1]}")
if actual != expected:
    print("FAILED: row count differs from expectation. Not saving.")
    sys.exit(1)

dest = Path(f"data/raw/weather/boston_hourly_{start}_{end}.json")
dest.parent.mkdir(parents=True, exist_ok=True)
tmp = dest.with_suffix(".part")
tmp.write_text(json.dumps(payload))
tmp.rename(dest)  # write fully, then rename, so a half-written file never counts
print(f"Saved to {dest}")

if args.prune:
    removed = 0
    for f in dest.parent.glob("boston_hourly_*.json"):
        if f != dest:
            f.unlink()
            removed += 1
    if removed:
        print(f"Removed {removed} older weather file(s).")
