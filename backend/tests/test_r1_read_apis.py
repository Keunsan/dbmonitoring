"""R1 읽기 API 봉투·메모리 백엔드 계약 테스트입니다."""

from __future__ import annotations

import os

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _memory_backend(monkeypatch: pytest.MonkeyPatch) -> None:
    """테스트는 MSSQL/Supabase 없이 메모리 시드로 동작합니다."""
    from src.config import loader, storage_backend

    loader.get_settings.cache_clear()
    monkeypatch.setenv("MSSQL_HOST", "")
    monkeypatch.setenv("MSSQL_DATABASE", "")
    monkeypatch.setenv("MSSQL_USER", "")
    monkeypatch.setenv("MSSQL_PASSWORD", "")
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "")
    loader.get_settings.cache_clear()
    monkeypatch.setattr(storage_backend, "use_mssql_backend", lambda: False)
    monkeypatch.setattr(storage_backend, "use_supabase_backend", lambda: False)


def _assert_envelope(body: dict) -> None:
    assert "data" in body
    assert body.get("error") is None


def test_business_systems_memory() -> None:
    response = client.get("/api/v1/business-systems")
    assert response.status_code == 200
    body = response.json()
    _assert_envelope(body)
    assert isinstance(body["data"], list)
    assert body["data"][0]["code"] == "ERP"


def test_db_instances_memory() -> None:
    response = client.get("/api/v1/db-instances")
    assert response.status_code == 200
    body = response.json()
    _assert_envelope(body)
    assert "items" in body["data"]
    assert "businessSystems" in body["data"]
    assert body["data"]["items"][0]["id"] == "db_erp_test"


def test_monitoring_summary_memory() -> None:
    response = client.get("/api/v1/monitoring/summary")
    assert response.status_code == 200
    body = response.json()
    _assert_envelope(body)
    items = body["data"]["items"]
    assert len(items) >= 1
    assert items[0]["summary"]["dbInstanceId"] == "db_erp_test"


def test_monitoring_metrics_memory() -> None:
    response = client.get("/api/v1/monitoring/metrics")
    assert response.status_code == 200
    body = response.json()
    _assert_envelope(body)
    assert body["data"]["items"] == []


def test_alerts_memory() -> None:
    response = client.get("/api/v1/alerts")
    assert response.status_code == 200
    body = response.json()
    _assert_envelope(body)
    assert body["data"]["items"] == []


@pytest.mark.skipif(
    not os.getenv("CONTRACT_LEGACY_BASE_URL"),
    reason="CONTRACT_LEGACY_BASE_URL 미설정",
)
def test_contract_business_systems_vs_legacy() -> None:
    """AS-IS Next와 동일 JSON 구조(데이터 동등)를 검증합니다."""
    legacy_base = os.environ["CONTRACT_LEGACY_BASE_URL"].rstrip("/")

    with httpx.Client(timeout=30.0) as http:
        legacy = http.get(f"{legacy_base}/api/business-systems").json()
    current = client.get("/api/v1/business-systems").json()

    assert legacy.get("error") is None
    assert current.get("error") is None
    assert legacy["data"] == current["data"]