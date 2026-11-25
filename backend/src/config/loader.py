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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = Field(default="development", alias="APP_ENV")
    app_port: int = Field(default=8000, alias="APP_PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")


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