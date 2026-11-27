"""환경 변수 기반 연결 비밀 해석 (AS-IS env provider)."""

from __future__ import annotations

import os
import re

from app.services.secrets.refs import parse_connection_secret_ref_kind
from app.services.secrets.vault_store import fetch_connection_secret
from src.config.loader import get_settings
from src.errors.api_route import ApiRouteError

_ENV_REF = re.compile(r"^env:(?P<key>[A-Z0-9_]+)$", re.IGNORECASE)


def resolve_connection_for_instance(instance: dict) -> dict:
    """인스턴스 메타데이터와 Secret credential을 합쳐 pymssql 연결 인자를 만듭니다."""
    settings = get_settings()
    ref = (instance.get("connectionSecretRef") or "").strip()
    config = resolve_connection_config(ref) if ref else resolve_connection_config("")
    host = (config.get("server") or instance.get("host") or "").strip()
    database = (
        config.get("database")
        or instance.get("databaseName")
        or settings.mssql_database
    )
    port = int(config.get("port") or instance.get("port") or 1433)
    user = config.get("user") or ""
    password = config.get("password") or ""
    if not host or not user:
        raise ApiRouteError(
            code="SECRET_NOT_CONFIGURED",
            message="DB 연결 정보가 불완전합니다. 호스트와 인증 정보를 확인해 주세요.",
            status=503,
        )
    return {
        "server": host,
        "port": port,
        "database": database or None,
        "user": user,
        "password": password,
    }


def resolve_connection_config(secret_ref: str) -> dict:
    """connectionSecretRef → pymssql 연결 인자."""
    settings = get_settings()
    if secret_ref and secret_ref.strip().startswith("vault:"):
        parsed = parse_connection_secret_ref_kind(secret_ref)
        credential = fetch_connection_secret(parsed["vaultName"])
        host = credential.get("connectString") or credential.get("host") or ""
        return {
            "server": host,
            "port": int(credential.get("port") or 1433),
            "database": credential.get("database"),
            "user": credential.get("username") or "",
            "password": credential.get("password") or "",
        }

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