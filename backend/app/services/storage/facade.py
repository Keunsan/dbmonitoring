"""수집 데이터 조회·저장 facade입니다."""

from __future__ import annotations

from app.services.storage import memory_store, mssql_reads, mssql_writes, supabase_reads, supabase_writes
from src.config import storage_backend


def _reads():
    if storage_backend.use_mssql_backend():
        return mssql_reads
    if storage_backend.use_supabase_backend():
        return supabase_reads
    return memory_store


def list_metric_history(
    *,
    db_instance_id: str | None = None,
    metric_name: str | None = None,
    limit: int = 200,
) -> list[dict]:
    backend = _reads()
    if backend is mssql_reads:
        return mssql_reads.list_metric_history_mssql(
            db_instance_id=db_instance_id,
            metric_name=metric_name,
            limit=limit,
        )
    if backend is supabase_reads:
        return supabase_reads.list_metric_history_supabase(
            db_instance_id=db_instance_id,
            metric_name=metric_name,
            limit=limit,
        )
    return memory_store.list_metric_history_memory(
        db_instance_id=db_instance_id,
        metric_name=metric_name,
        limit=limit,
    )


def get_monitoring_summary(db_instance_id: str) -> dict:
    if storage_backend.use_mssql_backend():
        return mssql_reads.get_monitoring_summary_mssql(db_instance_id)
    if storage_backend.use_supabase_backend():
        return supabase_reads.get_monitoring_summary_supabase(db_instance_id)
    return memory_store.get_monitoring_summary_memory(db_instance_id)


def get_monitoring_summaries(
    db_instance_ids: list[str],
    *,
    include_latest_sql: bool = True,
) -> dict[str, dict]:
    """여러 인스턴스 모니터링 요약을 배치로 조회합니다."""
    if storage_backend.use_mssql_backend():
        return mssql_reads.get_monitoring_summaries_mssql(
            db_instance_ids,
            include_latest_sql=include_latest_sql,
        )
    return {
        instance_id: get_monitoring_summary(instance_id) for instance_id in db_instance_ids
    }


def list_collection_runs(db_instance_id: str | None = None) -> list[dict]:
    if storage_backend.use_mssql_backend():
        return mssql_reads.list_collection_runs_mssql(db_instance_id)
    return memory_store.list_collection_runs_memory(db_instance_id)


def list_session_snapshots(db_instance_id: str | None = None, limit: int = 200) -> list[dict]:
    if storage_backend.use_mssql_backend():
        return mssql_reads.list_session_snapshots_mssql(db_instance_id, limit)
    return memory_store.list_session_snapshots_memory(db_instance_id, limit)


def list_sql_performance(
    db_instance_id: str | None = None,
    limit: int = 100,
    sql_id: str | None = None,
) -> list[dict]:
    if storage_backend.use_mssql_backend():
        return mssql_reads.list_sql_performance_mssql(db_instance_id, limit, sql_id)
    return memory_store.list_sql_performance_memory(db_instance_id, limit, sql_id)


def list_sql_plan_snapshots(
    *,
    db_instance_id: str,
    sql_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    if storage_backend.use_mssql_backend():
        return mssql_reads.list_sql_plan_snapshots_mssql(
            db_instance_id=db_instance_id,
            sql_id=sql_id,
            limit=limit,
        )
    return memory_store.list_sql_plan_snapshots_memory(
        db_instance_id=db_instance_id,
        sql_id=sql_id,
        limit=limit,
    )


def list_sql_regression_events(
    db_instance_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    if storage_backend.use_mssql_backend():
        return mssql_reads.list_sql_regression_events_mssql(db_instance_id, limit)
    return memory_store.list_sql_regression_events_memory(db_instance_id, limit)


def list_blocking_snapshots(db_instance_id: str | None = None, limit: int = 100) -> list[dict]:
    if storage_backend.use_mssql_backend():
        return mssql_reads.list_blocking_snapshots_mssql(db_instance_id, limit)
    return memory_store.list_blocking_snapshots_memory(db_instance_id, limit)


def list_deadlock_events(db_instance_id: str | None = None, limit: int = 100) -> list[dict]:
    if storage_backend.use_mssql_backend():
        return mssql_reads.list_deadlock_events_mssql(db_instance_id, limit)
    return memory_store.list_deadlock_events_memory(db_instance_id, limit)


def append_sql_regression_events(events: list[dict]) -> int:
    if storage_backend.use_mssql_backend():
        return mssql_writes.save_sql_regression_events_mssql(events)
    return memory_store.append_sql_regression_events_memory(events)


def save_collector_run(result: dict, *, sessions_only: bool = False) -> dict:
    if storage_backend.use_mssql_backend():
        return mssql_writes.save_collector_run_mssql(result, sessions_only=sessions_only)
    if storage_backend.use_supabase_backend():
        return supabase_writes.save_collector_run_supabase(result, sessions_only=sessions_only)
    return memory_store.save_collector_run_memory(result, sessions_only=sessions_only)