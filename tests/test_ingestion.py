"""
Tests of the download helper, using a small web server on this computer, so no real MBTA
server is contacted. They check the behaviors the pipeline relies on: a good file is saved
whole, a file that does not exist is reported as "not published" (this host answers 403 or 404),
a broken connection is retried and then reported as a failure, and a huge file is refused.
"""
import threading
import time
import types
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

import lamp_utils


STALLED = threading.Event()  # set by the server once it has sent half of a file
RELEASE = threading.Event()  # set by the test to let the server finish sending it


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/stalled":
            self.send_response(200)
            self.send_header("Content-Length", "10")
            self.end_headers()
            self.wfile.write(b"12345")
            self.wfile.flush()
            STALLED.set()
            RELEASE.wait(10)
            self.wfile.write(b"67890")
        elif self.path == "/truncated":
            self.send_response(200)
            self.send_header("Content-Length", "100")  # promises 100 bytes, sends 5, hangs up
            self.end_headers()
            self.wfile.write(b"12345")
            self.wfile.flush()
            self.close_connection = True
        elif self.path == "/ok.bin":
            body = b"hello, parquet"
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/forbidden":
            self.send_response(403)
            self.end_headers()
        elif self.path == "/gone":
            self.send_response(404)
            self.end_headers()
        else:
            self.send_response(500)
            self.end_headers()

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def server():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


@pytest.fixture(autouse=True)
def no_waiting(monkeypatch):
    # skip the retry pauses inside the downloader only (patching time.sleep itself would affect the tests too)
    monkeypatch.setattr(lamp_utils, "time", types.SimpleNamespace(sleep=lambda s: None))


def test_a_good_file_is_saved_whole_with_no_temporary_file_left(server, tmp_path):
    dest = tmp_path / "a" / "file.bin"
    assert lamp_utils.download(f"{server}/ok.bin", dest) == "ok"
    assert dest.read_bytes() == b"hello, parquet"
    assert not list(tmp_path.rglob("*.part"))


@pytest.mark.parametrize("path", ["forbidden", "gone"])
def test_a_missing_file_is_reported_as_not_published(server, tmp_path, path):
    dest = tmp_path / "x.bin"
    assert lamp_utils.download(f"{server}/{path}", dest) == "missing"  # 403 and 404 both mean "not published"
    assert not dest.exists()


def test_a_server_error_is_retried_and_then_reported_as_a_failure(server, tmp_path):
    assert lamp_utils.download(f"{server}/boom", tmp_path / "x.bin", retries=3) == "failed"


def test_an_unreachable_server_is_a_failure(tmp_path):
    assert lamp_utils.download("http://127.0.0.1:9/nothing", tmp_path / "x.bin", retries=2) == "failed"


def test_a_file_over_the_size_limit_is_refused(server, tmp_path, monkeypatch):
    monkeypatch.setattr(lamp_utils, "MAX_MB", 0.000001)
    dest = tmp_path / "big.bin"
    assert lamp_utils.download(f"{server}/ok.bin", dest) == "failed"
    assert not dest.exists()


def test_a_half_downloaded_file_is_never_visible_under_its_real_name(server, tmp_path):
    STALLED.clear()
    RELEASE.clear()
    dest = tmp_path / "half.bin"
    result = []
    worker = threading.Thread(target=lambda: result.append(lamp_utils.download(f"{server}/stalled", dest)))
    worker.start()
    assert STALLED.wait(10), "the test server never started sending"
    part = dest.with_suffix(".part")
    for _ in range(100):  # give the download thread a moment to open its temporary file
        if part.exists() or dest.exists():
            break
        time.sleep(0.05)
    assert not dest.exists()  # half the bytes have arrived, but the real file must not exist yet
    assert part.exists()  # the download is happening in the temporary file
    RELEASE.set()
    worker.join(10)
    assert result == ["ok"] and dest.read_bytes() == b"1234567890"
    assert not dest.with_suffix(".part").exists()


def test_a_broken_transfer_leaves_nothing_behind(server, tmp_path):
    dest = tmp_path / "cut.bin"
    assert lamp_utils.download(f"{server}/truncated", dest, retries=2) == "failed"
    assert not dest.exists()
    assert not list(tmp_path.glob("*.part"))
