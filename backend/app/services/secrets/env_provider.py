"""환경 변수 기반 연결 비밀 해석 (AS-IS env provider)."""

from __future__ import annotations

import os
import re

from src.config.loader import get_settings
from src.errors.api_route import ApiRouteError

_ENV_REF = re.compile(r"^env:(?P<key>[A-Z0-9_]+)$", re.IGNORECASE)


def resolve_connection_config(secret_ref: str) -> dict:
    """connectionSecretRef → pymssql 연결 인자."""
    settings = get_settings()
    match = _ENV_REF.match(secret_ref.strip()) if secret_ref else None
    if match:
        prefix = match.group("key")
        host = os.getenv(f"{prefix}_HOST", "")
        port = int(os.getenv(f"{prefix}_PORT", "1433"))
        database = os.getenv(f"{prefix}_DATABASE", "")
        user = os.getenv(f"{prefix}_USER", "")
        password = os.getenv(f"{prefix}_PASSWORD", "")
        if host and database and user:
            return {
                "server": host,
                "port": port,
                "database": database,
                "user": user,
                "password": password,
            }

    if settings.mssql_host and settings.mssql_database:
        return {
            "server": settings.mssql_host,
            "port": settings.mssql_port,
            "database": settings.mssql_database,
            "user": settings.mssql_user,
            "password": settings.mssql_password,
        }

    raise ApiRouteError(
        code="SECRET_NOT_CONFIGURED",
        message="DB 연결 비밀 참조를 해석할 수 없습니다. env: 접두사 또는 MSSQL_* 환경 변수를 확인해 주세요.",
        status=503,
    )