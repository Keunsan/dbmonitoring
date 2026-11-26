"""인벤토리 조회·변경 facade (MSSQL → Supabase → 메모리)."""

from __future__ import annotations

from app.services.inventory import memory_store, mssql_store, supabase_store
from src.config.storage_backend import use_mssql_backend, use_supabase_backend


def list_business_systems() -> list[dict]:
    if use_mssql_backend():
        return mssql_store.list_business_systems_mssql()
    if use_supabase_backend():
        return supabase_store.list_business_systems_supabase()
    return memory_store.list_business_systems_memory()


def list_db_instances() -> list[dict]:
    if use_mssql_backend():
        return mssql_store.list_db_instances_mssql()
    if use_supabase_backend():
        return supabase_store.list_db_instances_supabase()
    return memory_store.list_db_instances_memory()


def get_db_instance(instance_id: str) -> dict | None:
    if use_mssql_backend() or use_supabase_backend():
        return next((i for i in list_db_instances() if i["id"] == instance_id), None)
    return memory_store.get_db_instance_memory(instance_id)


def create_db_instance(payload: dict) -> dict:
    if use_mssql_backend() or use_supabase_backend():
        return memory_store.create_db_instance_memory(payload)
    return memory_store.create_db_instance_memory(payload)


def update_db_instance(instance_id: str, patch: dict) -> dict:
    return memory_store.update_db_instance_memory(instance_id, patch)


def delete_db_instance(instance_id: str) -> None:
    memory_store.delete_db_instance_memory(instance_id)


def update_collect_status(
    instance_id: str,
    *,
    status: str,
    error_message: str | None,
) -> dict:
    return memory_store.update_collect_status_memory(
        instance_id, status=status, error_message=error_message
    )