"""
Audit the downloaded LAMP files before we build on them.
Checks: (1) schema consistency, (2) daily volume, (3) filename vs service_date.
"""
from collections import Counter
from pathlib import Path

import duckdb
import pandas as pd

LAMP_DIR = Path("data/raw/lamp")
GLOB = f"{LAMP_DIR}/20*.parquet"
files = sorted(LAMP_DIR.glob("20*.parquet"))
if not files:
    raise SystemExit("No files found. Run ingestion/03_download_lamp_range.py first.")

con = duckdb.connect()
print(f"Auditing {len(files)} files: {files[0].stem} to {files[-1].stem}\n")

# CHECK 1: does every file have the same columns and types?
# Silent column changes ("schema drift") are a classic way pipelines break.
schemas = {}
for f in files:
    cur = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{f}')")
    schemas[f.name] = tuple((row[0], row[1]) for row in cur.fetchall())
counts = Counter(schemas.values())
common, n_common = counts.most_common(1)[0]
print(f"CHECK 1 (schema): {len(counts)} distinct schema(s); "
      f"the most common is used by {n_common} of {len(files)} files")
if len(counts) > 1:
    common_cols = dict(common)
    odd = [(n, s) for n, s in schemas.items() if s != common]
    for name, schema in odd[:15]:
        cols = dict(schema)
        added = sorted(set(cols) - set(common_cols))
        removed = sorted(set(common_cols) - set(cols))
        retyped = sorted(c for c in cols if c in common_cols and cols[c] != common_cols[c])
        print(f"  {name}: added={added} removed={removed} type_changed={retyped}")
    if len(odd) > 15:
        print(f"  ... and {len(odd) - 15} more differing files")

# CHECK 2: rows per service date. Very low days deserve a look.
cur = con.execute(f"""
    SELECT service_date, COUNT(*) AS n_rows, COUNT(DISTINCT trip_id) AS n_trips
    FROM read_parquet('{GLOB}', union_by_name = true)
    GROUP BY service_date
    ORDER BY service_date
""")
daily = pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])
median = daily["n_rows"].median()
print(f"\nCHECK 2 (volume): {len(daily)} service dates; rows per day: "
      f"min {daily['n_rows'].min():,}, median {median:,.0f}, max {daily['n_rows'].max():,}")
low = daily[daily["n_rows"] < 0.5 * median]
print(f"Days below 50% of the median: {len(low)}")
if len(low):
    print(low.to_string(index=False))

# CHECK 3: does each file contain only its own service date?
cur = con.execute(rf"""
    SELECT COUNT(*) FROM (
        SELECT regexp_replace(regexp_extract(filename, '(\d{{4}}-\d{{2}}-\d{{2}})', 1), '-', '') AS file_date,
               CAST(service_date AS VARCHAR) AS sd
        FROM read_parquet('{GLOB}', union_by_name = true, filename = true)
    ) WHERE file_date <> sd
""")
bad_rows = cur.fetchall()[0][0]
print(f"\nCHECK 3 (filename vs service_date): {bad_rows:,} rows disagree with their filename")