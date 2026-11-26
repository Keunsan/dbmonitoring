"""MSSQL 운영 DB 연결 (AS-IS lib/db/mssql-server 동등)."""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import pymssql

from src.config.loader import get_settings
from src.errors.api_route import ApiRouteError


def _apply_corp_ca() -> None:
    settings = get_settings()
    cert_path = (settings.mssql_ca_cert_path or "").strip()
    if not cert_path:
        repo_default = Path(__file__).resolve().parents[4] / "certs" / "corp-ca.pem"
        if repo_default.is_file():
            cert_path = str(repo_default)
    if cert_path and Path(cert_path).is_file():
        os.environ.setdefault("SSL_CERT_FILE", cert_path)


def _connect_kwargs() -> dict[str, Any]:
    _apply_corp_ca()
    settings = get_settings()
    return {
        "server": settings.mssql_host,
        "port": settings.mssql_port,
        "user": settings.mssql_user,
        "password": settings.mssql_password,
        "database": settings.mssql_database,
        "login_timeout": 15,
        "timeout": 60,
        "as_dict": True,
    }


@contextmanager
def mssql_connection(**overrides: Any) -> Iterator[Any]:
    """운영 DB에 단일 연결을 열고 닫습니다."""
    kwargs = {**_connect_kwargs(), **{k: v for k, v in overrides.items() if v is not None}}
    try:
        conn = pymssql.connect(**kwargs)
    except pymssql.Error as exc:
        raise ApiRouteError(
            code="MSSQL_CONNECTION_FAILED",
            message="운영 DB(MSSQL)에 연결하지 못했습니다. 연결 설정을 확인해 주세요.",
            status=503,
        ) from exc
    try:
        yield conn
    finally:
        conn.close()