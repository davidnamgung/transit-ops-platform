"""
Download hourly Boston weather for the same window as the subway data.

We do not set a timezone, so Open-Meteo returns GMT (UTC). That follows our
project rule: store timestamps in UTC, convert to Boston time only for display.
"""
import argparse
import json
from datetime import date, timedelta
from pathlib import Path

import requests

parser = argparse.ArgumentParser()
parser.add_argument("--days", type=int, default=365)
parser.add_argument("--end-offset", type=int, default=7)
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
r = requests.get("https://archive-api.open-meteo.com/v1/archive", params=params, timeout=120)
r.raise_for_status()
payload = r.json()

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
    print("WARNING: row count differs from expectation. Investigate before using.")

dest = Path(f"data/raw/weather/boston_hourly_{start}_{end}.json")
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(payload))
print(f"Saved to {dest}")