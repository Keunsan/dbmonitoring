"""R2 인벤토리 쓰기 API (메모리 백엔드)."""

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
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "")
    loader.get_settings.cache_clear()
    monkeypatch.setattr(storage_backend, "use_mssql_backend", lambda: False)
    monkeypatch.setattr(storage_backend, "use_supabase_backend", lambda: False)


def test_business_system_crud_memory() -> None:
    created = client.post(
        "/api/v1/business-systems",
        json={
            "code": "gw",
            "name": "그룹웨어",
            "importance": "MEDIUM",
        },
    )
    assert created.status_code == 201
    record_id = created.json()["data"]["id"]

    patched = client.patch(
        f"/api/v1/business-systems/{record_id}",
        json={
            "code": "GW",
            "name": "그룹웨어(수정)",
            "importance": "HIGH",
        },
    )
    assert patched.status_code == 200
    assert patched.json()["data"]["name"] == "그룹웨어(수정)"

    deleted = client.delete(f"/api/v1/business-systems/{record_id}")
    assert deleted.status_code == 200


def test_collection_settings_memory() -> None:
    response = client.get("/api/v1/db-instances/db_erp_test/collection-settings")
    assert response.status_code == 200
    assert response.json()["data"]["collectIntervalSec"] == 60

    patched = client.patch(
        "/api/v1/db-instances/db_erp_test/collection-settings",
        json={
            "collectIntervalSec": 60,
            "sqlAggregateIntervalSec": 120,
            "isActive": True,
        },
    )
    assert patched.status_code == 200
    assert patched.json()["data"]["sqlAggregateIntervalSec"] == 120