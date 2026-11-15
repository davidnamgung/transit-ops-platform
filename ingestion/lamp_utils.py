"""Shared helpers for downloading LAMP files. Imported by other scripts."""
import time
from pathlib import Path

import requests

BASE = "https://performancedata.mbta.com/lamp/subway-on-time-performance-v1"
OUT_DIR = Path("data/raw/lamp")
MAX_MB = 500  # safety limit per file


def download(url, dest, retries=3):
    """Download url to dest. Returns 'ok', 'missing' (HTTP 403/404), or 'failed'."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, retries + 1):
        try:
            with requests.get(url, stream=True, timeout=60) as r:
                # This host answers 403 (not 404) for files that do not exist, so both
                # mean "not published". If many 403s suddenly appear, suspect blocking.
                if r.status_code in (403, 404):
                    return "missing"
                r.raise_for_status()
                size_mb = int(r.headers.get("Content-Length", 0)) / 1_000_000
                if size_mb > MAX_MB:
                    print(f"  skipping {url}: {size_mb:.0f} MB is over the limit")
                    return "failed"
                tmp = dest.with_suffix(".part")  # write to a temp file, then rename
                try:
                    with open(tmp, "wb") as f:
                        for chunk in r.iter_content(chunk_size=1024 * 1024):
                            f.write(chunk)
                    tmp.rename(dest)  # only now does the file appear under its real name
                except Exception:
                    tmp.unlink(missing_ok=True)  # never leave a half-downloaded file behind
                    raise
                return "ok"
        except requests.RequestException as err:
            wait = 2**attempt  # wait 2s, then 4s, then 8s ("exponential backoff")
            print(f"  attempt {attempt}/{retries} failed ({err}); retrying in {wait}s")
            time.sleep(wait)
    return "failed"
