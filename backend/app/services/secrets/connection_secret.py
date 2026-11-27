"""DB 인스턴스 connection-secret 등록·삭제 비즈니스 로직입니다."""

from __future__ import annotations

from datetime import datetime, timezone

from app.services.inventory.facade import get_db_instance, update_db_instance_secret_ref
from app.services.secrets.refs import (
    build_vault_connection_secret_ref,
    build_vault_secret_name,
    parse_connection_secret_ref_kind,
)
from app.services.secrets.vault_store import delete_connection_secret, upsert_connection_secret
from src.errors.api_route import ApiRouteError


def save_db_instance_connection_secret(instance_id: str, payload: dict) -> dict:
    """Vault(또는 db_encrypted 스텁)에 Secret을 저장하고 ref를 갱신합니다."""
    instance = get_db_instance(instance_id)
    if not instance:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )
    credential = {
        "username": payload["username"],
        "password": payload["password"],
        "dbmsType": instance.get("dbmsType"),
        "encrypt": payload.get("encrypt"),
        "trustServerCertificate": payload.get("trustServerCertificate"),
        "connectionTimeoutMs": payload.get("connectionTimeoutMs"),
        "requestTimeoutMs": payload.get("requestTimeoutMs"),
        "connectString": payload.get("connectString"),
        "serviceName": payload.get("serviceName") or instance.get("serviceName"),
        "walletLocation": payload.get("walletLocation"),
    }
    vault_name = build_vault_secret_name(instance_id)
    upsert_connection_secret(
        vault_name,
        credential,
        description=f"Connection credential for {instance.get('instanceName')}",
    )
    connection_secret_ref = build_vault_connection_secret_ref(instance_id)
    updated = update_db_instance_secret_ref(instance_id, connection_secret_ref)
    return {
        "dbInstanceId": instance_id,
        "connectionSecretRef": updated.get("connectionSecretRef"),
        "vaultName": vault_name,
        "savedAt": datetime.now(timezone.utc).isoformat(),
    }


def remove_db_instance_connection_secret(instance_id: str) -> dict:
    """vault ref 인스턴스의 Secret을 삭제합니다."""
    instance = get_db_instance(instance_id)
    if not instance:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )
    parsed = parse_connection_secret_ref_kind(instance.get("connectionSecretRef"))
    if parsed["kind"] != "vault":
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message="env: ref 인스턴스는 Vault Secret 삭제 대상이 아닙니다.",
            status=400,
        )
    deleted = delete_connection_secret(parsed["vaultName"])
    if not deleted:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="삭제할 접속 Secret을 찾을 수 없습니다.",
            status=404,
        )
    return {
        "dbInstanceId": instance_id,
        "deleted": True,
        "vaultName": parsed["vaultName"],
    }