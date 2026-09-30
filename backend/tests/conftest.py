from __future__ import annotations

import os
import time
from pathlib import Path

import pytest


@pytest.fixture(scope="session", autouse=True)
def configured_environment(tmp_path_factory):
    data_dir = tmp_path_factory.mktemp("fatscope-data")
    os.environ["DATA_DIR"] = str(data_dir)
    os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000"
    os.environ["MAX_UPLOAD_MB"] = "128"
    os.environ["ANALYSIS_TTL_HOURS"] = "6"
    from app import db
    from app.config import get_settings

    get_settings.cache_clear()
    db.reset_database_state()
    yield data_dir
    db.reset_database_state()


@pytest.fixture(scope="session")
def demo_image(tmp_path_factory) -> Path:
    from app.fat32.demo import build_demo_image

    target = tmp_path_factory.mktemp("images") / "demo.img"
    build_demo_image(target)
    return target


@pytest.fixture(scope="session")
def raw_volume_image(demo_image, tmp_path_factory) -> Path:
    from app.fat32.demo import VOLUME_OFFSET

    target = tmp_path_factory.mktemp("images-raw") / "volume.img"
    target.write_bytes(demo_image.read_bytes()[VOLUME_OFFSET:])
    return target


@pytest.fixture(scope="session")
def demo_result(demo_image):
    from app.fat32.analyzer import Fat32Analyzer

    return Fat32Analyzer(str(demo_image)).run()


@pytest.fixture(scope="session")
def client(configured_environment):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client


def wait_for_completion(client, analysis_id: str, timeout: float = 60.0) -> dict:
    deadline = time.time() + timeout
    payload: dict = {}
    while time.time() < deadline:
        response = client.get(f"/api/v1/analyses/{analysis_id}/status")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] in ("completed", "failed"):
            return payload
        time.sleep(0.1)
    raise AssertionError(f"Analysis {analysis_id} did not finish within {timeout}s: {payload}")
