"""
Tests of ingestion/03_download_lamp_range.py, the script that fetches a year of trip files, run
against a small web server on this computer that pretends to be the MBTA's. They check the
behaviors the automated pipeline depends on: skipping files already held, re-requesting empty
placeholders, recording unpublished days, pruning only when asked, and failing loudly when far
too many days look unpublished.
"""
import os
import subprocess
import sys
import threading
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from conftest import REPO

SCRIPT = REPO / "ingestion" / "03_download_lamp_range.py"
FULL = b"x" * 20_000   # a real-looking file (above the 10 KB "empty" limit)
EMPTY = b"x" * 3_000   # what the MBTA publishes for a day with zero rows


class Fake(BaseHTTPRequestHandler):
    published = {}   # date text -> bytes to serve; any other date answers 403, like the real server
    requests = []    # every date text asked for, in order

    def do_GET(self):
        day = self.path.rsplit("/", 1)[-1][:10]
        Fake.requests.append(day)
        body = Fake.published.get(day)
        if body is None:
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def base_url():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


@pytest.fixture(autouse=True)
def reset_server():
    Fake.published, Fake.requests = {}, []


def days_back(n, end_offset=0):
    end = date.today() - timedelta(days=end_offset)
    return [(end - timedelta(days=i)).isoformat() for i in range(n - 1, -1, -1)]


def run_script(cwd, base_url, *args):
    env = {**os.environ, "LAMP_BASE_URL": base_url}
    return subprocess.run([sys.executable, str(SCRIPT), *args], cwd=cwd, capture_output=True, text=True, env=env)


def files_in(cwd):
    return sorted(p.stem for p in (cwd / "data/raw/lamp").glob("20*.parquet"))


def test_every_published_day_is_downloaded(base_url, tmp_path):
    days = days_back(5)
    Fake.published = {d: FULL for d in days}
    result = run_script(tmp_path, base_url, "--days", "5", "--end-offset", "0")
    assert result.returncode == 0, result.stdout + result.stderr
    assert files_in(tmp_path) == days
    assert "Newly downloaded: 5" in result.stdout


def test_files_already_held_are_not_downloaded_again(base_url, tmp_path):
    Fake.published = {d: FULL for d in days_back(5)}
    run_script(tmp_path, base_url, "--days", "5", "--end-offset", "0")
    Fake.requests.clear()
    result = run_script(tmp_path, base_url, "--days", "5", "--end-offset", "0")
    assert Fake.requests == []
    assert "Complete files already had: 5" in result.stdout


def test_empty_placeholders_are_asked_for_again_on_every_run(base_url, tmp_path):
    days = days_back(3)
    Fake.published = {days[0]: FULL, days[1]: EMPTY, days[2]: FULL}
    first = run_script(tmp_path, base_url, "--days", "3", "--end-offset", "0")
    assert first.returncode == 0 and "EMPTY" in first.stdout and days[1] in first.stdout
    Fake.requests.clear()
    Fake.published[days[1]] = FULL  # the MBTA fills the day in later
    second = run_script(tmp_path, base_url, "--days", "3", "--end-offset", "0")
    assert Fake.requests == [days[1]]  # only the placeholder was requested
    assert (tmp_path / "data/raw/lamp" / f"{days[1]}.parquet").stat().st_size == len(FULL)
    assert "EMPTY" not in second.stdout


def test_unpublished_days_are_recorded_but_do_not_fail_the_run(base_url, tmp_path):
    days = days_back(5)
    Fake.published = {d: FULL for d in days if d != days[2]}
    result = run_script(tmp_path, base_url, "--days", "5", "--end-offset", "0")
    assert result.returncode == 0
    assert (tmp_path / "data/raw/lamp/_missing_dates.txt").read_text() == days[2]
    assert days[2] not in files_in(tmp_path)


def test_far_too_many_unpublished_days_fails_the_run(base_url, tmp_path):
    # nothing published for 25 days: the pattern a server that blocks us would produce
    result = run_script(tmp_path, base_url, "--days", "25", "--end-offset", "0")
    assert result.returncode == 1
    assert "FAILED" in result.stdout and "blocking" in result.stdout


def test_old_files_are_removed_only_when_asked(base_url, tmp_path):
    old_days = days_back(5, end_offset=3)
    Fake.published = {d: FULL for d in days_back(8)}
    run_script(tmp_path, base_url, "--days", "5", "--end-offset", "3")
    assert files_in(tmp_path) == old_days
    # the window moves forward three days; without --prune the old files stay
    run_script(tmp_path, base_url, "--days", "5", "--end-offset", "0")
    assert set(old_days) <= set(files_in(tmp_path))
    assert len(files_in(tmp_path)) == 8
    # with --prune, only the files inside the new window remain
    result = run_script(tmp_path, base_url, "--days", "5", "--end-offset", "0", "--prune")
    assert files_in(tmp_path) == days_back(5)
    assert "Removed 3 files" in result.stdout
