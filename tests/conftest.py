"""
Shared test setup. The fake raw files are written into a temporary copy of the project and the
real build script and real SQL models are run on them, so the tests exercise your actual code.
"""
import shutil
import subprocess
import sys
from pathlib import Path

import duckdb
import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tests"))
sys.path.insert(0, str(REPO / "ingestion"))

import fixture  # noqa: E402


def make_project(path):
    """Copy the models and build scripts into path, write fake raw files, and build the warehouse."""
    root = Path(path)
    shutil.copytree(REPO / "models", root / "models")
    (root / "transform").mkdir()
    for name in ("build_staging.py", "export_for_app.py"):
        shutil.copy(REPO / "transform" / name, root / "transform" / name)
    fixture.write_raw(root)
    build = subprocess.run([sys.executable, "transform/build_staging.py"], cwd=root, capture_output=True, text=True)
    if build.returncode != 0:
        pytest.fail("The build failed on the fake data:\n" + build.stdout[-2500:] + build.stderr[-2500:])
    return root


@pytest.fixture(scope="session")
def project(tmp_path_factory):
    return make_project(tmp_path_factory.mktemp("fixture_project"))


@pytest.fixture(scope="session")
def q(project):
    """q(sql) runs SQL on the fixture warehouse and returns a list of rows."""
    con = duckdb.connect(str(project / "data/warehouse/transit.duckdb"), read_only=True)
    con.execute("SET TimeZone = 'UTC'")
    yield lambda sql: con.execute(sql).fetchall()
    con.close()
