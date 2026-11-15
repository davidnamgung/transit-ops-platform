"""
Inspect every LAMP file on disk: rows, distinct service dates, and whether the
service date inside the file matches its filename. Prints only the anomalies.

Usage:  uv run python checks/05_inspect_files_on_disk.py
"""
import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

files = sorted(Path("data/raw/lamp").glob("20*.parquet"))
con = duckdb.connect()
problems, total_rows = [], 0

for f in files:
    day = f.stem  # e.g. "2026-01-07"
    expected = int(day.replace("-", ""))  # LAMP stores dates like 20260107
    size_kb = f.stat().st_size / 1000
    try:
        rows, n_dates, min_d, max_d = con.execute(
            f"""SELECT COUNT(*), COUNT(DISTINCT service_date),
                       MIN(service_date), MAX(service_date)
                FROM read_parquet('{f}')"""
        ).fetchall()[0]
    except duckdb.Error as err:  # unreadable file or missing column
        problems.append((day, f"{size_kb:,.0f} KB", f"ERROR: {str(err)[:80]}"))
        continue
    total_rows += rows
    if rows == 0 or n_dates != 1 or min_d != expected:
        problems.append((day, f"{size_kb:,.0f} KB", rows, n_dates, min_d, max_d))

print(f"Inspected {len(files)} files; {total_rows:,} rows on disk in total.")
print("(The warehouse currently holds 14,538,608 staging rows. Compare the two.)")
print(f"\n{len(problems)} file(s) with anomalies "
      "(empty, several dates, or a date different from the filename):")
for row in problems:
    print("  ", row)