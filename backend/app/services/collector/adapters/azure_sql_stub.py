"""Azure SQL DMV 수집 스텁 (AS-IS 동등)."""


def test_connection(_context: dict) -> dict:
    return {
        "ok": False,
        "message": "Azure SQL DMV 수집은 아직 Python 이관 중입니다.",
    }


def collect(_context: dict, *, scope: str = "full") -> dict:
    return {
        "status": "FAIL",
        "errorMessage": "Azure SQL 어댑터는 스텁 상태입니다.",
        "metrics": [],
        "sessions": [],
        "locks": [],
        "sql": [],
        "deadlocks": [],
        "sqlPlans": [],
    }