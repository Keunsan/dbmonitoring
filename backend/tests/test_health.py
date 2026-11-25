"""헬스 API 단위 테스트입니다."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok_envelope() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body.get("error") is None
    assert body["data"]["status"] == "ok"
    assert body["data"]["runtime"] == "python"