"""Supabase 수집 결과 적재 (AS-IS saveCollectorRunToSupabase)."""

from __future__ import annotations

from app.integrations.supabase.client import get_supabase_client
from app.services.storage.normalize import normalize_collector_run
from src.errors.api_route import ApiRouteError

_BATCH_SIZE = 100


def _client():
    client = get_supabase_client()
    if not client:
        raise ApiRouteError(
            code="SUPABASE_NOT_CONFIGURED",
            message="Supabase 서버 연결 설정이 필요합니다.",
            status=503,
        )
    return client


def _insert_batches(table: str, rows: list[dict]) -> None:
    if not rows:
        return
    client = _client()
    for start in range(0, len(rows), _BATCH_SIZE):
        chunk = rows[start : start + _BATCH_SIZE]
        client.table(table).insert(chunk).execute()


def save_collector_run_supabase(result: dict, *, sessions_only: bool = False) -> dict:
    """정규화된 Collector 실행 결과를 Supabase에 저장합니다."""
    normalized = normalize_collector_run(result)
    run = dict(normalized["collectionRun"])
    if sessions_only:
        run["metricsCount"] = 0
        run["locksCount"] = 0
        run["sqlCount"] = 0

    _insert_batches(
        "collection_run",
        [
            {
                "id": run["id"],
                "tenant_id": run["tenantId"],
                "db_instance_id": run["dbInstanceId"],
                "started_at": run["startedAt"],
                "finished_at": run["finishedAt"],
                "status": run["status"],
                "error_message": run.get("errorMessage"),
                "metrics_count": run["metricsCount"],
                "sessions_count": run["sessionsCount"],
                "locks_count": run["locksCount"],
                "sql_count": run["sqlCount"],
            }
        ],
    )

    if not sessions_only:
        _insert_batches(
            "metric_history",
            [
                {
                    "id": m["id"],
                    "tenant_id": m["tenantId"],
                    "db_instance_id": m["dbInstanceId"],
                    "metric_time": m["metricTime"],
                    "metric_name": m["metricName"],
                    "metric_value": m["metricValue"],
                    "unit": m.get("unit"),
                    "tags": m.get("tags") or {},
                }
                for m in normalized["metricHistory"]
            ],
        )

    _insert_batches(
        "session_snapshot",
        [
            {
                "id": s["id"],
                "tenant_id": s["tenantId"],
                "db_instance_id": s["dbInstanceId"],
                "snapshot_time": s["snapshotTime"],
                "session_id": s["sessionId"],
                "login_name": s["loginName"],
                "status": s["status"],
                "wait_type": s.get("waitType"),
                "wait_ms": s.get("waitMs"),
                "sql_id": s.get("sqlId"),
                "blocking_session_id": s.get("blockingSessionId"),
                "command": s.get("command"),
                "cpu_time_ms": s.get("cpuTimeMs"),
                "logical_reads": s.get("logicalReads"),
                "sql_text_masked": s.get("sqlTextMasked"),
                "host_name": s.get("hostName"),
                "program_name": s.get("programName"),
                "database_name": s.get("databaseName"),
            }
            for s in normalized["sessionSnapshots"]
        ],
    )

    if not sessions_only:
        _insert_batches(
            "blocking_snapshot",
            [
                {
                    "id": b["id"],
                    "tenant_id": b["tenantId"],
                    "db_instance_id": b["dbInstanceId"],
                    "snapshot_time": b["snapshotTime"],
                    "blocker_session_id": b["blockerSessionId"],
                    "blocked_session_id": b["blockedSessionId"],
                    "lock_type": b["lockType"],
                    "wait_ms": b["waitMs"],
                    "object_name": b.get("objectName"),
                }
                for b in normalized["blockingSnapshots"]
            ],
        )
        _insert_batches(
            "sql_performance",
            [
                {
                    "id": sql["id"],
                    "tenant_id": sql["tenantId"],
                    "db_instance_id": sql["dbInstanceId"],
                    "metric_time": sql["metricTime"],
                    "sql_id": sql["sqlId"],
                    "sql_text_masked": sql["sqlTextMasked"],
                    "executions": sql["executions"],
                    "avg_elapsed_ms": sql["avgElapsedMs"],
                    "total_cpu_ms": sql["totalCpuMs"],
                    "total_logical_reads": sql.get("totalLogicalReads"),
                    "last_execution_time": sql.get("lastExecutionTime"),
                }
                for sql in normalized["sqlPerformance"]
            ],
        )

    return run