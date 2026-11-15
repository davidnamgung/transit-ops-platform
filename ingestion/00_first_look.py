"""
First look at the MBTA live API.
Fetches current Red Line vehicle positions, prints a summary,
and saves the raw response so we can inspect it.
"""
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

# Read the .env file and load its values into environment variables.
load_dotenv()
API_KEY = os.getenv("MBTA_API_KEY")
if not API_KEY:
    raise SystemExit("MBTA_API_KEY not found. Check your .env file.")

URL = "https://api-v3.mbta.com/vehicles"
params = {"filter[route]": "Red", "page[limit]": 50}  # only Red Line, max 50 results
headers = {"x-api-key": API_KEY}                       # how we identify ourselves

# Ask the API for data. timeout stops us waiting forever if it's down.
response = requests.get(URL, params=params, headers=headers, timeout=30)
response.raise_for_status()  # stop with a clear error if the request failed
payload = response.json()    # convert the JSON text into Python dictionaries/lists

vehicles = payload["data"]
print(f"HTTP status: {response.status_code}")
print(f"Red Line vehicles reporting right now: {len(vehicles)}\n")

if not vehicles:
    print("No vehicles reporting. Trains may not be running at this hour; try again later.")

for v in vehicles[:5]:
    a = v["attributes"]
    print(
        f"vehicle {v['id']}: status={a['current_status']}, "
        f"lat={a['latitude']}, lon={a['longitude']}, updated={a['updated_at']}"
    )

# Save the untouched response. Always keep raw data; you can re-process it later.
out = Path("data/raw/first_look.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(payload, indent=2))
print(f"\nSaved raw response to {out}")