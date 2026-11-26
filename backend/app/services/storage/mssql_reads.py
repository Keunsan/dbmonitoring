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


def get_monitoring_summary_mssql(db_instance_id: str) -> dict:
    latest_run = (_list_collection_runs(db_instance_id) or [None])[0]
    lookback = (datetime.now(timezone.utc) - _SUMMARY_METRIC_LOOKBACK).isoformat()
    recent_metrics = list_metric_history_mssql(
        db_instance_id=db_instance_id,
        limit=_SUMMARY_METRIC_LIMIT,
        metric_time_gte=lookback,
    )
    latest_metrics = pick_fullest_metric_snapshot(recent_metrics)

    latest_session_time = None
    latest_sessions: list[dict] = []

    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT TOP 1 snapshot_time
                FROM dbo.session_snapshot
                WHERE db_instance_id = %s
                ORDER BY snapshot_time DESC
                """,
                (db_instance_id,),
            )
            row = cur.fetchone()
            if row and row.get("snapshot_time") is not None:
                latest_session_time = str(row["snapshot_time"])

            if latest_session_time:
                cur.execute(
                    """
                    SELECT *
                    FROM dbo.session_snapshot
                    WHERE db_instance_id = %s AND snapshot_time = %s
                    """,
                    (db_instance_id, latest_session_time),
                )
                latest_sessions = [to_session_snapshot(r) for r in cur.fetchall()]

            cur.execute(
                """
                SELECT COUNT(1) AS count
                FROM dbo.blocking_snapshot
                WHERE db_instance_id = %s
                """,
                (db_instance_id,),
            )
            blocking_count = int((cur.fetchone() or {}).get("count") or 0)

            cur.execute(
                """
                SELECT COUNT(1) AS count
                FROM dbo.deadlock_event
                WHERE db_instance_id = %s
                """,
                (db_instance_id,),
            )
            deadlock_count = int((cur.fetchone() or {}).get("count") or 0)

    return {
        "dbInstanceId": db_instance_id,
        "lastRun": latest_run,
        "latestMetrics": latest_metrics,
        "resourceSummary": build_resource_summary(latest_metrics),
        "latestSessions": latest_sessions,
        "latestSql": _list_sql_performance(db_instance_id, 10),
        "blockingCount": blocking_count,
        "deadlockCount": deadlock_count,
    }


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