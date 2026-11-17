"""
Tests of pipeline/fetch_live_data.py, which fetches the data the live website is showing so that a code-only change
can be published without rerunning the pipeline. A small web server on this computer plays the part of the site.
"""
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from conftest import REPO

GOOD = {
    "line_days.json": [{"n": i} for i in range(600)],
    "episodes.json": [{"n": 1}, {"n": 2}],
    "hourly_weather.json": [{"n": i} for i in range(150)],
    "stations.json": [{"n": i} for i in range(60)],
}


class Site(BaseHTTPRequestHandler):
    files = {}   # name -> (status, body text)
    asked = []

    def do_GET(self):
        name = self.path.split("?")[0].rsplit("/", 1)[-1]
        Site.asked.append(name)
        status, body = Site.files.get(name, (404, "Not Found"))
        self.send_response(status)
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def base_url():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}/project"
    srv.shutdown()


@pytest.fixture(autouse=True)
def healthy_site():
    Site.files = {name: (200, json.dumps(rows)) for name, rows in GOOD.items()}
    Site.asked = []


def fetch(base_url, out, base_suffix=""):
    return subprocess.run([sys.executable, str(REPO / "pipeline/fetch_live_data.py"), "--base", base_url + base_suffix,
                           "--out", str(out)], capture_output=True, text=True)


def test_all_four_files_are_fetched_and_written(base_url, tmp_path):
    result = fetch(base_url, tmp_path / "exports")
    assert result.returncode == 0, result.stdout
    assert sorted(p.name for p in (tmp_path / "exports").iterdir()) == sorted(GOOD)
    assert json.loads((tmp_path / "exports/episodes.json").read_text()) == GOOD["episodes.json"]
    assert not list((tmp_path / "exports").glob("*.part"))


def test_a_trailing_slash_on_the_address_is_fine(base_url, tmp_path):
    assert fetch(base_url, tmp_path / "e", "/").returncode == 0


@pytest.mark.parametrize("name", list(GOOD))
def test_one_missing_file_means_nothing_is_written(base_url, tmp_path, name):
    del Site.files[name]
    result = fetch(base_url, tmp_path / "exports")
    assert result.returncode == 1 and name in result.stdout and "nothing was written" in result.stdout
    assert not (tmp_path / "exports").exists()  # not even the files that were fine


def test_a_web_page_instead_of_data_is_rejected(base_url, tmp_path):
    # what a site's own "page not found" fallback returns for a missing file
    Site.files["stations.json"] = (200, "<!doctype html><html><body>Headway</body></html>")
    result = fetch(base_url, tmp_path / "exports")
    assert result.returncode == 1 and "web page instead of data" in result.stdout


def test_damaged_json_is_rejected(base_url, tmp_path):
    Site.files["line_days.json"] = (200, '[{"n": 1}, {"n"')
    result = fetch(base_url, tmp_path / "exports")
    assert result.returncode == 1 and "not valid JSON" in result.stdout


def test_a_file_that_is_not_a_list_is_rejected(base_url, tmp_path):
    Site.files["episodes.json"] = (200, '{"rows": []}')
    assert fetch(base_url, tmp_path / "exports").returncode == 1


def test_a_nearly_empty_file_is_rejected(base_url, tmp_path):
    Site.files["line_days.json"] = (200, json.dumps([{"n": 1}] * 10))
    result = fetch(base_url, tmp_path / "exports")
    assert result.returncode == 1 and "has only 10 rows" in result.stdout


def test_an_unreachable_site_fails_cleanly(tmp_path):
    result = fetch("http://127.0.0.1:9/project", tmp_path / "exports")
    assert result.returncode == 1 and "could not connect" in result.stdout
