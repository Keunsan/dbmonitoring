"""T-027 수준 Collector → evaluate → alerts E2E (메모리 백엔드)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _memory_backend(monkeypatch: pytest.MonkeyPatch) -> None:
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


def test_collector_run_evaluate_alerts() -> None:
    run = client.post("/api/v1/collector/run", json={"dbInstanceId": "db_erp_test"})
    assert run.status_code == 200
    assert run.json().get("error") is None

    summary = client.get("/api/v1/monitoring/summary?dbInstanceId=db_erp_test")
    assert summary.status_code == 200
    items = summary.json()["data"]["items"]
    assert items[0]["summary"]["latestMetrics"]

    evaluate = client.post("/api/v1/alerts/evaluate")
    assert evaluate.status_code == 200

    alerts = client.get("/api/v1/alerts")
    assert alerts.status_code == 200
    assert isinstance(alerts.json()["data"]["items"], list)