"""MSSQL 모니터링 조회입니다."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.integrations.mssql.pool import mssql_connection
from app.services.monitoring.metric_snapshot import pick_fullest_metric_snapshot
from app.services.monitoring.resource_summary import build_resource_summary
from app.services.storage.mappers import (
    to_blocking_snapshot,
    to_collection_run,
    to_deadlock,
    to_metric_history,
    to_session_snapshot,
    to_sql_performance,
    to_sql_plan_snapshot,
    to_sql_regression,
)

_SUMMARY_METRIC_LIMIT = 200
_SUMMARY_METRIC_LOOKBACK = timedelta(hours=2)
_SUMMARY_SQL_LIMIT = 10


def _in_clause_sql(column: str, ids: list[str]) -> tuple[str, tuple]:
    if not ids:
        return "1=0", ()
    placeholders = ",".join(["%s"] * len(ids))
    return f"{column} IN ({placeholders})", tuple(ids)


def _assemble_summary(
    db_instance_id: str,
    *,
    latest_run: dict | None,
    latest_metrics: list[dict],
    latest_sessions: list[dict],
    latest_sql: list[dict],
    blocking_count: int,
    deadlock_count: int,
) -> dict:
    return {
        "dbInstanceId": db_instance_id,
        "lastRun": latest_run,
        "latestMetrics": latest_metrics,
        "resourceSummary": build_resource_summary(latest_metrics),
        "latestSessions": latest_sessions,
        "latestSql": latest_sql,
        "blockingCount": blocking_count,
        "deadlockCount": deadlock_count,
    }


def list_metric_history_mssql(
    *,
    db_instance_id: str | None = None,
    metric_name: str | None = None,
    limit: int = 200,
    metric_time_gte: str | None = None,
) -> list[dict]:
    safe_limit = max(1, min(limit, 1000))
    conditions: list[str] = []
    params: list = []

    if db_instance_id:
        conditions.append("db_instance_id = %s")
        params.append(db_instance_id)
    if metric_name:
        conditions.append("metric_name = %s")
        params.append(metric_name)
    if metric_time_gte:
        conditions.append("metric_time >= %s")
        params.append(metric_time_gte)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT TOP ({safe_limit}) *
        FROM dbo.metric_history
        {where_clause}
        ORDER BY metric_time DESC
    """

    with mssql_connection() as conn:
        with conn.cursor() as cur:
            if params:
                cur.execute(sql, tuple(params))
            else:
                cur.execute(sql)
            rows = cur.fetchall()

    return [to_metric_history(row) for row in rows]


def _list_collection_runs(db_instance_id: str) -> list[dict]:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT TOP 100 *
                FROM dbo.collection_run
                WHERE db_instance_id = %s
                ORDER BY finished_at DESC
                """,
                (db_instance_id,),
            )
            rows = cur.fetchall()
    return [to_collection_run(row) for row in rows]


def _list_sql_performance(db_instance_id: str, limit: int = 10) -> list[dict]:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT TOP (%s) *
                FROM dbo.sql_performance
                WHERE db_instance_id = %s
                ORDER BY metric_time DESC
                """,
                (limit, db_instance_id),
            )
            rows = cur.fetchall()
    return [to_sql_performance(row) for row in rows]


def get_monitoring_summaries_mssql(
    db_instance_ids: list[str],
    *,
    include_latest_sql: bool = True,
) -> dict[str, dict]:
    """여러 인스턴스 요약을 단일 연결·배치 쿼리로 조회합니다."""
    unique_ids = list(dict.fromkeys(i for i in db_instance_ids if i))
    if not unique_ids:
        return {}

    lookback = (datetime.now(timezone.utc) - _SUMMARY_METRIC_LOOKBACK).isoformat()
    in_clause, in_params = _in_clause_sql("db_instance_id", unique_ids)

    runs_by_id: dict[str, dict | None] = {i: None for i in unique_ids}
    metrics_by_id: dict[str, list[dict]] = {i: [] for i in unique_ids}
    sessions_by_id: dict[str, list[dict]] = {i: [] for i in unique_ids}
    sql_by_id: dict[str, list[dict]] = {i: [] for i in unique_ids}
    blocking_by_id: dict[str, int] = {i: 0 for i in unique_ids}
    deadlock_by_id: dict[str, int] = {i: 0 for i in unique_ids}

    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                WITH ranked AS (
                    SELECT *,
                           ROW_NUMBER() OVER (
                               PARTITION BY db_instance_id
                               ORDER BY finished_at DESC
                           ) AS rn
                    FROM dbo.collection_run
                    WHERE {in_clause}
                )
                SELECT *
                FROM ranked
                WHERE rn = 1
                """,
                in_params,
            )
            for row in cur.fetchall() or []:
                inst_id = str(row.get("db_instance_id") or "")
                if inst_id in runs_by_id:
                    runs_by_id[inst_id] = to_collection_run(row)

            cur.execute(
                f"""
                SELECT *
                FROM dbo.metric_history
                WHERE {in_clause} AND metric_time >= %s
                ORDER BY metric_time DESC
                """,
                (*in_params, lookback),
            )
            metric_rows = [to_metric_history(r) for r in cur.fetchall() or []]
            for inst_id in unique_ids:
                inst_metrics = [m for m in metric_rows if m.get("dbInstanceId") == inst_id]
                metrics_by_id[inst_id] = pick_fullest_metric_snapshot(
                    inst_metrics[:_SUMMARY_METRIC_LIMIT]
                )

            in_clause_session, in_params_session = _in_clause_sql("s.db_instance_id", unique_ids)
            cur.execute(
                f"""
                WITH latest AS (
                    SELECT db_instance_id, MAX(snapshot_time) AS snapshot_time
                    FROM dbo.session_snapshot
                    WHERE {in_clause}
                    GROUP BY db_instance_id
                )
                SELECT s.*
                FROM dbo.session_snapshot s
                INNER JOIN latest l
                    ON s.db_instance_id = l.db_instance_id
                   AND s.snapshot_time = l.snapshot_time
                WHERE {in_clause_session}
                """,
                (*in_params, *in_params_session),
            )
            for row in cur.fetchall() or []:
                inst_id = str(row.get("db_instance_id") or "")
                if inst_id in sessions_by_id:
                    sessions_by_id[inst_id].append(to_session_snapshot(row))

            cur.execute(
                f"""
                SELECT db_instance_id, COUNT(1) AS count
                FROM dbo.blocking_snapshot
                WHERE {in_clause}
                GROUP BY db_instance_id
                """,
                in_params,
            )
            for row in cur.fetchall() or []:
                inst_id = str(row.get("db_instance_id") or "")
                if inst_id in blocking_by_id:
                    blocking_by_id[inst_id] = int(row.get("count") or 0)

            cur.execute(
                f"""
                SELECT db_instance_id, COUNT(1) AS count
                FROM dbo.deadlock_event
                WHERE {in_clause}
                GROUP BY db_instance_id
                """,
                in_params,
            )
            for row in cur.fetchall() or []:
                inst_id = str(row.get("db_instance_id") or "")
                if inst_id in deadlock_by_id:
                    deadlock_by_id[inst_id] = int(row.get("count") or 0)

            if include_latest_sql:
                cur.execute(
                    f"""
                    WITH ranked AS (
                        SELECT *,
                               ROW_NUMBER() OVER (
                                   PARTITION BY db_instance_id
                                   ORDER BY metric_time DESC
                               ) AS rn
                        FROM dbo.sql_performance
                        WHERE {in_clause}
                    )
                    SELECT *
                    FROM ranked
                    WHERE rn <= {_SUMMARY_SQL_LIMIT}
                    """,
                    in_params,
                )
                for row in cur.fetchall() or []:
                    inst_id = str(row.get("db_instance_id") or "")
                    if inst_id in sql_by_id:
                        sql_by_id[inst_id].append(to_sql_performance(row))

    return {
        inst_id: _assemble_summary(
            inst_id,
            latest_run=runs_by_id[inst_id],
            latest_metrics=metrics_by_id[inst_id],
            latest_sessions=sessions_by_id[inst_id],
            latest_sql=sql_by_id[inst_id],
            blocking_count=blocking_by_id[inst_id],
            deadlock_count=deadlock_by_id[inst_id],
        )
        for inst_id in unique_ids
    }


def get_monitoring_summary_mssql(db_instance_id: str) -> dict:
    return get_monitoring_summaries_mssql([db_instance_id])[db_instance_id]


def _list_query(
    table: str,
    *,
    db_instance_id: str | None,
    limit: int,
    order_col: str,
    mapper,
) -> list[dict]:
    safe_limit = max(1, min(limit, 1000))
    conditions: list[str] = []
    params: list = []
    if db_instance_id:
        conditions.append("db_instance_id = %s")
        params.append(db_instance_id)
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT TOP ({safe_limit}) *
        FROM dbo.{table}
        {where_clause}
        ORDER BY {order_col} DESC
    """
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            if params:
                cur.execute(sql, tuple(params))
            else:
                cur.execute(sql)
            rows = cur.fetchall()
    return [mapper(row) for row in rows]


def list_collection_runs_mssql(db_instance_id: str | None = None) -> list[dict]:
    return _list_query(
        "collection_run",
        db_instance_id=db_instance_id,
        limit=100,
        order_col="finished_at",
        mapper=to_collection_run,
    )


def list_session_snapshots_mssql(
    db_instance_id: str | None = None,
    limit: int = 200,
) -> list[dict]:
    return _list_query(
        "session_snapshot",
        db_instance_id=db_instance_id,
        limit=limit,
        order_col="snapshot_time",
        mapper=to_session_snapshot,
    )


def list_sql_performance_mssql(
    db_instance_id: str | None = None,
    limit: int = 100,
    sql_id: str | None = None,
) -> list[dict]:
    safe_limit = max(1, min(limit, 1000))
    conditions: list[str] = []
    params: list = []
    if db_instance_id:
        conditions.append("db_instance_id = %s")
        params.append(db_instance_id)
    if sql_id:
        conditions.append("sql_id = %s")
        params.append(sql_id)
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT TOP ({safe_limit}) *
        FROM dbo.sql_performance
        {where_clause}
        ORDER BY metric_time DESC
    """
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params) if params else None)
            rows = cur.fetchall()
    return [to_sql_performance(row) for row in rows]


def list_sql_plan_snapshots_mssql(
    *,
    db_instance_id: str,
    sql_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    safe_limit = max(1, min(limit, 200))
    conditions = ["db_instance_id = %s"]
    params: list = [db_instance_id]
    if sql_id:
        conditions.append("sql_id = %s")
        params.append(sql_id)
    sql = f"""
        SELECT TOP ({safe_limit}) *
        FROM dbo.sql_plan_snapshot
        WHERE {' AND '.join(conditions)}
        ORDER BY captured_at DESC
    """
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()
    return [to_sql_plan_snapshot(row) for row in rows]


def list_sql_regression_events_mssql(
    db_instance_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    return _list_query(
        "sql_regression_event",
        db_instance_id=db_instance_id,
        limit=limit,
        order_col="detected_at",
        mapper=to_sql_regression,
    )


def list_blocking_snapshots_mssql(
    db_instance_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    return _list_query(
        "blocking_snapshot",
        db_instance_id=db_instance_id,
        limit=limit,
        order_col="snapshot_time",
        mapper=to_blocking_snapshot,
    )


def list_deadlock_events_mssql(
    db_instance_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    return _list_query(
        "deadlock_event",
        db_instance_id=db_instance_id,
        limit=limit,
        order_col="occurred_at",
        mapper=to_deadlock,
    )