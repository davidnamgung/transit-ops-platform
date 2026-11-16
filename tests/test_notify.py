"""
Tests of pipeline/notify.py, which posts an alert to Discord when the pipeline fails. They run against a
small web server on this computer that pretends to be Discord, so no real message is ever sent. They check
what the message says, that it fits Discord's limits, that it never pings anyone or leaks the secret
webhook address, and what happens when Discord is slow, down, or the webhook was deleted.
"""
import json
import os
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from conftest import REPO

SECRET = "SECRET-TOKEN-abc123"


class FakeDiscord(BaseHTTPRequestHandler):
    script = []     # status codes to answer with, in order; the last one repeats
    received = []   # (headers, json body) of every request

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        FakeDiscord.received.append((dict(self.headers), json.loads(self.rfile.read(length))))
        status = FakeDiscord.script[min(len(FakeDiscord.received), len(FakeDiscord.script)) - 1]
        self.send_response(status)
        if status == 429:
            self.end_headers()
            self.wfile.write(json.dumps({"message": "You are being rate limited.", "retry_after": 0.01}).encode())
        else:
            self.end_headers()

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def discord_url():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeDiscord)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}/api/webhooks/123456/{SECRET}"
    srv.shutdown()


@pytest.fixture(autouse=True)
def reset():
    FakeDiscord.script, FakeDiscord.received = [204], []


def make_project(path, record=None):
    (path / "pipeline").mkdir(parents=True)
    shutil.copy(REPO / "pipeline/notify.py", path / "pipeline/notify.py")
    if record is not None:
        (path / "exports").mkdir()
        (path / "exports/pipeline_run.json").write_text(json.dumps(record))
    return path


def notify(path, *args, url=None, **env):
    # a clean environment: the tests must not pick up the real GitHub variables when they run on GitHub
    base = {k: v for k, v in os.environ.items() if not k.startswith("GITHUB_") and k != "DISCORD_WEBHOOK_URL"}
    if url:
        base["DISCORD_WEBHOOK_URL"] = url
    return subprocess.run([sys.executable, "pipeline/notify.py", *args], cwd=path, capture_output=True, text=True,
                          env={**base, **env})


FAILED = {"run_id": "777", "status": "failed", "failed_stage": "check/alerts", "duration_sec": 91.3,
          "log_tail": ["[PASS] alert_id is unique", "[FAIL] at least 1,000 alerts started in the window: 12"]}
GITHUB = {"GITHUB_SERVER_URL": "https://github.com", "GITHUB_REPOSITORY": "someone/project", "GITHUB_RUN_ID": "777"}


def message_sent():
    assert len(FakeDiscord.received) >= 1, "nothing was sent"
    return FakeDiscord.received[-1][1]["content"]


def test_a_failed_run_alert_names_the_stage_shows_the_log_and_links_to_the_run(discord_url, tmp_path):
    result = notify(make_project(tmp_path, FAILED), url=discord_url, **GITHUB)
    assert result.returncode == 0, result.stdout + result.stderr
    text = message_sent()
    assert "Pipeline FAILED" in text and "`check/alerts`" in text
    assert "[FAIL] at least 1,000 alerts started in the window: 12" in text
    assert "https://github.com/someone/project/actions/runs/777" in text
    assert len(text) <= 2000


def test_the_request_is_one_discord_accepts(discord_url, tmp_path):
    notify(make_project(tmp_path, FAILED), url=discord_url, **GITHUB)
    headers, body = FakeDiscord.received[0]
    assert headers["Content-Type"] == "application/json"
    # Python's default identifies itself as "Python-urllib", which Discord's front door tends to block
    assert headers["User-Agent"].startswith("headway-pipeline-alerts")
    assert body["allowed_mentions"] == {"parse": []}  # nobody is pinged, whatever the log says


def test_the_secret_webhook_address_is_never_printed(discord_url, tmp_path):
    ok = notify(make_project(tmp_path / "a", FAILED), url=discord_url, **GITHUB)
    FakeDiscord.script = [404]
    bad = notify(make_project(tmp_path / "b", FAILED), url=discord_url, **GITHUB)
    shown = notify(make_project(tmp_path / "c", FAILED), "--print", url=discord_url, **GITHUB)
    for result in (ok, bad, shown):
        assert SECRET not in result.stdout + result.stderr


def test_a_very_long_log_is_trimmed_from_the_front_so_the_end_survives(discord_url, tmp_path):
    record = {**FAILED, "log_tail": [f"line {i:03d} " + "x" * 60 for i in range(40)]}
    notify(make_project(tmp_path, record), url=discord_url, **GITHUB)
    text = message_sent()
    assert len(text) <= 2000
    assert "line 039" in text and "line 000" not in text  # the last lines are the useful ones
    assert text.count("```") == 2  # the code block is still opened and closed


def test_a_stray_code_fence_in_the_log_cannot_break_the_message(discord_url, tmp_path):
    record = {**FAILED, "log_tail": ["before ``` after", "@everyone look"]}
    notify(make_project(tmp_path, record), url=discord_url, **GITHUB)
    assert message_sent().count("```") == 2


def test_an_old_record_from_a_different_run_is_not_blamed(discord_url, tmp_path):
    old = {**FAILED, "run_id": "111", "failed_stage": "build/warehouse"}
    notify(make_project(tmp_path, old), url=discord_url, **GITHUB)
    text = message_sent()
    assert "build/warehouse" not in text
    assert "before the pipeline produced a record" in text


def test_a_workflow_that_failed_before_the_pipeline_started_says_so(discord_url, tmp_path):
    notify(make_project(tmp_path), url=discord_url, **GITHUB)
    assert "before the pipeline produced a record" in message_sent()


def test_a_failure_after_a_successful_pipeline_says_so(discord_url, tmp_path):
    record = {**FAILED, "status": "success", "failed_stage": None}
    notify(make_project(tmp_path, record), url=discord_url, **GITHUB)
    assert "after the pipeline itself succeeded" in message_sent()


def test_no_webhook_means_no_alert_and_no_failure(tmp_path):
    result = notify(make_project(tmp_path, FAILED), **GITHUB)
    assert result.returncode == 0 and "no alert was sent" in result.stdout
    assert FakeDiscord.received == []


def test_a_test_message_without_a_webhook_is_an_error(tmp_path):
    result = notify(make_project(tmp_path), "--test", **GITHUB)
    assert result.returncode == 1 and "not set" in result.stdout


def test_a_test_message_is_clearly_labelled_and_ignores_the_record(discord_url, tmp_path):
    result = notify(make_project(tmp_path, FAILED), "--test", url=discord_url, **GITHUB)
    assert result.returncode == 0
    text = message_sent()
    assert "TEST ALERT" in text and "Nothing is wrong" in text and "check/alerts" not in text


def test_print_shows_the_message_and_sends_nothing(discord_url, tmp_path):
    result = notify(make_project(tmp_path, FAILED), "--print", url=discord_url, **GITHUB)
    assert result.returncode == 0 and "Pipeline FAILED" in result.stdout
    assert FakeDiscord.received == []


def test_a_rate_limited_webhook_is_retried(discord_url, tmp_path):
    FakeDiscord.script = [429, 204]
    result = notify(make_project(tmp_path, FAILED), url=discord_url, **GITHUB)
    assert result.returncode == 0 and len(FakeDiscord.received) == 2


def test_a_discord_outage_is_retried_and_then_reported(discord_url, tmp_path):
    FakeDiscord.script = [503]
    result = notify(make_project(tmp_path, FAILED), url=discord_url, **GITHUB)
    assert result.returncode == 1 and len(FakeDiscord.received) == 3
    assert "gave up after 3 attempts" in result.stdout


def test_a_deleted_webhook_is_reported_without_retrying(discord_url, tmp_path):
    FakeDiscord.script = [404]
    result = notify(make_project(tmp_path, FAILED), url=discord_url, **GITHUB)
    assert result.returncode == 1 and len(FakeDiscord.received) == 1
    assert "deleted or the address is wrong" in result.stdout
