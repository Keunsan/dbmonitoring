"""Oracle Agentless 수집 스텁 (AS-IS 동등)."""

from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def test_connection(_context: dict) -> dict:
    return {
        "ok": False,
        "message": "Oracle 수집은 아직 Python 이관 중입니다.",
    }


def collect(context: dict, *, scope: str = "full") -> dict:
    ts = _now()
    return {
        "dbInstanceId": context.get("dbInstanceId"),
        "status": "FAIL",
        "errorMessage": "Oracle 수집 어댑터는 스텁 상태입니다.",
        "startedAt": ts,
        "finishedAt": ts,
        "metrics": [],
        "sessions": [],
        "locks": [],
        "sql": [],
        "deadlocks": [],
        "sqlPlans": [],
    }