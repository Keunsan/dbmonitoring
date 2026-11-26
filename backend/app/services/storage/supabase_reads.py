"""Supabase 모니터링 조회입니다."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.integrations.supabase.client import get_supabase_client
from app.services.monitoring.metric_snapshot import pick_fullest_metric_snapshot
from app.services.monitoring.resource_summary import build_resource_summary
from app.services.storage.mappers import (
    to_collection_run,
    to_metric_history,
    to_session_snapshot,
    to_sql_performance,
)
from src.errors.api_route import ApiRouteError

_SUMMARY_METRIC_LIMIT = 200
_SUMMARY_METRIC_LOOKBACK = timedelta(hours=2)


def _client():
    client = get_supabase_client()
    if not client:
        raise ApiRouteError(
            code="SUPABASE_NOT_CONFIGURED",
            message="Supabase 서버 연결 설정이 필요합니다.",
            status=503,
        )
    return client


def list_metric_history_supabase(
    *,
    db_instance_id: str | None = None,
    metric_name: str | None = None,
    limit: int = 200,
    metric_time_gte: str | None = None,
) -> list[dict]:
    query = (
        _client()
        .table("metric_history")
        .select("*")
        .order("metric_time", desc=True)
        .limit(limit)
    )
    if db_instance_id:
        query = query.eq("db_instance_id", db_instance_id)
    if metric_name:
        query = query.eq("metric_name", metric_name)
    if metric_time_gte:
        query = query.gte("metric_time", metric_time_gte)

    response = query.execute()
    rows = response.data or []
    return [to_metric_history(row) for row in rows]


def _list_collection_runs(db_instance_id: str) -> list[dict]:
    response = (
        _client()
        .table("collection_run")
        .select("*")
        .eq("db_instance_id", db_instance_id)
        .order("finished_at", desc=True)
        .limit(100)
        .execute()
    )
    rows = response.data or []
    return [to_collection_run(row) for row in rows]


def _list_sql_performance(db_instance_id: str, limit: int = 10) -> list[dict]:
    response = (
        _client()
        .table("sql_performance")
        .select("*")
        .eq("db_instance_id", db_instance_id)
        .order("metric_time", desc=True)
        .limit(limit)
        .execute()
    )
    rows = response.data or []
    return [to_sql_performance(row) for row in rows]


def get_monitoring_summary_supabase(db_instance_id: str) -> dict:
    latest_run = (_list_collection_runs(db_instance_id) or [None])[0]
    lookback = (datetime.now(timezone.utc) - _SUMMARY_METRIC_LOOKBACK).isoformat()
    recent_metrics = list_metric_history_supabase(
        db_instance_id=db_instance_id,
        limit=_SUMMARY_METRIC_LIMIT,
        metric_time_gte=lookback,
    )
    latest_metrics = pick_fullest_metric_snapshot(recent_metrics)

    session_response = (
        _client()
        .table("session_snapshot")
        .select("snapshot_time")
        .eq("db_instance_id", db_instance_id)
        .order("snapshot_time", desc=True)
        .limit(1)
        .execute()
    )
    latest_session_time = None
    if session_response.data:
        latest_session_time = session_response.data[0].get("snapshot_time")

    latest_sessions: list[dict] = []
    if latest_session_time:
        sessions_response = (
            _client()
            .table("session_snapshot")
            .select("*")
            .eq("db_instance_id", db_instance_id)
            .eq("snapshot_time", latest_session_time)
            .execute()
        )
        latest_sessions = [to_session_snapshot(row) for row in sessions_response.data or []]

    blocking_count = (
        _client()
        .table("blocking_snapshot")
        .select("id", count="exact")
        .eq("db_instance_id", db_instance_id)
        .execute()
    ).count or 0

    deadlock_count = (
        _client()
        .table("deadlock_event")
        .select("id", count="exact")
        .eq("db_instance_id", db_instance_id)
        .execute()
    ).count or 0

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