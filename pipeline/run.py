"""
Run the whole pipeline in order and record how it went.

    uv run python pipeline/run.py                    # everything
    uv run python pipeline/run.py --skip-download    # reuse the raw files already on disk
    uv run python pipeline/run.py --only check       # one group: download, build, check, export

What it does, in order:
  1. download   trips, weather, alerts, stations
  2. build      rebuild the warehouse from the raw files
  3. check      data-quality checks, then a freshness check
  4. export     write the small JSON files the website reads

A failed download or build stops the run at once. All the checks run even if one fails, so you
see every problem together, and the export is skipped if any check failed.
To practice handling a failure, set PIPELINE_INJECT_FAILURE to a stage name such as check/marts: that stage then fails on
purpose, with a message that says so. Nothing else changes.
The run always writes exports/pipeline_run.json (what happened, how long it took, how much data,
how fresh) and exits with code 1 on any failure, so an automated job can alert.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
from datetime import date, datetime, timezone
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
PY = sys.executable  # the same Python that is running this script
MAX_AGE_DAYS = 12  # the newest service day may lag today by about 7 to 10 days; older than this is stale
RECORD = Path("exports/pipeline_run.json")

# (group, name, command, timeout in seconds). The freshness check is built in, so its command is None.
STAGES = [
    ("download", "trips", [PY, "ingestion/03_download_lamp_range.py", "--prune"], 1800),
    ("download", "weather", [PY, "ingestion/04_download_weather_history.py", "--prune"], 300),
    ("download", "alerts", [PY, "ingestion/06_refresh_alerts.py"], 900),
    ("download", "stations", [PY, "ingestion/07_refresh_stations.py"], 300),
    ("build", "warehouse", [PY, "transform/build_staging.py"], 1800),
    ("check", "staging", [PY, "checks/02_check_staging.py"], 600),
    ("check", "marts", [PY, "checks/03_check_marts.py"], 600),
    ("check", "alerts", [PY, "checks/06_check_alerts.py"], 600),
    ("check", "freshness", None, 60),
    ("export", "app files", [PY, "transform/export_for_app.py"], 300),
]
SUMMARY = re.compile(r"Summary: (\d+) passed, (\d+) warnings, (\d+) failures")


def run_command(cmd, timeout):
    """Run a command, show its output live, and return (exit code, all output lines)."""
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    timer = threading.Timer(timeout, proc.kill)  # stop a stage that hangs
    timer.start()
    lines = []
    try:
        for line in proc.stdout:
            print("    " + line, end="")
            lines.append(line.rstrip("\n"))
        proc.wait()
    finally:
        timer.cancel()
    if proc.returncode in (-9, -15):
        lines.append(f"STOPPED: the stage ran longer than {timeout} seconds.")
        print(f"    {lines[-1]}")
    return proc.returncode, lines


def freshness():
    """How old is the newest service day in the warehouse?"""
    con = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)
    newest = con.execute("SELECT MAX(service_date) FROM staging.stg_lamp_stop_events").fetchall()[0][0]
    con.close()
    age = (date.today() - newest).days
    ok = age <= MAX_AGE_DAYS
    print(f"    newest service day: {newest} ({age} days old; limit {MAX_AGE_DAYS})")
    if not ok:
        print("    FAILED: the data is stale.")
    return ok, {"newest_service_date": str(newest), "age_days": age, "max_age_days": MAX_AGE_DAYS}


def warehouse_facts():
    """A few headline numbers for the run record."""
    try:
        con = duckdb.connect("data/warehouse/transit.duckdb", read_only=True)
        q = lambda sql: con.execute(sql).fetchall()[0][0]
        first, last, days = con.execute(
            "SELECT MIN(service_date), MAX(service_date), COUNT(DISTINCT service_date) FROM staging.stg_lamp_stop_events"
        ).fetchall()[0]
        facts = {
            "stop_events": q("SELECT COUNT(*) FROM staging.stg_lamp_stop_events"),
            "kept_events": q("SELECT COUNT(*) FROM staging.stg_lamp_stop_events WHERE key_row_number = 1"),
            "alerts": q("SELECT COUNT(*) FROM staging.stg_alerts"),
            "line_days": q("SELECT COUNT(*) FROM marts.mart_line_day_context"),
            "episodes": q("SELECT COUNT(*) FROM marts.mart_line_episodes"),
            "first_service_date": str(first),
            "last_service_date": str(last),
            "days_with_data": days,
            "days_without_data": (last - first).days + 1 - days,
        }
        con.close()
        return facts
    except Exception as err:  # the warehouse may not exist yet if an early stage failed
        return {"unavailable": str(err)[:200]}


def fingerprint():
    """The reproducibility checksums, parsed into a dictionary. Informational only."""
    try:
        out = subprocess.run([PY, "checks/07_fingerprint.py"], capture_output=True, text=True, timeout=120).stdout
    except Exception:
        return {}
    result = {}
    for line in out.splitlines():
        parts = re.split(r"\s{2,}", line.strip())
        if len(parts) == 2:
            result[parts[0]] = parts[1]
    return result


def write_record(record):
    RECORD.parent.mkdir(exist_ok=True)
    tmp = RECORD.with_suffix(".part")
    tmp.write_text(json.dumps(record, indent=2))
    tmp.rename(RECORD)  # write fully, then rename


def write_github_summary(record):
    """On GitHub, show the run as a small report at the top of the run page (a no-op elsewhere)."""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    lines = [f"## Pipeline {record['status']} in {record['duration_sec']} seconds", ""]
    lines += ["| Stage | Result | Seconds |", "| --- | --- | --- |"]
    lines += [f"| {s['group']}/{s['name']} | {s['status']} | {s['seconds']} |" for s in record["stages"]]
    facts = record.get("facts") or {}
    if facts and "unavailable" not in facts:
        lines += ["", f"**Data:** {facts['stop_events']:,} stop events on {facts['days_with_data']} days "
                      f"({facts['first_service_date']} to {facts['last_service_date']}), "
                      f"{facts['days_without_data']} days without data, {facts['alerts']:,} alerts, "
                      f"{facts['episodes']} episodes."]
    for name, c in record["checks"].items():
        lines.append(f"- **{name} checks:** {c['passed']} passed, {c['warnings']} warnings, {c['failures']} failures")
    if record["status"] == "failed":
        lines += ["", f"Failed at `{record['failed_stage']}`. The last lines of its output:", "", "```", *record["log_tail"], "```"]
    with open(path, "a") as f:
        f.write("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Run the whole pipeline.")
    parser.add_argument("--skip-download", action="store_true", help="reuse the raw files already on disk")
    parser.add_argument("--only", help="comma-separated groups to run: download, build, check, export")
    args = parser.parse_args()

    groups = {g for g, *_ in STAGES}
    only = set(args.only.split(",")) if args.only else groups
    if not only <= groups:
        sys.exit(f"Unknown group(s): {', '.join(sorted(only - groups))}. Choose from: {', '.join(sorted(groups))}.")
    if args.skip_download:
        only.discard("download")

    started = datetime.now(timezone.utc)
    t_start = time.time()
    results, checks = [], {}
    failed_stage, tail = None, []
    stop = False

    print(f"Pipeline started {started:%Y-%m-%d %H:%M} UTC\n")
    for group, name, cmd, timeout in STAGES:
        label = f"{group}/{name}"
        if group not in only or stop:
            results.append({"group": group, "name": name, "status": "skipped", "seconds": 0})
            continue
        # a failed check does not stop the other checks, but nothing is exported after it
        if group == "export" and failed_stage:
            results.append({"group": group, "name": name, "status": "skipped", "seconds": 0})
            continue
        print(f"== {label}")
        t0 = time.time()
        detail = {}
        if os.environ.get("PIPELINE_INJECT_FAILURE") == label:
            # A practice run: this stage is told to fail so you can see what a real failure looks like end to end.
            lines = [f"SIMULATED FAILURE: {label} was told to fail on purpose (a practice run, not a real problem)."]
            print(f"    {lines[0]}")
            ok = False
        elif cmd is None:
            try:
                ok, detail = freshness()
            except Exception as err:
                ok, detail = False, {"error": str(err)[:200]}
                print(f"    FAILED: {err}")
            lines = []
        else:
            code, lines = run_command(cmd, timeout)
            ok = code == 0
            m = SUMMARY.search("\n".join(lines))
            if m:
                checks[name] = {"passed": int(m[1]), "warnings": int(m[2]), "failures": int(m[3])}
                detail = checks[name]
        seconds = round(time.time() - t0, 1)
        results.append({"group": group, "name": name, "status": "ok" if ok else "failed", "seconds": seconds, **({"detail": detail} if detail else {})})
        print(f"   -> {'ok' if ok else 'FAILED'} ({seconds}s)\n")
        if not ok and failed_stage is None:
            failed_stage, tail = label, lines[-40:]
        if not ok and group != "check":
            stop = True  # a failed download or build ends the run; checks keep going

    finished = datetime.now(timezone.utc)
    record = {
        "schema": 1,
        "run_id": os.environ.get("GITHUB_RUN_ID") or started.strftime("%Y%m%d-%H%M%S"),
        "trigger": os.environ.get("GITHUB_EVENT_NAME", "manual"),
        "started_utc": started.isoformat(timespec="seconds"),
        "finished_utc": finished.isoformat(timespec="seconds"),
        "duration_sec": round(time.time() - t_start, 1),
        "status": "failed" if failed_stage else "success",
        "failed_stage": failed_stage,
        "stages": results,
        "checks": checks,
        "facts": warehouse_facts() if Path("data/warehouse/transit.duckdb").exists() else {},
        "fingerprint": fingerprint() if Path("data/warehouse/transit.duckdb").exists() else {},
        "log_tail": tail,
    }
    write_record(record)
    write_github_summary(record)

    print("=" * 60)
    for r in results:
        print(f"  [{r['status']:>7}] {r['group']}/{r['name']}  {r['seconds']}s")
    print("=" * 60)
    print(f"PIPELINE {'FAILED at ' + failed_stage if failed_stage else 'SUCCEEDED'} in {record['duration_sec']}s")
    print(f"Run record: {RECORD}")
    sys.exit(1 if failed_stage else 0)


if __name__ == "__main__":
    main()
