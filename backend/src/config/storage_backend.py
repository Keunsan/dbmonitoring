"""운영 DB 백엔드 선택 (AS-IS MSSQL 우선 → Supabase → 메모리)."""

from __future__ import annotations

from src.config.loader import get_settings

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def resolve_supabase_url() -> str:
    settings = get_settings()
    return (settings.supabase_url or settings.next_public_supabase_url or "").strip()


def is_mssql_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.mssql_host.strip()
        and settings.mssql_database.strip()
        and settings.mssql_user.strip()
        and settings.mssql_password.strip()
    )


def is_supabase_configured() -> bool:
    settings = get_settings()
    return bool(resolve_supabase_url() and settings.supabase_service_role_key.strip())


def use_mssql_backend() -> bool:
    return is_mssql_configured()


def use_supabase_backend() -> bool:
    return not use_mssql_backend() and is_supabase_configured()