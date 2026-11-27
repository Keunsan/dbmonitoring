"""인벤토리 API 입력 검증 (AS-IS lib/inventory/store 파서)."""

from __future__ import annotations

from typing import Any

from app.services.secrets.refs import parse_connection_secret_ref
from src.errors.api_route import ApiRouteError


def _require_string(payload: dict, key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message=f"{key} 값은 필수입니다.",
            status=400,
        )
    return value.strip()


def _normalize_nullable(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed if trimmed else None
    return str(value)


def _assert_one_of(value: str, allowed: list[str], label: str) -> str:
    if value not in allowed:
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message=f"{label}은(는) {', '.join(allowed)} 중 하나여야 합니다.",
            status=400,
        )
    return value


def _parse_number(payload: dict, key: str, default: int) -> int:
    value = payload.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message=f"{key} 값은 숫자여야 합니다.",
            status=400,
        )
    return int(value)


def _parse_bool(payload: dict, key: str, default: bool) -> bool:
    value = payload.get(key, default)
    if not isinstance(value, bool):
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message=f"{key} 값은 true/false 여야 합니다.",
            status=400,
        )
    return value


def _validate_collection_intervals(collect_interval: int, sql_interval: int) -> None:
    if collect_interval < 10 or collect_interval > 300:
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message="수집 주기는 10~300초 범위여야 합니다.",
            status=400,
        )
    if sql_interval < 10 or sql_interval > 300:
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message="SQL 집계 주기는 10~300초 범위여야 합니다.",
            status=400,
        )


def parse_business_system_input(payload: dict) -> dict:
    """업무 시스템 등록·수정 입력을 검증합니다."""
    return {
        "code": _require_string(payload, "code").upper(),
        "name": _require_string(payload, "name"),
        "importance": _assert_one_of(
            _require_string(payload, "importance"),
            ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            "importance",
        ),
        "ownerDept": _normalize_nullable(payload.get("ownerDept")),
        "ownerName": _normalize_nullable(payload.get("ownerName")),
        "ownerEmail": _normalize_nullable(payload.get("ownerEmail")),
    }


def parse_collection_settings_input(payload: dict) -> dict:
    """수집 설정 PATCH 입력을 검증합니다."""
    collect_interval = _parse_number(payload, "collectIntervalSec", 60)
    sql_interval = _parse_number(payload, "sqlAggregateIntervalSec", 300)
    _validate_collection_intervals(collect_interval, sql_interval)
    return {
        "collectorId": _normalize_nullable(payload.get("collectorId")),
        "collectIntervalSec": collect_interval,
        "sqlAggregateIntervalSec": sql_interval,
        "isActive": _parse_bool(payload, "isActive", True),
    }


def parse_connection_secret_input(payload: dict) -> dict:
    """connection-secret POST 입력을 검증합니다."""
    return {
        "username": _require_string(payload, "username"),
        "password": _require_string(payload, "password"),
        "encrypt": payload.get("encrypt") if isinstance(payload.get("encrypt"), bool) else None,
        "trustServerCertificate": payload.get("trustServerCertificate")
        if isinstance(payload.get("trustServerCertificate"), bool)
        else None,
        "connectionTimeoutMs": payload.get("connectionTimeoutMs")
        if isinstance(payload.get("connectionTimeoutMs"), (int, float))
        else None,
        "requestTimeoutMs": payload.get("requestTimeoutMs")
        if isinstance(payload.get("requestTimeoutMs"), (int, float))
        else None,
        "connectString": _normalize_nullable(payload.get("connectString")),
        "serviceName": _normalize_nullable(payload.get("serviceName")),
        "walletLocation": _normalize_nullable(payload.get("walletLocation")),
    }


def parse_db_instance_input(payload: dict) -> dict:
    """DB 인스턴스 등록 입력을 검증합니다."""
    collect_interval = _parse_number(payload, "collectIntervalSec", 60)
    sql_interval = _parse_number(payload, "sqlAggregateIntervalSec", 300)
    _validate_collection_intervals(collect_interval, sql_interval)
    secret_ref: str | None = None
    raw_ref = payload.get("connectionSecretRef")
    if isinstance(raw_ref, str) and raw_ref.strip():
        secret_ref = parse_connection_secret_ref(raw_ref.strip())
    return {
        "dbmsType": _assert_one_of(
            _require_string(payload, "dbmsType"),
            ["MSSQL", "ORACLE", "AZURE_SQL"],
            "dbmsType",
        ),
        "instanceName": _require_string(payload, "instanceName"),
        "host": _require_string(payload, "host"),
        "port": _parse_number(payload, "port", 1433),
        "serviceName": _normalize_nullable(payload.get("serviceName")),
        "databaseName": _normalize_nullable(payload.get("databaseName")),
        "businessSystemId": _require_string(payload, "businessSystemId"),
        "importance": _assert_one_of(
            _require_string(payload, "importance"),
            ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            "importance",
        ),
        "envType": _assert_one_of(
            _require_string(payload, "envType"),
            ["PROD", "DEV", "STG", "DR"],
            "envType",
        ),
        "collectorType": _assert_one_of(
            _require_string(payload, "collectorType"),
            ["AGENT", "AGENTLESS", "API"],
            "collectorType",
        ),
        "collectorId": _normalize_nullable(payload.get("collectorId")),
        "collectIntervalSec": collect_interval,
        "sqlAggregateIntervalSec": sql_interval,
        "isActive": _parse_bool(payload, "isActive", True),
        "connectionSecretRef": secret_ref,
    }