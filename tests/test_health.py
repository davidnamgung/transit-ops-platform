"""
Tests of the health history: pipeline/health.py (adds a run to a small JSON history) and
pipeline/publish_health.sh (publishes it to its own branch). The publishing test uses a bare git repository
on this computer as the stand-in for GitHub, so nothing real is touched.
"""
import json
import os
import shutil
import subprocess
import sys

from conftest import REPO

GITHUB = {"GITHUB_SERVER_URL": "https://github.com", "GITHUB_REPOSITORY": "someone/project",
          "GITHUB_EVENT_NAME": "schedule"}


def clean_env(**extra):
    base = {k: v for k, v in os.environ.items() if not k.startswith("GITHUB_") and not k.startswith("HEALTH_")}
    return {**base, **extra}


def record(run_id="100", status="success", failed_stage=None, finished="2026-11-16T09:20:00+00:00", **more):
    return {
        "schema": 1, "run_id": run_id, "trigger": "schedule", "started_utc": "2026-11-16T09:17:00+00:00",
        "finished_utc": finished, "duration_sec": 276.0, "status": status, "failed_stage": failed_stage,
        "stages": [{"group": "download", "name": "trips", "status": "ok", "seconds": 204.8},
                   {"group": "check", "name": "freshness", "status": "ok", "seconds": 0.0,
                    "detail": {"newest_service_date": "2026-11-09", "age_days": 7, "max_age_days": 12}}],
        "checks": {"staging": {"passed": 13, "warnings": 0, "failures": 0}},
        "facts": {"stop_events": 14536517, "alerts": 22422, "episodes": 101, "days_with_data": 348,
                  "first_service_date": "2025-11-10", "last_service_date": "2026-11-09", "days_without_data": 17,
                  "secret_internal_field": "not for the page"},
        "fingerprint": {"daily mart": "abc"}, "log_tail": [f"line {i}" for i in range(20)] if status == "failed" else [],
        **more,
    }


def health(tmp_path, rec, history=None, env=None, extra_args=()):
    (tmp_path / "exports").mkdir(exist_ok=True)
    if rec is not None:
        (tmp_path / "exports/pipeline_run.json").write_text(json.dumps(rec))
    hist = tmp_path / "history.json"
    if history is not None:
        hist.write_text(history if isinstance(history, str) else json.dumps(history))
    result = subprocess.run(
        [sys.executable, str(REPO / "pipeline/health.py"), "--history", str(hist), "--record", "exports/pipeline_run.json",
         "--out", str(hist), *extra_args], cwd=tmp_path, capture_output=True, text=True, env=clean_env(**(env or {})))
    return result, (json.loads(hist.read_text()) if hist.exists() else None)


def test_the_first_run_starts_a_history(tmp_path):
    result, history = health(tmp_path, record())
    assert result.returncode == 0, result.stderr
    assert [r["run_id"] for r in history["runs"]] == ["100"]
    run = history["runs"][0]
    assert run["status"] == "success" and run["duration_sec"] == 276.0
    assert run["freshness"] == {"newest_service_date": "2026-11-09", "age_days": 7, "max_age_days": 12}
    assert run["stages"][0] == {"name": "download/trips", "status": "ok", "seconds": 204.8}
    assert run["checks"]["staging"]["passed"] == 13


def test_only_the_fields_the_page_needs_are_kept(tmp_path):
    _, history = health(tmp_path, record())
    run = history["runs"][0]
    assert "secret_internal_field" not in run["facts"] and "fingerprint" not in run
    assert run["facts"]["stop_events"] == 14536517


def test_runs_are_added_in_time_order(tmp_path):
    health(tmp_path, record("1", finished="2026-11-14T09:20:00+00:00"))
    health(tmp_path, record("3", finished="2026-11-16T09:20:00+00:00"))
    _, history = health(tmp_path, record("2", finished="2026-11-15T09:20:00+00:00"))
    assert [r["run_id"] for r in history["runs"]] == ["1", "2", "3"]


def test_a_retried_run_replaces_its_earlier_entry(tmp_path):
    health(tmp_path, record("5", status="failed", failed_stage="check/marts"))
    _, history = health(tmp_path, record("5"))
    assert [(r["run_id"], r["status"]) for r in history["runs"]] == [("5", "success")]


def test_only_the_most_recent_runs_are_kept(tmp_path):
    for i in range(1, 8):
        _, history = health(tmp_path, record(str(i), finished=f"2026-11-{10 + i}T09:20:00+00:00"), extra_args=("--max-runs", "5"))
    assert [r["run_id"] for r in history["runs"]] == ["3", "4", "5", "6", "7"]


def test_a_failed_run_keeps_its_stage_and_the_end_of_its_log(tmp_path):
    _, history = health(tmp_path, record(status="failed", failed_stage="check/alerts"))
    run = history["runs"][0]
    assert run["failed_stage"] == "check/alerts"
    assert run["error_tail"] == [f"line {i}" for i in range(12, 20)]  # the last 8 lines


def test_a_run_that_never_wrote_a_record_is_still_recorded_as_a_failure_on_github(tmp_path):
    result, history = health(tmp_path, None, env={**GITHUB, "GITHUB_RUN_ID": "900"})
    assert result.returncode == 0
    run = history["runs"][0]
    assert (run["run_id"], run["status"], run["failed_stage"]) == ("900", "failed", "workflow/setup")
    assert run["run_url"] == "https://github.com/someone/project/actions/runs/900"


def test_an_old_record_from_a_different_run_is_not_mistaken_for_this_one(tmp_path):
    _, history = health(tmp_path, record("111"), env={**GITHUB, "GITHUB_RUN_ID": "900"})
    assert [(r["run_id"], r["status"]) for r in history["runs"]] == [("900", "failed")]


def test_without_a_record_and_off_github_nothing_is_added(tmp_path):
    result, history = health(tmp_path, None)
    assert result.returncode == 1 and history is None


def test_a_damaged_history_is_replaced_not_fatal(tmp_path):
    result, history = health(tmp_path, record(), history="{ this is not json")
    assert result.returncode == 0 and "WARNING" in result.stderr
    assert [r["run_id"] for r in history["runs"]] == ["100"]


def test_the_run_link_points_at_the_github_run(tmp_path):
    _, history = health(tmp_path, record("100"), env={**GITHUB, "GITHUB_RUN_ID": "100"})
    assert history["runs"][0]["run_url"] == "https://github.com/someone/project/actions/runs/100"
    assert history["repository"] == "someone/project" or history["repository"] is None


# ---------- publishing to a branch ----------

def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def make_checkout(tmp_path):
    """A bare repository standing in for GitHub, and a checkout of it that holds the pipeline scripts."""
    origin = tmp_path / "origin.git"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(origin)], check=True, capture_output=True)
    work = tmp_path / "work"
    subprocess.run(["git", "clone", str(origin), str(work)], check=True, capture_output=True)
    git(work, "config", "user.name", "tester")
    git(work, "config", "user.email", "tester@example.com")
    (work / "pipeline").mkdir()
    for name in ("health.py", "publish_health.sh"):
        shutil.copy(REPO / "pipeline" / name, work / "pipeline" / name)
    (work / "README.md").write_text("main branch content\n")
    git(work, "add", ".")
    git(work, "commit", "-m", "main")
    git(work, "push", "origin", "main")
    return origin, work


def publish(work, rec, run_id):
    (work / "exports").mkdir(exist_ok=True)
    (work / "exports/pipeline_run.json").write_text(json.dumps(rec))
    return subprocess.run(["bash", "pipeline/publish_health.sh"], cwd=work, capture_output=True, text=True,
                          env=clean_env(GITHUB_RUN_ID=run_id, **{k: v for k, v in GITHUB.items()}))


def read_branch_file(origin, tmp_path):
    check = tmp_path / "check"
    shutil.rmtree(check, ignore_errors=True)
    subprocess.run(["git", "clone", "-b", "pipeline-health", str(origin), str(check)], check=True, capture_output=True)
    return check


def test_the_first_publish_creates_a_branch_holding_only_the_history(tmp_path):
    origin, work = make_checkout(tmp_path)
    result = publish(work, record("100"), "100")
    assert result.returncode == 0, result.stdout + result.stderr
    check = read_branch_file(origin, tmp_path)
    assert sorted(p.name for p in check.iterdir() if p.name != ".git") == ["health.json"]  # nothing from main
    assert [r["run_id"] for r in json.loads((check / "health.json").read_text())["runs"]] == ["100"]


def test_later_publishes_add_to_the_history_and_leave_main_alone(tmp_path):
    origin, work = make_checkout(tmp_path)
    main_before = git(origin, "rev-parse", "main")
    publish(work, record("100", finished="2026-11-15T09:20:00+00:00"), "100")
    result = publish(work, record("101", status="failed", failed_stage="check/marts"), "101")
    assert result.returncode == 0, result.stdout + result.stderr
    check = read_branch_file(origin, tmp_path)
    runs = json.loads((check / "health.json").read_text())["runs"]
    assert [(r["run_id"], r["status"]) for r in runs] == [("100", "success"), ("101", "failed")]
    assert git(origin, "rev-parse", "main") == main_before  # the main branch never changed
    assert len(git(check, "log", "--oneline").splitlines()) == 2  # one small commit per run
