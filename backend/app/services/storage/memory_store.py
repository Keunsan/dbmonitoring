"""개발용 인메모리 수집 데이터 저장소입니다."""

from __future__ import annotations

from app.services.monitoring.metric_snapshot import pick_fullest_metric_snapshot
from app.services.monitoring.resource_summary import build_resource_summary
from app.services.storage.empty_summary import create_empty_monitoring_summary
from app.services.storage.normalize import normalize_collector_run

_MAX_RECORDS = 5000

_STATE: dict[str, list] | None = None


def _buckets() -> dict[str, list]:
    global _STATE
    if _STATE is None:
        _STATE = {
            "collectionRuns": [],
            "metricHistory": [],
            "sessionSnapshots": [],
            "blockingSnapshots": [],
            "sqlPerformance": [],
            "sqlPlanSnapshots": [],
            "sqlRegressionEvents": [],
            "deadlocks": [],
        }
    return _STATE


def _trim(items: list) -> list:
    return items[-_MAX_RECORDS:]


def save_collector_run_memory(result: dict, *, sessions_only: bool = False) -> dict:
    normalized = normalize_collector_run(result)
    state = _buckets()
    state["collectionRuns"] = _trim([*state["collectionRuns"], normalized["collectionRun"]])
    state["sessionSnapshots"] = _trim(
        [*state["sessionSnapshots"], *normalized["sessionSnapshots"]]
    )
    if not sessions_only:
        state["metricHistory"] = _trim([*state["metricHistory"], *normalized["metricHistory"]])
        state["blockingSnapshots"] = _trim(
            [*state["blockingSnapshots"], *normalized["blockingSnapshots"]]
        )
        state["sqlPerformance"] = _trim(
            [*state["sqlPerformance"], *normalized["sqlPerformance"]]
        )
        state["sqlPlanSnapshots"] = _trim(
            [*state["sqlPlanSnapshots"], *normalized["sqlPlanSnapshots"]]
        )
        state["deadlocks"] = _trim([*state["deadlocks"], *normalized["deadlocks"]])
    return normalized["collectionRun"]


def list_collection_runs_memory(db_instance_id: str | None = None) -> list[dict]:
    runs = _buckets()["collectionRuns"]
    filtered = [r for r in runs if not db_instance_id or r["dbInstanceId"] == db_instance_id]
    return list(reversed(filtered))


def list_metric_history_memory(
    *,
    db_instance_id: str | None = None,
    metric_name: str | None = None,
    limit: int = 200,
) -> list[dict]:
    items = _buckets()["metricHistory"]
    filtered = [
        m
        for m in items
        if (not db_instance_id or m["dbInstanceId"] == db_instance_id)
        and (not metric_name or m["metricName"] == metric_name)
    ]
    filtered.sort(key=lambda m: m["metricTime"])
    return filtered[-limit:]


def list_session_snapshots_memory(
    db_instance_id: str | None = None,
    limit: int = 200,
) -> list[dict]:
    filtered = [
        s
        for s in _buckets()["sessionSnapshots"]
        if not db_instance_id or s["dbInstanceId"] == db_instance_id
    ]
    return list(reversed(filtered[-limit:]))


def list_sql_performance_memory(
    db_instance_id: str | None = None,
    limit: int = 100,
    sql_id: str | None = None,
) -> list[dict]:
    filtered = [
        s
        for s in _buckets()["sqlPerformance"]
        if (not db_instance_id or s["dbInstanceId"] == db_instance_id)
        and (not sql_id or s["sqlId"] == sql_id)
    ]
    return list(reversed(filtered[-limit:]))


def list_sql_plan_snapshots_memory(
    *,
    db_instance_id: str,
    sql_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    filtered = [
        p
        for p in _buckets()["sqlPlanSnapshots"]
        if p["dbInstanceId"] == db_instance_id and (not sql_id or p["sqlId"] == sql_id)
    ]
    return list(reversed(filtered[-limit:]))


def list_sql_regression_events_memory(
    db_instance_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    filtered = [
        e
        for e in _buckets()["sqlRegressionEvents"]
        if not db_instance_id or e["dbInstanceId"] == db_instance_id
    ]
    return list(reversed(filtered[-limit:]))


def list_blocking_snapshots_memory(
    db_instance_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    filtered = [
        b
        for b in _buckets()["blockingSnapshots"]
        if not db_instance_id or b["dbInstanceId"] == db_instance_id
    ]
    return list(reversed(filtered[-limit:]))


def list_deadlock_events_memory(
    db_instance_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    filtered = [
        d
        for d in _buckets()["deadlocks"]
        if not db_instance_id or d["dbInstanceId"] == db_instance_id
    ]
    return list(reversed(filtered[-limit:]))


def get_monitoring_summary_memory(db_instance_id: str) -> dict:
    metrics = pick_fullest_metric_snapshot(
        list_metric_history_memory(db_instance_id=db_instance_id, limit=200)
    )
    if not metrics:
        return create_empty_monitoring_summary(db_instance_id)

    latest_run = (list_collection_runs_memory(db_instance_id) or [None])[0]
    sessions = list_session_snapshots_memory(db_instance_id, 50)
    return {
        "dbInstanceId": db_instance_id,
        "lastRun": latest_run,
        "latestMetrics": metrics,
        "resourceSummary": build_resource_summary(metrics),
        "latestSessions": sessions[:20],
        "latestSql": list_sql_performance_memory(db_instance_id, 10),
        "blockingCount": len(list_blocking_snapshots_memory(db_instance_id, 1000)),
        "deadlockCount": len(list_deadlock_events_memory(db_instance_id, 1000)),
    }