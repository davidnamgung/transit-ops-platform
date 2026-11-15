"""
Download many days of LAMP subway performance data.

Safe to re-run: files we already have are skipped (idempotent), so if it is
interrupted you simply run it again and it resumes where it left off.

Usage (run from the project folder):
    uv run python ingestion/03_download_lamp_range.py --days 10   # small test
    uv run python ingestion/03_download_lamp_range.py             # default: 365 days
"""
import argparse
import time
from datetime import date, timedelta

from lamp_utils import BASE, OUT_DIR, download

parser = argparse.ArgumentParser(description="Download a range of LAMP daily files.")
parser.add_argument("--days", type=int, default=365, help="how many days to fetch")
parser.add_argument(
    "--end-offset",
    type=int,
    default=7,
    help="newest day = today minus this many days (recent days may not be published yet)",
)
args = parser.parse_args()

end = date.today() - timedelta(days=args.end_offset)
wanted = [end - timedelta(days=i) for i in range(args.days - 1, -1, -1)]  # oldest -> newest
print(f"Window: {wanted[0]} to {wanted[-1]} ({len(wanted)} days)\n")

downloaded, skipped, missing, failed = 0, 0, [], []
for i, d in enumerate(wanted, start=1):
    day = d.isoformat()
    dest = OUT_DIR / f"{day}.parquet"
    if dest.exists():
        skipped += 1
    else:
        status = download(f"{BASE}/{day}-subway-on-time-performance-v1.parquet", dest)
        if status == "ok":
            downloaded += 1
        elif status == "missing":
            missing.append(day)
        else:
            failed.append(day)
        time.sleep(0.2)  # be polite to the server
    if i % 25 == 0 or i == len(wanted):
        print(f"  {i}/{len(wanted)} processed ...")

print(f"\nDownloaded: {downloaded}   Already had: {skipped}   "
      f"Not published: {len(missing)}   Failed: {len(failed)}")
if missing:
    print("Not published (first 10):", missing[:10])
    (OUT_DIR / "_missing_dates.txt").write_text("\n".join(missing))
if failed:
    print("FAILED (re-run the script to retry):", failed)