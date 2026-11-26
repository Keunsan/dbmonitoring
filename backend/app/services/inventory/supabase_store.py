"""Supabase 업무 시스템·DB 인스턴스 조회입니다."""

from __future__ import annotations

from app.integrations.supabase.client import get_supabase_client
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