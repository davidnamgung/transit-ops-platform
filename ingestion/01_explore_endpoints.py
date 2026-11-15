"""
Explore the other MBTA endpoints and a free weather source.
Goal: understand what data exists, what it looks like, and what is useful.
Run it, then open the saved files in data/raw/explore/ and read them.
"""
import json
import os
from datetime import date, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()
MBTA_KEY = os.getenv("MBTA_API_KEY")
if not MBTA_KEY:
    raise SystemExit("MBTA_API_KEY not found. Check your .env file.")

MBTA_BASE = "https://api-v3.mbta.com"
OUT_DIR = Path("data/raw/explore")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def fetch(name, url, params=None, headers=None):
    """Call an API, save the raw response to disk, and return the parsed JSON.

    Returns None instead of crashing if something goes wrong, so one failure
    does not stop the rest of the exploration.
    """
    try:
        r = requests.get(url, params=params, headers=headers, timeout=30)
        r.raise_for_status()
        payload = r.json()
        (OUT_DIR / f"{name}.json").write_text(json.dumps(payload, indent=2))
        return payload
    except requests.RequestException as err:
        print(f"[FAILED] {name}: {err}")
        return None


def mbta(name, path, params):
    """Shortcut for calling the MBTA API with our key attached."""
    return fetch(name, MBTA_BASE + path, params, {"x-api-key": MBTA_KEY})


# 1. ROUTES: type 0 = light rail, type 1 = subway
routes = mbta("routes", "/routes", {"filter[type]": "0,1"})
if routes:
    print(f"\nROUTES ({len(routes['data'])})")
    for r in routes["data"]:
        print(f"  {r['id']:<14} {r['attributes']['long_name']}")

# 2. STOPS on the Red Line
stops = mbta("stops_red", "/stops", {"filter[route]": "Red"})
if stops:
    print(f"\nRED LINE STOPS: {len(stops['data'])}")
    for s in stops["data"][:5]:
        print(f"  {s['id']:<22} {s['attributes']['name']}")

# 3. ALERTS: disruptions affecting subway and light rail right now
alerts = mbta("alerts_subway", "/alerts", {"filter[route_type]": "0,1"})
if alerts:
    print(f"\nACTIVE SUBWAY/LIGHT-RAIL ALERTS: {len(alerts['data'])}")
    for a in alerts["data"][:5]:
        at = a["attributes"]
        print(f"  [{at['effect']}] severity={at['severity']}: {at['header'][:90]}")

# 4. PREDICTIONS: what the MBTA expects to happen next
preds = mbta("predictions_red", "/predictions", {"filter[route]": "Red", "page[limit]": 5})
if preds:
    print("\nPREDICTIONS (Red Line, first 5)")
    for p in preds["data"]:
        at = p["attributes"]
        print(f"  arrive={at['arrival_time']}  depart={at['departure_time']}  status={at['status']}")

# 5. SCHEDULES: what was planned for today
today = date.today().isoformat()
sched = mbta(
    "schedules_red",
    "/schedules",
    {"filter[route]": "Red", "filter[date]": today, "page[limit]": 5},
)
if sched:
    print(f"\nSCHEDULED STOP TIMES (Red Line, {today}, first 5)")
    for s in sched["data"]:
        at = s["attributes"]
        print(f"  arrive={at['arrival_time']}  depart={at['departure_time']}")

# 6. WEATHER: current conditions and a recent historical window for Boston
BOSTON = {"latitude": 42.3601, "longitude": -71.0589, "timezone": "America/New_York"}

now_w = fetch(
    "weather_now",
    "https://api.open-meteo.com/v1/forecast",
    {**BOSTON, "current": "temperature_2m,precipitation,wind_speed_10m"},
)
if now_w:
    print(f"\nWEATHER NOW: {now_w['current']}")

# The archive lags by a few days, so we ask for a window 10-14 days ago.
start = (date.today() - timedelta(days=14)).isoformat()
end = (date.today() - timedelta(days=10)).isoformat()
hist = fetch(
    "weather_history",
    "https://archive-api.open-meteo.com/v1/archive",
    {
        **BOSTON,
        "start_date": start,
        "end_date": end,
        "hourly": "temperature_2m,precipitation,snowfall,wind_speed_10m",
    },
)
if hist:
    hours = hist["hourly"]
    print(f"\nWEATHER HISTORY {start} to {end}: {len(hours['time'])} hourly rows")
    print(
        f"  first row: {hours['time'][0]}  "
        f"temp={hours['temperature_2m'][0]}  precip={hours['precipitation'][0]}"
    )

print(f"\nRaw responses saved in {OUT_DIR}/")