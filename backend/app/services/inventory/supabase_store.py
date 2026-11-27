"""Supabase 업무 시스템·DB 인스턴스 조회·변경입니다."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.integrations.supabase.client import get_supabase_client
from app.services.secrets.refs import build_vault_connection_secret_ref
from app.services.storage.mappers import to_business_system, to_db_instance
from src.config.storage_backend import DEFAULT_TENANT_ID
from src.errors.api_route import ApiRouteError


def _client():
    client = get_supabase_client()
    if not client:
        raise ApiRouteError(
            code="SUPABASE_NOT_CONFIGURED",
            message="Supabase 서버 연결 설정이 필요합니다.",
            status=503,
        )
    return client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


def list_business_systems_supabase() -> list[dict]:
    response = (
        _client()
        .table("business_system")
        .select("*")
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .order("created_at")
        .execute()
    )
    if response.data is None:
        return []
    return [to_business_system(row) for row in response.data]


def create_business_system_supabase(payload: dict) -> dict:
    client = _client()
    existing = (
        client.table("business_system")
        .select("id")
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .eq("code", payload["code"])
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message="이미 등록된 업무 코드입니다.",
            status=400,
        )
    record_id = _new_id()
    ts = _now()
    row: dict[str, Any] = {
        "id": record_id,
        "tenant_id": DEFAULT_TENANT_ID,
        "code": payload["code"],
        "name": payload["name"],
        "importance": payload["importance"],
        "owner_dept": payload.get("ownerDept"),
        "owner_name": payload.get("ownerName"),
        "owner_email": payload.get("ownerEmail"),
        "created_at": ts,
        "updated_at": ts,
    }
    inserted = client.table("business_system").insert(row).select("*").single().execute()
    if not inserted.data:
        raise ApiRouteError(
            code="SUPABASE_ERROR",
            message="업무 시스템을 저장하지 못했습니다.",
            status=500,
        )
    return to_business_system(inserted.data)


def update_business_system_supabase(record_id: str, payload: dict) -> dict:
    ts = _now()
    updated = (
        _client()
        .table("business_system")
        .update(
            {
                "name": payload["name"],
                "importance": payload["importance"],
                "owner_dept": payload.get("ownerDept"),
                "owner_name": payload.get("ownerName"),
                "owner_email": payload.get("ownerEmail"),
                "updated_at": ts,
            }
        )
        .eq("id", record_id)
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .select("*")
        .maybe_single()
        .execute()
    )
    if not updated.data:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="업무 시스템을 찾을 수 없습니다.",
            status=404,
        )
    return to_business_system(updated.data)


def delete_business_system_supabase(record_id: str) -> None:
    client = _client()
    instances = (
        client.table("db_instance")
        .select("id", count="exact")
        .eq("business_system_id", record_id)
        .execute()
    )
    if (instances.count or 0) > 0:
        raise ApiRouteError(
            code="BUSINESS_SYSTEM_IN_USE",
            message="DB 인스턴스가 연결된 업무 시스템은 삭제할 수 없습니다.",
            status=409,
        )
    deleted = (
        client.table("business_system")
        .delete()
        .eq("id", record_id)
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .execute()
    )
    if not deleted.data:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="업무 시스템을 찾을 수 없습니다.",
            status=404,
        )


def list_db_instances_supabase() -> list[dict]:
    response = (
        _client()
        .table("db_instance")
        .select("*")
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .order("created_at")
        .execute()
    )
    if response.data is None:
        return []
    return [to_db_instance(row) for row in response.data]


def get_db_instance_supabase(instance_id: str) -> dict | None:
    response = (
        _client()
        .table("db_instance")
        .select("*")
        .eq("id", instance_id)
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .maybe_single()
        .execute()
    )
    if not response.data:
        return None
    return to_db_instance(response.data)


def create_db_instance_supabase(payload: dict) -> dict:
    client = _client()
    bs = (
        client.table("business_system")
        .select("id")
        .eq("id", payload["businessSystemId"])
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .maybe_single()
        .execute()
    )
    if not bs.data:
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message="업무 시스템을 먼저 등록해주세요.",
            status=400,
        )
    record_id = _new_id()
    ts = _now()
    secret_ref = payload.get("connectionSecretRef") or build_vault_connection_secret_ref(record_id)
    row: dict[str, Any] = {
        "id": record_id,
        "tenant_id": DEFAULT_TENANT_ID,
        "dbms_type": payload["dbmsType"],
        "instance_name": payload["instanceName"],
        "host": payload["host"],
        "port": payload["port"],
        "service_name": payload.get("serviceName"),
        "database_name": payload.get("databaseName"),
        "business_system_id": payload["businessSystemId"],
        "importance": payload["importance"],
        "env_type": payload["envType"],
        "collector_type": payload["collectorType"],
        "collector_id": payload.get("collectorId"),
        "collect_interval_sec": payload["collectIntervalSec"],
        "sql_aggregate_interval_sec": payload["sqlAggregateIntervalSec"],
        "is_active": payload["isActive"],
        "connection_secret_ref": secret_ref,
        "last_collect_at": None,
        "last_collect_status": None,
        "last_connection_test_at": None,
        "last_connection_test_status": None,
        "created_at": ts,
        "updated_at": ts,
    }
    inserted = client.table("db_instance").insert(row).select("*").single().execute()
    if not inserted.data:
        raise ApiRouteError(
            code="SUPABASE_ERROR",
            message="DB 인스턴스를 저장하지 못했습니다.",
            status=500,
        )
    return to_db_instance(inserted.data)


def update_db_instance_supabase(instance_id: str, patch: dict) -> dict:
    ts = _now()
    update_row: dict[str, Any] = {"updated_at": ts}
    field_map = {
        "dbmsType": "dbms_type",
        "instanceName": "instance_name",
        "host": "host",
        "port": "port",
        "serviceName": "service_name",
        "databaseName": "database_name",
        "businessSystemId": "business_system_id",
        "importance": "importance",
        "envType": "env_type",
        "collectorType": "collector_type",
        "collectorId": "collector_id",
        "collectIntervalSec": "collect_interval_sec",
        "sqlAggregateIntervalSec": "sql_aggregate_interval_sec",
        "isActive": "is_active",
        "connectionSecretRef": "connection_secret_ref",
    }
    for key, column in field_map.items():
        if key in patch:
            update_row[column] = patch[key]

    updated = (
        _client()
        .table("db_instance")
        .update(update_row)
        .eq("id", instance_id)
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .select("*")
        .maybe_single()
        .execute()
    )
    if not updated.data:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )
    return to_db_instance(updated.data)


def delete_db_instance_supabase(instance_id: str) -> None:
    deleted = (
        _client()
        .table("db_instance")
        .delete()
        .eq("id", instance_id)
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .select("id")
        .maybe_single()
        .execute()
    )
    if not deleted.data:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )


def update_collection_settings_supabase(instance_id: str, settings: dict) -> dict:
    ts = _now()
    updated = (
        _client()
        .table("db_instance")
        .update(
            {
                "collector_id": settings.get("collectorId"),
                "collect_interval_sec": settings["collectIntervalSec"],
                "sql_aggregate_interval_sec": settings["sqlAggregateIntervalSec"],
                "is_active": settings["isActive"],
                "updated_at": ts,
            }
        )
        .eq("id", instance_id)
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .select("*")
        .maybe_single()
        .execute()
    )
    if not updated.data:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )
    row = updated.data
    return {
        "collectorId": row.get("collector_id"),
        "collectIntervalSec": row.get("collect_interval_sec"),
        "sqlAggregateIntervalSec": row.get("sql_aggregate_interval_sec"),
        "isActive": row.get("is_active"),
        "lastCollectAt": row.get("last_collect_at"),
        "lastCollectStatus": row.get("last_collect_status"),
    }


def update_db_instance_secret_ref_supabase(instance_id: str, secret_ref: str) -> dict:
    updated = (
        _client()
        .table("db_instance")
        .update({"connection_secret_ref": secret_ref, "updated_at": _now()})
        .eq("id", instance_id)
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .select("*")
        .maybe_single()
        .execute()
    )
    if not updated.data:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )
    return to_db_instance(updated.data)