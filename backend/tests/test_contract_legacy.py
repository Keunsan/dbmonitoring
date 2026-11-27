"""AS-IS Next vs TO-BE Python 계약 테스트 (CONTRACT_LEGACY_BASE_URL 선택)."""

from __future__ import annotations

import os

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

LEGACY_PATHS = [
    ("GET", "/api/business-systems", "/api/v1/business-systems"),
    ("GET", "/api/db-instances", "/api/v1/db-instances"),
    ("GET", "/api/monitoring/summary", "/api/v1/monitoring/summary"),
    ("GET", "/api/monitoring/metrics", "/api/v1/monitoring/metrics"),
    ("GET", "/api/monitoring/sessions", "/api/v1/monitoring/sessions"),
    ("GET", "/api/monitoring/sql", "/api/v1/monitoring/sql"),
    ("GET", "/api/monitoring/runs", "/api/v1/monitoring/runs"),
    ("GET", "/api/monitoring/blocking", "/api/v1/monitoring/blocking"),
    ("GET", "/api/monitoring/deadlocks", "/api/v1/monitoring/deadlocks"),
    ("GET", "/api/alerts", "/api/v1/alerts"),
    ("GET", "/api/collector/status", "/api/v1/collector/status"),
    ("GET", "/api/health", "/api/v1/health"),
]


@pytest.mark.parametrize("method,legacy_path,current_path", LEGACY_PATHS)
@pytest.mark.skipif(
    not os.getenv("CONTRACT_LEGACY_BASE_URL"),
    reason="CONTRACT_LEGACY_BASE_URL 미설정",
)
def test_contract_legacy_envelope(method: str, legacy_path: str, current_path: str) -> None:
    legacy_base = os.environ["CONTRACT_LEGACY_BASE_URL"].rstrip("/")
    with httpx.Client(timeout=30.0) as http:
        legacy = http.request(method, f"{legacy_base}{legacy_path}").json()
    current = client.request(method, current_path).json()
    assert legacy.get("error") is None
    assert current.get("error") is None
    assert set(legacy.keys()) == set(current.keys())