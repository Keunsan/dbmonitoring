"""설정 파일·환경 변수를 단일 진입점으로 로드합니다."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    """런타임 환경 변수 (민감 정보는 .env만)."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="development", alias="APP_ENV")
    app_port: int = Field(default=8000, alias="APP_PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    next_public_supabase_url: str = Field(default="", alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    mssql_host: str = Field(default="", alias="MSSQL_HOST")
    mssql_port: int = Field(default=1433, alias="MSSQL_PORT")
    mssql_database: str = Field(default="", alias="MSSQL_DATABASE")
    mssql_user: str = Field(default="", alias="MSSQL_USER")
    mssql_password: str = Field(default="", alias="MSSQL_PASSWORD")
    mssql_encrypt: bool = Field(default=True, alias="MSSQL_ENCRYPT")
    mssql_trust_server_certificate: bool = Field(
        default=False,
        alias="MSSQL_TRUST_SERVER_CERTIFICATE",
    )
    next_legacy_base_url: str = Field(default="", alias="NEXT_LEGACY_BASE_URL")
    mssql_ca_cert_path: str = Field(default="", alias="MSSQL_CA_CERT_PATH")


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


@lru_cache
def load_yaml_config(name: str = "local.yaml") -> dict[str, Any]:
    path = _backend_root() / "config" / name
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data if isinstance(data, dict) else {}


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()


@lru_cache
def get_config() -> dict[str, Any]:
    """YAML + 환경 기반 병합 설정 (비즈니스 로직은 여기서만 읽음)."""
    yaml_cfg = load_yaml_config("local.yaml")
    settings = get_settings()
    return {
        **yaml_cfg,
        "runtime": {
            "app_env": settings.app_env,
            "app_port": settings.app_port,
            "log_level": settings.log_level,
        },
    }