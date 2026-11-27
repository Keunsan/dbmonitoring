"""MSSQL Agentless 수집 어댑터 (04_db_collection_items 핵심 항목)."""

from __future__ import annotations

from datetime import datetime, timezone

from app.integrations.mssql.pool import mssql_connection
from app.services.monitoring.metric_keys import SERVER_METRIC_KEYS
from app.services.processing.sanitize_sql import sanitize_sql_text_for_storage
from app.services.secrets.env_provider import resolve_connection_config, resolve_connection_for_instance

_PERFORMANCE_COUNTERS_SQL = """
    SELECT
        RTRIM(counter_name) AS metric_name,
        CAST(cntr_value AS float) AS metric_value,
        RTRIM(object_name) AS object_name,
        NULLIF(RTRIM(instance_name), '') AS instance_name
    FROM sys.dm_os_performance_counters
    WHERE counter_name IN (
        'User Connections',
        'Page life expectancy',
        'Processes blocked',
        'Memory Grants Pending',
        'Batch Requests/sec',
        'Transactions/sec'
    )
    AND (
        object_name LIKE '%SQL Statistics%'
        OR object_name LIKE '%Buffer Manager%'
        OR object_name LIKE '%Memory Manager%'
        OR object_name LIKE '%General Statistics%'
        OR object_name LIKE '%:Databases%'
    )
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def test_connection(context: dict) -> dict:
    try:
        config = (
            resolve_connection_for_instance(context)
            if context.get("host")
            else resolve_connection_config(context.get("connectionSecretRef") or "")
        )
        with mssql_connection(**config) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT @@VERSION AS version")
                row = cur.fetchone() or {}
        return {"ok": True, "message": "연결에 성공했습니다.", "version": row.get("version")}
    except Exception as exc:
        return {"ok": False, "message": f"연결에 실패했습니다: {exc}"}


def _find_counter(rows: list[dict], counter_name: str, object_suffix: str) -> dict | None:
    for row in rows:
        if row.get("metric_name") != counter_name:
            continue
        object_name = row.get("object_name") or ""
        if object_name.endswith(object_suffix) or object_suffix in object_name:
            return row
    return None


def _clamp_percent(value: float | None) -> float | None:
    if value is None:
        return None
    return max(0.0, min(100.0, float(value)))


def _append_metric(
    metrics: list[dict],
    *,
    name: str,
    value: float | None,
    unit: str,
    collect_time: str,
    tags: dict | None = None,
) -> None:
    if value is None:
        return
    metrics.append(
        {
            "metricName": name,
            "metricValue": float(value),
            "unit": unit,
            "collectTime": collect_time,
            "tags": tags or {},
        }
    )


def _collect_extra_metrics(cur, collect_time: str, metrics: list[dict]) -> None:
    """대시보드 resourceSummary용 CPU·메모리·스토리지·세션 집계를 추가합니다."""
    if not any(m["metricName"] == SERVER_METRIC_KEYS["cpuUsedPercent"] for m in metrics):
        try:
            cur.execute(
                """
                SELECT
                    RTRIM(counter_name) AS metric_name,
                    CAST(cntr_value AS float) AS metric_value,
                    RTRIM(object_name) AS object_name
                FROM sys.dm_os_performance_counters
                WHERE counter_name IN (N'% Processor Time', N'Process % Processor Time')
                  AND RTRIM(instance_name) = N'_Total'
                """
            )
            cpu_rows = cur.fetchall() or []
        except Exception:
            cpu_rows = []
        for row in cpu_rows:
            _append_metric(
                metrics,
                name=SERVER_METRIC_KEYS["cpuUsedPercent"],
                value=_clamp_percent(row.get("metric_value")),
                unit="percent",
                collect_time=collect_time,
                tags={"source": "dm_os_performance_counters", "rawName": row.get("metric_name")},
            )
            break

    try:
        cur.execute(
            """
            SELECT
                CAST(total_physical_memory_kb AS float) AS total_kb,
                CAST(available_physical_memory_kb AS float) AS available_kb
            FROM sys.dm_os_sys_memory
            """
        )
        mem = cur.fetchone() or {}
        total_kb = float(mem.get("total_kb") or 0)
        available_kb = float(mem.get("available_kb") or 0)
        if total_kb > 0:
            used_percent = ((total_kb - available_kb) / total_kb) * 100
            _append_metric(
                metrics,
                name=SERVER_METRIC_KEYS["memoryUsedPercent"],
                value=used_percent,
                unit="percent",
                collect_time=collect_time,
                tags={"source": "dm_os_sys_memory"},
            )
            _append_metric(
                metrics,
                name=SERVER_METRIC_KEYS["memoryAvailableMb"],
                value=available_kb / 1024.0,
                unit="mb",
                collect_time=collect_time,
                tags={"source": "dm_os_sys_memory"},
            )
    except Exception:
        pass

    try:
        cur.execute(
            """
            SELECT
                CAST(SUM(num_of_reads) AS float) AS num_reads,
                CAST(SUM(num_of_writes) AS float) AS num_writes,
                CAST(SUM(io_stall_read_ms) AS float) AS read_stall_ms,
                CAST(SUM(io_stall_write_ms) AS float) AS write_stall_ms
            FROM sys.dm_io_virtual_file_stats(DB_ID(), NULL)
            """
        )
        io_row = cur.fetchone() or {}
        num_reads = float(io_row.get("num_reads") or 0)
        num_writes = float(io_row.get("num_writes") or 0)
        read_stall_ms = float(io_row.get("read_stall_ms") or 0)
        write_stall_ms = float(io_row.get("write_stall_ms") or 0)
        if num_reads > 0 or num_writes > 0:
            _append_metric(
                metrics,
                name=SERVER_METRIC_KEYS["diskReadIops"],
                value=num_reads,
                unit="count",
                collect_time=collect_time,
                tags={"source": "dm_io_virtual_file_stats"},
            )
            _append_metric(
                metrics,
                name=SERVER_METRIC_KEYS["diskWriteIops"],
                value=num_writes,
                unit="count",
                collect_time=collect_time,
                tags={"source": "dm_io_virtual_file_stats"},
            )
            if num_reads > 0:
                _append_metric(
                    metrics,
                    name=SERVER_METRIC_KEYS["diskReadLatencyMs"],
                    value=read_stall_ms / num_reads,
                    unit="ms",
                    collect_time=collect_time,
                    tags={"source": "dm_io_virtual_file_stats"},
                )
            if num_writes > 0:
                _append_metric(
                    metrics,
                    name=SERVER_METRIC_KEYS["diskWriteLatencyMs"],
                    value=write_stall_ms / num_writes,
                    unit="ms",
                    collect_time=collect_time,
                    tags={"source": "dm_io_virtual_file_stats"},
                )
    except Exception:
        pass

    try:
        cur.execute(
            """
            SELECT
                type_desc AS type_desc,
                CAST(size * 8.0 / 1024 AS float) AS size_mb,
                CAST(FILEPROPERTY(name, 'SpaceUsed') * 8.0 / 1024 AS float) AS used_mb
            FROM sys.database_files
            """
        )
        data_size = 0.0
        data_used = 0.0
        log_size = 0.0
        log_used = 0.0
        for row in cur.fetchall() or []:
            if row.get("type_desc") == "ROWS":
                data_size += float(row.get("size_mb") or 0)
                data_used += float(row.get("used_mb") or 0)
            if row.get("type_desc") == "LOG":
                log_size += float(row.get("size_mb") or 0)
                log_used += float(row.get("used_mb") or 0)
        if data_size > 0:
            _append_metric(
                metrics,
                name=SERVER_METRIC_KEYS["storageDataSizeMb"],
                value=data_size,
                unit="mb",
                collect_time=collect_time,
                tags={"source": "sys.database_files"},
            )
            _append_metric(
                metrics,
                name=SERVER_METRIC_KEYS["storageDataUsedMb"],
                value=data_used,
                unit="mb",
                collect_time=collect_time,
                tags={"source": "sys.database_files"},
            )
        if log_size > 0:
            _append_metric(
                metrics,
                name=SERVER_METRIC_KEYS["logUsedPercent"],
                value=(log_used / log_size) * 100,
                unit="percent",
                collect_time=collect_time,
                tags={"source": "sys.database_files"},
            )
    except Exception:
        pass

    try:
        cur.execute(
            """
            SELECT CAST(SUM(
                COALESCE(FILEPROPERTY(name, 'SpaceUsed'), size) * 8.0 / 1024
            ) AS float) AS used_mb
            FROM tempdb.sys.database_files
            """
        )
        temp_row = cur.fetchone() or {}
        _append_metric(
            metrics,
            name=SERVER_METRIC_KEYS["tempdbUsedMb"],
            value=temp_row.get("used_mb"),
            unit="mb",
            collect_time=collect_time,
            tags={"source": "tempdb.sys.database_files"},
        )
    except Exception:
        pass

    try:
        cur.execute(
            """
            SELECT
                COUNT(*) AS total_sessions,
                SUM(CASE WHEN s.status = N'running' THEN 1 ELSE 0 END) AS active_sessions,
                SUM(CASE WHEN s.status = N'sleeping' THEN 1 ELSE 0 END) AS idle_sessions,
                SUM(
                    CASE
                        WHEN r.session_id IS NOT NULL
                          AND r.status = N'running'
                          AND ISNULL(r.command, N'') NOT IN (N'AWAIT COMMAND', N'CONNECT', N'KILLED')
                        THEN 1
                        ELSE 0
                    END
                ) AS running_sql_sessions
            FROM sys.dm_exec_sessions s
            LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
            WHERE s.is_user_process = 1 AND s.session_id > 50
            """
        )
        agg = cur.fetchone() or {}
        _append_metric(
            metrics,
            name=SERVER_METRIC_KEYS["sessionTotalCount"],
            value=agg.get("total_sessions"),
            unit="count",
            collect_time=collect_time,
            tags={"source": "dm_exec_sessions"},
        )
        _append_metric(
            metrics,
            name=SERVER_METRIC_KEYS["sessionActiveCount"],
            value=agg.get("active_sessions"),
            unit="count",
            collect_time=collect_time,
            tags={"source": "dm_exec_sessions"},
        )
        _append_metric(
            metrics,
            name=SERVER_METRIC_KEYS["sessionIdleCount"],
            value=agg.get("idle_sessions"),
            unit="count",
            collect_time=collect_time,
            tags={"source": "dm_exec_sessions"},
        )
        _append_metric(
            metrics,
            name=SERVER_METRIC_KEYS["sessionRunningSqlCount"],
            value=agg.get("running_sql_sessions"),
            unit="count",
            collect_time=collect_time,
            tags={"source": "dm_exec_sessions"},
        )
    except Exception:
        pass


def _collect_metrics(cur, collect_time: str) -> list[dict]:
    metrics: list[dict] = []
    try:
        cur.execute(_PERFORMANCE_COUNTERS_SQL)
        counter_rows = cur.fetchall() or []
    except Exception:
        counter_rows = []

    mapping = [
        (SERVER_METRIC_KEYS["userConnections"], "User Connections", "General Statistics", "count"),
        (SERVER_METRIC_KEYS["pageLifeExpectancy"], "Page life expectancy", "Buffer Manager", "seconds"),
        (SERVER_METRIC_KEYS["processesBlocked"], "Processes blocked", "General Statistics", "count"),
        (SERVER_METRIC_KEYS["memoryGrantsPending"], "Memory Grants Pending", "Memory Manager", "count"),
        (SERVER_METRIC_KEYS["batchRequestsPerSec"], "Batch Requests/sec", "SQL Statistics", "per_second"),
        (SERVER_METRIC_KEYS["transactionsPerSec"], "Transactions/sec", "Databases", "per_second"),
    ]
    for key, counter, suffix, unit in mapping:
        row = _find_counter(counter_rows, counter, suffix)
        if row and row.get("metric_value") is not None:
            metrics.append(
                {
                    "metricName": key,
                    "metricValue": float(row["metric_value"]),
                    "unit": unit,
                    "collectTime": collect_time,
                    "tags": {"rawName": counter},
                }
            )
    _collect_extra_metrics(cur, collect_time, metrics)
    return metrics


def _collect_sessions(cur, collect_time: str) -> list[dict]:
    cur.execute(
        """
        SELECT TOP (200)
            s.session_id,
            s.login_name,
            s.status,
            r.wait_type,
            r.wait_time AS wait_ms,
            CONVERT(varchar(64), r.query_hash, 2) AS sql_id,
            NULLIF(r.blocking_session_id, 0) AS blocking_session_id,
            r.command,
            r.cpu_time AS cpu_time_ms,
            r.logical_reads,
            DB_NAME(COALESCE(r.database_id, s.database_id)) AS database_name,
            s.host_name,
            s.program_name,
            SUBSTRING(t.text, (r.statement_start_offset/2)+1,
              ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text)
                ELSE r.statement_end_offset END - r.statement_start_offset)/2) + 1) AS sql_text
        FROM sys.dm_exec_sessions s
        LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
        OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
        WHERE s.is_user_process = 1 AND s.session_id > 50
        ORDER BY COALESCE(r.cpu_time, 0) DESC, s.session_id
        """
    )
    rows = cur.fetchall()
    sessions = []
    for row in rows:
        sql_text = sanitize_sql_text_for_storage(row.get("sql_text"))
        blocking = row.get("blocking_session_id")
        sessions.append(
            {
                "sessionId": str(row["session_id"]),
                "loginName": row.get("login_name") or "",
                "status": row.get("status") or "",
                "waitType": row.get("wait_type"),
                "waitMs": row.get("wait_ms"),
                "sqlId": row.get("sql_id"),
                "blockingSessionId": str(blocking) if blocking else None,
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


def _collect_blocking(cur, collect_time: str) -> list[dict]:
    cur.execute(
        """
        SELECT TOP (50)
            r.blocking_session_id AS blocker_session_id,
            r.session_id AS blocked_session_id,
            COALESCE(tl.resource_type, 'REQUEST') AS lock_type,
            r.wait_time AS wait_ms,
            OBJECT_NAME(p.object_id, r.database_id) AS object_name
        FROM sys.dm_exec_requests r
        LEFT JOIN sys.dm_tran_locks tl ON r.session_id = tl.request_session_id
        LEFT JOIN sys.partitions p ON tl.resource_associated_entity_id = p.hobt_id
        WHERE r.blocking_session_id <> 0
        ORDER BY r.wait_time DESC
        """
    )
    locks = []
    for row in cur.fetchall() or []:
        locks.append(
            {
                "collectTime": collect_time,
                "blockerSessionId": str(row["blocker_session_id"]),
                "blockedSessionId": str(row["blocked_session_id"]),
                "lockType": row.get("lock_type") or "REQUEST",
                "waitMs": int(row.get("wait_ms") or 0),
                "objectName": row.get("object_name"),
            }
        )
    return locks


def _collect_sql_plans(cur, collect_time: str) -> list[dict]:
    cur.execute(
        """
        SELECT TOP (10)
            CONVERT(varchar(64), qs.query_hash, 2) AS sql_id,
            CONVERT(varchar(64), qs.plan_handle, 2) AS plan_hash,
            LEFT(CAST(qp.query_plan AS nvarchar(max)), 8000) AS plan_text,
            qs.execution_count AS executions,
            CAST((qs.total_elapsed_time / NULLIF(qs.execution_count, 0)) / 1000.0 AS float) AS avg_elapsed_ms,
            CAST(qs.total_worker_time / 1000.0 AS float) AS total_cpu_ms,
            CAST(qs.total_logical_reads AS float) AS total_logical_reads
        FROM sys.dm_exec_query_stats qs
        CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
        WHERE qp.query_plan IS NOT NULL
        ORDER BY qs.total_worker_time DESC
        """
    )
    plans = []
    for row in cur.fetchall() or []:
        plans.append(
            {
                "collectTime": collect_time,
                "sqlId": row["sql_id"],
                "planHash": row["plan_hash"],
                "planText": row.get("plan_text") or "",
                "executions": int(row.get("executions") or 0),
                "avgElapsedMs": float(row.get("avg_elapsed_ms") or 0),
                "totalCpuMs": float(row.get("total_cpu_ms") or 0),
                "totalLogicalReads": row.get("total_logical_reads"),
            }
        )
    return plans


def _collect_sql(cur, collect_time: str) -> list[dict]:
    cur.execute(
        """
        SELECT TOP (20)
            CONVERT(varchar(64), qs.query_hash, 2) AS sql_id,
            SUBSTRING(
                st.text,
                (qs.statement_start_offset / 2) + 1,
                CASE qs.statement_end_offset
                    WHEN -1 THEN DATALENGTH(st.text)
                    ELSE (qs.statement_end_offset - qs.statement_start_offset) / 2 + 1
                END
            ) AS sql_text,
            qs.execution_count AS executions,
            CAST((qs.total_elapsed_time / NULLIF(qs.execution_count, 0)) / 1000.0 AS float) AS avg_elapsed_ms,
            CAST(qs.total_worker_time / 1000.0 AS float) AS total_cpu_ms,
            CAST(qs.total_logical_reads AS float) AS total_logical_reads,
            qs.last_execution_time AS last_execution_time
        FROM sys.dm_exec_query_stats qs
        CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
        ORDER BY qs.total_worker_time DESC
        """
    )
    items = []
    for row in cur.fetchall() or []:
        items.append(
            {
                "collectTime": collect_time,
                "sqlId": row["sql_id"],
                "sqlTextMasked": sanitize_sql_text_for_storage(row.get("sql_text")),
                "executions": int(row.get("executions") or 0),
                "avgElapsedMs": float(row.get("avg_elapsed_ms") or 0),
                "totalCpuMs": float(row.get("total_cpu_ms") or 0),
                "totalLogicalReads": row.get("total_logical_reads"),
                "lastExecutionTime": row.get("last_execution_time"),
            }
        )
    return items


def collect(context: dict, *, scope: str = "full") -> dict:
    """대상 DB에서 메트릭·세션·락·SQL 성능을 수집합니다."""
    started = _now()
    try:
        config = resolve_connection_for_instance(context)
        with mssql_connection(**config) as conn:
            with conn.cursor() as cur:
                metrics = [] if scope == "sessions" else _collect_metrics(cur, started)
                sessions = _collect_sessions(cur, started)
                locks = [] if scope == "sessions" else _collect_blocking(cur, started)
                sql_items = [] if scope == "sessions" else _collect_sql(cur, started)
                sql_plans = [] if scope == "sessions" else _collect_sql_plans(cur, started)
        finished = _now()
        return {
            "status": "SUCCESS",
            "errorMessage": None,
            "startedAt": started,
            "finishedAt": finished,
            "metrics": metrics,
            "sessions": sessions,
            "locks": locks,
            "sql": sql_items,
            "deadlocks": [],
            "sqlPlans": sql_plans,
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