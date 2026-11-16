"""
Tests of pipeline/run.py, the one command that runs everything. The real orchestrator is copied
into a temporary project whose scripts are stand-ins that pass or fail on request, so the tests
check the control flow: order, stopping, what is skipped, the run record, and the exit code.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from datetime import date, timedelta

import duckdb

from conftest import REPO

STUBS = {
    "ingestion/03_download_lamp_range.py": "trips",
    "ingestion/04_download_weather_history.py": "weather",
    "ingestion/06_refresh_alerts.py": "alerts-download",
    "ingestion/07_refresh_stations.py": "stations",
    "transform/build_staging.py": "build",
    "checks/02_check_staging.py": "staging",
    "checks/03_check_marts.py": "marts",
    "checks/06_check_alerts.py": "alerts",
    "transform/export_for_app.py": "export",
}
CHECKS = {"checks/02_check_staging.py", "checks/03_check_marts.py", "checks/06_check_alerts.py"}


def make_stub_project(path, newest_age_days=8):
    root = path
    for rel, key in STUBS.items():
        f = root / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        summary = 'print("Summary: 9 passed, 0 warnings, " + ("1 failures" if fail else "0 failures"))' if rel in CHECKS else ""
        f.write_text(
            "import os, sys\n"
            f'fail = os.environ.get("STUB_FAIL") == "{key}"\n'
            f'print("stub {key}", "FAILS" if fail else "ok")\n'
            f"{summary}\n"
            "sys.exit(1 if fail else 0)\n"
        )
    (root / "checks/07_fingerprint.py").write_text('print("daily mart (md5 checksum)          abc123")\n')
    (root / "pipeline").mkdir()
    shutil.copy(REPO / "pipeline/run.py", root / "pipeline/run.py")
    (root / "data/warehouse").mkdir(parents=True)
    newest = date.today() - timedelta(days=newest_age_days)
    con = duckdb.connect(str(root / "data/warehouse/transit.duckdb"))
    for schema in ("staging", "marts"):
        con.execute(f"CREATE SCHEMA {schema}")
    con.execute(f"CREATE TABLE staging.stg_lamp_stop_events AS SELECT DATE '{newest}' - CAST(i % 30 AS INTEGER) AS service_date, "
                "1 AS key_row_number FROM range(100) t(i)")
    con.execute("CREATE TABLE staging.stg_alerts AS SELECT 1 AS x")
    con.execute("CREATE TABLE marts.mart_line_day_context AS SELECT 1 AS x")
    con.execute("CREATE TABLE marts.mart_line_episodes AS SELECT 1 AS x")
    con.close()
    return root


def run(root, *args, **env):
    result = subprocess.run([sys.executable, "pipeline/run.py", *args], cwd=root, capture_output=True, text=True,
                            env={**os.environ, **env})
    record = json.loads((root / "exports/pipeline_run.json").read_text()) if (root / "exports/pipeline_run.json").exists() else None
    return result, record


def status(record):
    return {f"{s['group']}/{s['name']}": s["status"] for s in record["stages"]}


def test_a_clean_run_succeeds_and_records_everything(tmp_path):
    result, record = run(make_stub_project(tmp_path), "--skip-download")
    assert result.returncode == 0
    assert record["status"] == "success" and record["failed_stage"] is None
    st = status(record)
    assert st["build/warehouse"] == st["check/freshness"] == st["export/app files"] == "ok"
    assert all(v == "skipped" for k, v in st.items() if k.startswith("download/"))
    assert record["checks"]["marts"] == {"passed": 9, "warnings": 0, "failures": 0}
    assert record["facts"]["stop_events"] == 100
    assert record["fingerprint"] == {"daily mart (md5 checksum)": "abc123"}


def test_one_failing_check_does_not_hide_the_others_and_blocks_the_export(tmp_path):
    result, record = run(make_stub_project(tmp_path), "--skip-download", STUB_FAIL="alerts")
    assert result.returncode == 1
    st = status(record)
    assert st["check/alerts"] == "failed"
    assert st["check/staging"] == st["check/marts"] == st["check/freshness"] == "ok"  # the other checks still ran
    assert st["export/app files"] == "skipped"
    assert record["failed_stage"] == "check/alerts" and record["status"] == "failed"
    assert any("alerts" in line for line in record["log_tail"])


def test_a_failed_download_stops_the_run_immediately(tmp_path):
    result, record = run(make_stub_project(tmp_path), STUB_FAIL="trips")
    assert result.returncode == 1
    st = status(record)
    assert st["download/trips"] == "failed"
    assert all(v == "skipped" for k, v in st.items() if k != "download/trips")  # nothing after it ran
    assert record["failed_stage"] == "download/trips"


def test_a_failed_build_stops_before_the_checks(tmp_path):
    result, record = run(make_stub_project(tmp_path), "--skip-download", STUB_FAIL="build")
    st = status(record)
    assert result.returncode == 1 and st["build/warehouse"] == "failed"
    assert st["check/staging"] == st["export/app files"] == "skipped"


def test_stale_data_fails_the_freshness_check(tmp_path):
    result, record = run(make_stub_project(tmp_path, newest_age_days=18), "--skip-download")
    assert result.returncode == 1
    assert record["failed_stage"] == "check/freshness"
    freshness = next(s for s in record["stages"] if s["name"] == "freshness")
    assert freshness["detail"]["age_days"] == 18


def test_only_runs_one_group(tmp_path):
    result, record = run(make_stub_project(tmp_path), "--only", "check")
    assert result.returncode == 0
    st = status(record)
    assert st["check/marts"] == "ok" and st["build/warehouse"] == st["export/app files"] == "skipped"


def test_an_unknown_group_is_rejected(tmp_path):
    result, _ = run(make_stub_project(tmp_path), "--only", "nonsense")
    assert result.returncode != 0 and "Unknown group" in result.stderr


def test_a_hung_stage_is_stopped(tmp_path, monkeypatch):
    root = make_stub_project(tmp_path)
    monkeypatch.chdir(root)  # importing the module changes the working folder; pytest restores it afterwards
    spec = importlib.util.spec_from_file_location("run_under_test", root / "pipeline/run.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    code, lines = module.run_command([sys.executable, "-c", "import time; print('start'); time.sleep(30)"], timeout=1)
    assert code != 0
    assert any("STOPPED" in line for line in lines)


def test_on_github_the_run_is_summarized_on_the_run_page(tmp_path):
    summary = tmp_path / "summary.md"
    result, _ = run(make_stub_project(tmp_path / "p"), "--skip-download", GITHUB_STEP_SUMMARY=str(summary))
    text = summary.read_text()
    assert result.returncode == 0
    assert "## Pipeline success" in text
    assert "| build/warehouse | ok |" in text
    assert "**marts checks:** 9 passed, 0 warnings, 0 failures" in text
    assert "100 stop events" in text


def test_a_failed_run_summary_names_the_stage_and_shows_its_output(tmp_path):
    summary = tmp_path / "summary.md"
    run(make_stub_project(tmp_path / "p"), "--skip-download", GITHUB_STEP_SUMMARY=str(summary), STUB_FAIL="alerts")
    text = summary.read_text()
    assert "## Pipeline failed" in text
    assert "Failed at `check/alerts`" in text
    assert "stub alerts FAILS" in text
