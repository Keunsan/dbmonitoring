"""Supabase service-role 클라이언트입니다."""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from src.config.loader import get_settings
from src.config.storage_backend import resolve_supabase_url


@lru_cache
def get_supabase_client() -> Client | None:
    settings = get_settings()
    url = resolve_supabase_url()
    key = settings.supabase_service_role_key.strip()
    if not url or not key:
        return None
    return create_client(url, key)