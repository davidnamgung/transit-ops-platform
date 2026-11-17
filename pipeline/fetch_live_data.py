"""
Download the data files the live website is showing right now.

This is what lets a change to the website's own code go live without rerunning the whole pipeline: the site
is rebuilt with the new code and exactly the data it was already showing. The data comes from the published
site itself, so it never expires and always matches what visitors currently see.

It is all or nothing. Every file is downloaded and checked first (valid JSON, a list, and at least a minimum
number of rows) and only then written, so a half-downloaded or damaged set is never published.

Uses only Python's standard library.

Usage:
    python3 pipeline/fetch_live_data.py --base https://you.github.io/project --out exports

Exit code: 0 when all four files were fetched, checked, and written; 1 otherwise (nothing is written).
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# the four files the website needs, and the fewest rows each should ever have
FILES = {"line_days.json": 500, "episodes.json": 1, "hourly_weather.json": 100, "stations.json": 50}
USER_AGENT = "headway-site-publisher (+https://github.com/davidnamgung/transit-ops-platform)"


def fetch(url):
    """The text at url, or a plain-language reason it could not be fetched."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8"), None
    except urllib.error.HTTPError as err:
        return None, f"HTTP {err.code}"
    except (urllib.error.URLError, TimeoutError, OSError):
        return None, "could not connect"


def check(name, text, minimum):
    """The parsed rows, or a plain-language reason the file is not usable."""
    if text.lstrip().startswith("<"):
        return None, "got a web page instead of data (the file is missing from the site)"
    try:
        rows = json.loads(text)
    except ValueError:
        return None, "is not valid JSON"
    if not isinstance(rows, list):
        return None, "is not a list of rows"
    if len(rows) < minimum:
        return None, f"has only {len(rows)} rows (expected at least {minimum})"
    return rows, None


def main():
    parser = argparse.ArgumentParser(description="Download the live site's data files.")
    parser.add_argument("--base", required=True, help="the site's address, for example https://you.github.io/project")
    parser.add_argument("--out", default="exports", help="where to write the files")
    args = parser.parse_args()

    base = args.base.rstrip("/")
    stamp = int(time.time())  # defeats any cached copy
    good, problems = {}, []
    for name, minimum in FILES.items():
        text, why = fetch(f"{base}/data/{name}?t={stamp}")
        if text is not None:
            rows, why = check(name, text, minimum)
            if rows is not None:
                good[name] = text
                print(f"  {name:<20} {len(rows):>6,} rows")
                continue
        problems.append(f"{name} {why}")
    if problems:
        print("FAILED: the live site's data could not be used, so nothing was written:")
        for p in problems:
            print(f"  - {p}")
        return 1

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, text in good.items():
        tmp = (out / name).with_suffix(".part")
        tmp.write_text(text)
        tmp.rename(out / name)  # write fully, then rename
    print(f"Wrote {len(good)} files to {out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
