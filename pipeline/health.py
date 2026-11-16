"""
Add the latest pipeline run to the health history, a small JSON file the website's Platform Health page reads.

The history keeps the most recent runs (90 by default). Each run is boiled down to what a health page needs:
when it ran, whether it passed, how long each stage took, how many checks passed, how fresh the data was, and,
for a failure, which stage broke and the last lines of its output.

If the pipeline failed so early that it wrote no run record (installing packages failed, say), a failed entry is
still added from the information GitHub provides, so the history never silently skips a failure.

Uses only Python's standard library, so it runs anywhere.

Usage:
    python3 pipeline/health.py --history PATH --record exports/pipeline_run.json --out PATH

PATH for --history may be a file that does not exist yet (the history starts empty). The history is
rewritten with the new run added; --out may be the same file.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = 1
FACT_KEYS = ["stop_events", "kept_events", "alerts", "line_days", "episodes", "days_with_data",
             "days_without_data", "first_service_date", "last_service_date"]


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_history(path):
    """The existing history, or an empty one. A damaged file is reported loudly but never stops the run."""
    try:
        data = json.loads(Path(path).read_text())
        if isinstance(data, dict) and isinstance(data.get("runs"), list):
            return data
        print(f"WARNING: {path} is not a health history; starting a new one.", file=sys.stderr)
    except FileNotFoundError:
        pass
    except (OSError, ValueError):
        print(f"WARNING: {path} could not be read; starting a new history.", file=sys.stderr)
    return {"schema": SCHEMA, "runs": []}


def load_record(path, env):
    """The run record, unless it is missing or belongs to a different run."""
    try:
        record = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None
    current = env.get("GITHUB_RUN_ID")
    if current and str(record.get("run_id")) != current:
        return None
    return record


def run_url(env):
    server, repo, run_id = env.get("GITHUB_SERVER_URL"), env.get("GITHUB_REPOSITORY"), env.get("GITHUB_RUN_ID")
    return f"{server}/{repo}/actions/runs/{run_id}" if server and repo and run_id else None


def summarize(record, env):
    """One entry for the history, from a run record."""
    stages = [{"name": f"{s['group']}/{s['name']}", "status": s["status"], "seconds": s.get("seconds", 0)}
              for s in record.get("stages", [])]
    freshness = next((s.get("detail") for s in record.get("stages", []) if s.get("name") == "freshness"), None)
    failed = record.get("status") == "failed"
    return {
        "run_id": str(record.get("run_id")),
        "trigger": record.get("trigger", "manual"),
        "started_utc": record.get("started_utc"),
        "finished_utc": record.get("finished_utc"),
        "duration_sec": record.get("duration_sec"),
        "status": record.get("status", "failed"),
        "failed_stage": record.get("failed_stage"),
        "stages": stages,
        "checks": record.get("checks", {}),
        "freshness": ({k: freshness[k] for k in ("newest_service_date", "age_days", "max_age_days") if k in freshness}
                      if freshness else None),
        "facts": {k: v for k, v in (record.get("facts") or {}).items() if k in FACT_KEYS},
        "error_tail": [line[:200] for line in (record.get("log_tail") or [])[-8:]] if failed else [],
        "run_url": run_url(env),
    }


def failure_without_record(env):
    """A failed entry for a run that never produced a record."""
    when = now_utc()
    return {
        "run_id": env.get("GITHUB_RUN_ID", "unknown"),
        "trigger": env.get("GITHUB_EVENT_NAME", "manual"),
        "started_utc": None, "finished_utc": when, "duration_sec": None,
        "status": "failed", "failed_stage": "workflow/setup",
        "stages": [], "checks": {}, "freshness": None, "facts": {},
        "error_tail": ["The workflow failed before the pipeline produced a run record.",
                       "Installing the project or starting the pipeline probably failed."],
        "run_url": run_url(env),
    }


def add_run(history, entry, max_runs=90):
    """Add entry (replacing any earlier entry with the same run id, as when a run is retried), newest last."""
    runs = [r for r in history["runs"] if r.get("run_id") != entry["run_id"]] + [entry]
    runs.sort(key=lambda r: r.get("finished_utc") or "")
    return {"schema": SCHEMA, "repository": os.environ.get("GITHUB_REPOSITORY") or history.get("repository"),
            "updated_utc": now_utc(), "runs": runs[-max_runs:]}


def main():
    parser = argparse.ArgumentParser(description="Add the latest pipeline run to the health history.")
    parser.add_argument("--history", required=True, help="the existing history file (may not exist yet)")
    parser.add_argument("--record", default="exports/pipeline_run.json", help="the run record from pipeline/run.py")
    parser.add_argument("--out", required=True, help="where to write the new history")
    parser.add_argument("--max-runs", type=int, default=90)
    args = parser.parse_args()

    env = dict(os.environ)
    record = load_record(args.record, env)
    if record is not None:
        entry = summarize(record, env)
    elif env.get("GITHUB_RUN_ID"):
        entry = failure_without_record(env)  # on GitHub a missing record means the run failed early
    else:
        print(f"No usable run record at {args.record}; nothing was added.", file=sys.stderr)
        return 1

    history = add_run(load_history(args.history), entry, args.max_runs)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part")
    tmp.write_text(json.dumps(history, indent=1))
    tmp.rename(out)  # write fully, then rename
    print(f"Health history: {len(history['runs'])} runs; added run {entry['run_id']} ({entry['status']}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
