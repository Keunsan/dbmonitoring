"""MSSQL Agentless 수집 어댑터 (04_db_collection_items 핵심 항목)."""

from __future__ import annotations

from datetime import datetime, timezone

from app.integrations.mssql.pool import mssql_connection
from app.services.monitoring.metric_keys import SERVER_METRIC_KEYS
from app.services.processing.mask_sql import mask_sql_text
from app.services.secrets.env_provider import resolve_connection_config


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def test_connection(context: dict) -> dict:
    try:
        config = resolve_connection_config(context.get("connectionSecretRef") or "")
        with mssql_connection(**config) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT @@VERSION AS version")
                row = cur.fetchone() or {}
        return {"ok": True, "message": "연결에 성공했습니다.", "version": row.get("version")}
    except Exception as exc:
        return {"ok": False, "message": f"연결에 실패했습니다: {exc}"}


def _collect_metrics(cur, collect_time: str) -> list[dict]:
    metrics: list[dict] = []
    queries = [
        (
            SERVER_METRIC_KEYS["userConnections"],
            "SELECT cntr_value AS metric_value FROM sys.dm_os_performance_counters "
            "WHERE counter_name = 'User Connections' AND instance_name = ''",
            "count",
        ),
        (
            SERVER_METRIC_KEYS["pageLifeExpectancy"],
            "SELECT cntr_value AS metric_value FROM sys.dm_os_performance_counters "
            "WHERE counter_name = 'Page life expectancy' AND object_name LIKE '%Buffer Manager%'",
            "seconds",
        ),
    ]
    for name, sql, unit in queries:
        try:
            cur.execute(sql)
            row = cur.fetchone()
            if row and row.get("metric_value") is not None:
                metrics.append(
                    {
                        "metricName": name,
                        "metricValue": float(row["metric_value"]),
                        "unit": unit,
                        "collectTime": collect_time,
                        "tags": {},
                    }
                )
        except Exception:
            continue
    return metrics


def _collect_sessions(cur, collect_time: str) -> list[dict]:
    cur.execute(
        """
        SELECT TOP (200)
            s.session_id,
            s.login_name,
            s.status,
            s.wait_type,
            s.wait_time AS wait_ms,
            r.command,
            r.cpu_time AS cpu_time_ms,
            r.logical_reads,
            DB_NAME(r.database_id) AS database_name,
            s.host_name,
            s.program_name,
            SUBSTRING(t.text, (r.statement_start_offset/2)+1,
              ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text)
                ELSE r.statement_end_offset END - r.statement_start_offset)/2) + 1) AS sql_text
        FROM sys.dm_exec_sessions s
        LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
        OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
        WHERE s.is_user_process = 1
        ORDER BY s.session_id
        """
    )
    rows = cur.fetchall()
    sessions = []
    for row in rows:
        sql_text = mask_sql_text(row.get("sql_text"))
        sessions.append(
            {
                "sessionId": str(row["session_id"]),
                "loginName": row.get("login_name") or "",
                "status": row.get("status") or "",
                "waitType": row.get("wait_type"),
                "waitMs": row.get("wait_ms"),
                "sqlId": None,
                "blockingSessionId": None,
                "command": row.get("command"),
                "cpuTimeMs": row.get("cpu_time_ms"),
                "logicalReads": row.get("logical_reads"),
                "sqlTextMasked": sql_text,
                "hostName": row.get("host_name"),
                "programName": row.get("program_name"),
                "databaseName": row.get("database_name"),
                "collectTime": collect_time,
            }
        )
    return sessions


def collect(context: dict, *, scope: str = "full") -> dict:
    """대상 DB에서 메트릭·세션을 수집합니다."""
    started = _now()
    try:
        config = resolve_connection_config(context.get("connectionSecretRef") or "")
        with mssql_connection(**config) as conn:
            with conn.cursor() as cur:
                metrics = [] if scope == "sessions" else _collect_metrics(cur, started)
                sessions = _collect_sessions(cur, started)
        finished = _now()
        return {
            "status": "SUCCESS",
            "errorMessage": None,
            "startedAt": started,
            "finishedAt": finished,
            "metrics": metrics,
            "sessions": sessions,
            "locks": [],
            "sql": [],
            "deadlocks": [],
            "sqlPlans": [],
        }
    except Exception as exc:
        return {
            "status": "FAIL",
            "errorMessage": str(exc),
            "startedAt": started,
            "finishedAt": _now(),
            "metrics": [],
            "sessions": [],
            "locks": [],
            "sql": [],
            "deadlocks": [],
            "sqlPlans": [],
        }


def collect_dev_fallback(db_instance_id: str, *, scope: str = "full") -> dict:
    """연결 불가 시 메모리 E2E용 최소 샘플 페이로드."""
    now = _now()
    metrics = []
    if scope != "sessions":
        metrics = [
            {
                "metricName": SERVER_METRIC_KEYS["userConnections"],
                "metricValue": 12.0,
                "unit": "count",
                "collectTime": now,
                "tags": {},
            },
            {
                "metricName": SERVER_METRIC_KEYS["pageLifeExpectancy"],
                "metricValue": 3500.0,
                "unit": "seconds",
                "collectTime": now,
                "tags": {},
            },
        ]
    return {
        "dbInstanceId": db_instance_id,
        "status": "SUCCESS",
        "errorMessage": None,
        "startedAt": now,
        "finishedAt": now,
        "metrics": metrics,
        "sessions": [
            {
                "sessionId": "51",
                "loginName": "sa",
                "status": "running",
                "waitType": None,
                "waitMs": None,
                "sqlId": None,
                "blockingSessionId": None,
                "command": "SELECT",
                "cpuTimeMs": 10,
                "logicalReads": 100,
                "sqlTextMasked": "SELECT " + "•" * 6,
                "hostName": "DEV",
                "programName": "dbmonitoring-collector",
                "databaseName": "master",
                "collectTime": now,
            }
        ],
        "locks": [],
        "sql": [],
        "deadlocks": [],
        "sqlPlans": [],
    }