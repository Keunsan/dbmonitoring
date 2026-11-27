"""MSSQL 수집 결과 적재 (AS-IS saveCollectorRunToMssql)."""

from __future__ import annotations

import json
from typing import Any

from app.integrations.mssql.pool import mssql_connection
from app.services.processing.sanitize_sql import sanitize_sql_text_for_storage
from app.services.storage.normalize import normalize_collector_run

_BATCH_SIZE = 50
_PLAN_TEXT_MAX = 8_000


def _truncate_plan_text(text: str | None) -> str | None:
    if text is None:
        return None
    return text[:_PLAN_TEXT_MAX]


def _execute_many(cur, sql: str, rows: list[tuple[Any, ...]]) -> None:
    for chunk_start in range(0, len(rows), _BATCH_SIZE):
        for params in rows[chunk_start : chunk_start + _BATCH_SIZE]:
            cur.execute(sql, params)


_SESSION_INSERT_SQL = """
INSERT INTO dbo.session_snapshot (
    id, tenant_id, db_instance_id, snapshot_time, session_id, login_name,
    status, wait_type, wait_ms, sql_id, blocking_session_id, command,
    cpu_time_ms, logical_reads, sql_text_masked, host_name, program_name,
    database_name
) VALUES (
    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
)
"""


def _insert_session_rows(cur, snapshots: list[dict]) -> tuple[int, int]:
    """세션 스냅샷을 행 단위로 적재하고 실패 행은 SQL 텍스트를 비웁니다."""
    ok = 0
    skipped = 0
    for snapshot in snapshots:
        params = (
            snapshot["id"],
            snapshot["tenantId"],
            snapshot["dbInstanceId"],
            snapshot["snapshotTime"],
            snapshot["sessionId"],
            snapshot["loginName"],
            snapshot["status"],
            snapshot.get("waitType"),
            snapshot.get("waitMs"),
            snapshot.get("sqlId"),
            snapshot.get("blockingSessionId"),
            snapshot.get("command"),
            snapshot.get("cpuTimeMs"),
            snapshot.get("logicalReads"),
            sanitize_sql_text_for_storage(snapshot.get("sqlTextMasked")),
            snapshot.get("hostName"),
            snapshot.get("programName"),
            snapshot.get("databaseName"),
        )
        try:
            cur.execute(_SESSION_INSERT_SQL, params)
            ok += 1
        except Exception:
            params = (*params[:14], None, *params[15:])
            try:
                cur.execute(_SESSION_INSERT_SQL, params)
                ok += 1
            except Exception:
                skipped += 1
    return ok, skipped


def save_collector_run_mssql(result: dict, *, sessions_only: bool = False) -> dict:
    """정규화된 Collector 실행 결과를 MSSQL 운영 DB에 저장합니다."""
    normalized = normalize_collector_run(result)
    run = dict(normalized["collectionRun"])
    if sessions_only:
        run["metricsCount"] = 0
        run["locksCount"] = 0
        run["sqlCount"] = 0

    with mssql_connection() as conn:
        conn.autocommit(False)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO dbo.collection_run (
                        id, tenant_id, db_instance_id, started_at, finished_at, status,
                        error_message, metrics_count, sessions_count, locks_count, sql_count
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        run["id"],
                        run["tenantId"],
                        run["dbInstanceId"],
                        run["startedAt"],
                        run["finishedAt"],
                        run["status"],
                        run.get("errorMessage"),
                        run["metricsCount"],
                        run["sessionsCount"],
                        run["locksCount"],
                        run["sqlCount"],
                    ),
                )

                if not sessions_only:
                    metric_rows = [
                        (
                            m["id"],
                            m["tenantId"],
                            m["dbInstanceId"],
                            m["metricTime"],
                            m["metricName"],
                            m["metricValue"],
                            m.get("unit"),
                            json.dumps(m.get("tags") or {}, ensure_ascii=False),
                        )
                        for m in normalized["metricHistory"]
                    ]
                    _execute_many(
                        cur,
                        """
                        INSERT INTO dbo.metric_history (
                            id, tenant_id, db_instance_id, metric_time, metric_name,
                            metric_value, unit, tags
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        metric_rows,
                    )

                _insert_session_rows(cur, normalized["sessionSnapshots"])

                if not sessions_only:
                    blocking_rows = [
                        (
                            b["id"],
                            b["tenantId"],
                            b["dbInstanceId"],
                            b["snapshotTime"],
                            b["blockerSessionId"],
                            b["blockedSessionId"],
                            b["lockType"],
                            b["waitMs"],
                            b.get("objectName"),
                        )
                        for b in normalized["blockingSnapshots"]
                    ]
                    _execute_many(
                        cur,
                        """
                        INSERT INTO dbo.blocking_snapshot (
                            id, tenant_id, db_instance_id, snapshot_time,
                            blocker_session_id, blocked_session_id, lock_type, wait_ms, object_name
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        blocking_rows,
                    )

                    sql_rows = [
                        (
                            sql["id"],
                            sql["tenantId"],
                            sql["dbInstanceId"],
                            sql["metricTime"],
                            sql["sqlId"],
                            sql["sqlTextMasked"],
                            sql["executions"],
                            sql["avgElapsedMs"],
                            sql["totalCpuMs"],
                            sql.get("totalLogicalReads"),
                            sql.get("lastExecutionTime"),
                        )
                        for sql in normalized["sqlPerformance"]
                    ]
                    _execute_many(
                        cur,
                        """
                        INSERT INTO dbo.sql_performance (
                            id, tenant_id, db_instance_id, metric_time, sql_id, sql_text_masked,
                            executions, avg_elapsed_ms, total_cpu_ms, total_logical_reads,
                            last_execution_time
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        sql_rows,
                    )

                    plan_rows = [
                        (
                            p["id"],
                            p["tenantId"],
                            p["dbInstanceId"],
                            p["capturedAt"],
                            p["sqlId"],
                            p["planHash"],
                            _truncate_plan_text(p.get("planText")),
                            p["avgElapsedMs"],
                            p["totalCpuMs"],
                            p.get("totalLogicalReads"),
                            p["executions"],
                        )
                        for p in normalized["sqlPlanSnapshots"]
                    ]
                    if plan_rows:
                        try:
                            _execute_many(
                                cur,
                                """
                                INSERT INTO dbo.sql_plan_snapshot (
                                    id, tenant_id, db_instance_id, captured_at, sql_id, plan_hash,
                                    plan_text, avg_elapsed_ms, total_cpu_ms, total_logical_reads,
                                    executions
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                                """,
                                plan_rows,
                            )
                        except Exception:
                            pass

                    deadlock_rows = [
                        (
                            d["id"],
                            d["tenantId"],
                            d["dbInstanceId"],
                            d["occurredAt"],
                            d["victimSessionId"],
                            d["graphXml"],
                        )
                        for d in normalized["deadlocks"]
                    ]
                    _execute_many(
                        cur,
                        """
                        INSERT INTO dbo.deadlock_event (
                            id, tenant_id, db_instance_id, occurred_at, victim_session_id, graph_xml
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        deadlock_rows,
                    )

            conn.commit()
        except Exception:
            conn.rollback()
            raise

    return run


def save_sql_regression_events_mssql(events: list[dict]) -> int:
    """탐지된 SQL 회귀 이벤트를 MSSQL에 저장합니다."""
    if not events:
        return 0
    rows = [
        (
            e["id"],
            e["tenantId"],
            e["dbInstanceId"],
            e["detectedAt"],
            e["sqlId"],
            e["metricKey"],
            e["baselineValue"],
            e["currentValue"],
            e["changePercent"],
            e["severity"],
            e["recommendation"],
            e.get("status") or "OPEN",
            json.dumps(e.get("issueCandidate") or {}, ensure_ascii=False),
        )
        for e in events
    ]
    with mssql_connection() as conn:
        conn.autocommit(False)
        try:
            with conn.cursor() as cur:
                _execute_many(
                    cur,
                    """
                    INSERT INTO dbo.sql_regression_event (
                        id, tenant_id, db_instance_id, detected_at, sql_id, metric_key,
                        baseline_value, current_value, change_percent, severity,
                        recommendation, status, issue_candidate
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    rows,
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return len(rows)