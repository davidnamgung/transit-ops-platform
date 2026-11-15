# %% [markdown]
# # How do alert versions look in the raw file?
# Hypothesis: the newest version of most alerts is a closing record that has a
# closed time but no active period (and so no start/end).

# %% Setup
from pathlib import Path

import duckdb
import pandas as pd

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pyproject.toml").exists())
RAW = ROOT / "data/raw/alerts/LAMP_RT_ALERTS.parquet"
con = duckdb.connect()  # in memory: does not touch the warehouse
con.execute("SET TimeZone = 'UTC'")
pd.set_option("display.width", 220)
pd.set_option("display.max_columns", 50)
pd.set_option("display.max_rows", 100)


def q(sql):
    """Run SQL and return a pandas table."""
    cur = con.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


print("Setup complete.")

# %% 1. Every version of four alerts we know about
# 685308 = Blue weekend closure, 691316 = Red snow delays,
# 691237 = Blue switch/signal problem, 1039320 = Green Line Halloween closure
q(f"""
SELECT id AS alert_id,
       to_timestamp(last_modified_timestamp)                       AS modified_utc,
       COUNT(*)                                                    AS n_rows,
       list_sort(list_distinct(list("informed_entity.route_id")))  AS routes,
       to_timestamp(MIN("active_period.start_timestamp"))          AS start_utc,
       to_timestamp(MAX("active_period.end_timestamp"))            AS end_utc,
       to_timestamp(MAX(closed_timestamp))                         AS closed_utc,
       ANY_VALUE(effect)                                           AS effect,
       LEFT(ANY_VALUE("header_text.translation.text"), 60)         AS header
FROM read_parquet('{RAW}')
WHERE id IN (685308, 691316, 691237, 1039320)
GROUP BY id, last_modified_timestamp
ORDER BY id, last_modified_timestamp
LIMIT 60
""")

# %% 2. Which versions carry what, across ALL alerts?
q(f"""
WITH versions AS (
    SELECT id, last_modified_timestamp,
           COUNT("active_period.start_timestamp") AS n_start,
           COUNT("informed_entity.route_id")      AS n_route,
           COUNT(closed_timestamp)                AS n_closed,
           MAX(last_modified_timestamp) OVER (PARTITION BY id) AS newest
    FROM read_parquet('{RAW}')
    GROUP BY id, last_modified_timestamp
)
SELECT CASE WHEN last_modified_timestamp = newest THEN 'newest version'
            ELSE 'older versions' END                            AS version_kind,
       COUNT(*)                                                  AS versions,
       ROUND(100.0 * AVG(CAST(n_start  > 0 AS INTEGER)), 1)      AS pct_with_active_period,
       ROUND(100.0 * AVG(CAST(n_route  > 0 AS INTEGER)), 1)      AS pct_with_route_ids,
       ROUND(100.0 * AVG(CAST(n_closed > 0 AS INTEGER)), 1)      AS pct_with_closed_time
FROM versions
GROUP BY 1
ORDER BY 1 DESC
""")

# %% Done
con.close()