"""Vault·db_encrypted Secret 저장소 (로컬 스텁 — 운영 Vault RPC는 후속)."""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone

from app.services.secrets import db_encrypted_store
from src.config.loader import get_settings
from src.errors.api_route import ApiRouteError

_MEMORY_VAULT: dict[str, dict] = {}


def _provider() -> str:
    return (get_settings().secret_provider or "env").strip().lower()


def _require_secret_store() -> None:
    if _provider() not in ("db_encrypted", "supabase_vault"):
        raise ApiRouteError(
            code="SECRET_PROVIDER_UNSUPPORTED",
            message=(
                "vault ref를 사용하려면 SECRET_PROVIDER를 db_encrypted 또는 "
                f"supabase_vault로 설정해 주세요. (현재: {_provider()})"
            ),
            status=503,
        )


def upsert_connection_secret(vault_name: str, credential: dict, description: str = "") -> None:
    """접속 자격 증명을 저장합니다."""
    _require_secret_store()
    if _provider() == "db_encrypted" and db_encrypted_store._is_available():
        db_encrypted_store.upsert_db_encrypted_connection_secret(
            vault_name, credential, description=description
        )
        return
    payload = json.dumps(
        {
            "credential": credential,
            "description": description,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        },
        ensure_ascii=False,
    )
    _MEMORY_VAULT[vault_name] = {
        "encrypted": base64.b64encode(payload.encode("utf-8")).decode("ascii"),
    }


def fetch_connection_secret(vault_name: str) -> dict:
    """저장된 접속 자격 증명을 조회합니다."""
    _require_secret_store()
    if _provider() == "db_encrypted" and db_encrypted_store._is_available():
        return db_encrypted_store.fetch_db_encrypted_connection_secret(vault_name)
    entry = _MEMORY_VAULT.get(vault_name)
    if not entry:
        raise ApiRouteError(
            code="SECRET_NOT_FOUND",
            message="저장된 접속 Secret을 찾을 수 없습니다.",
            status=404,
        )
    decoded = json.loads(base64.b64decode(entry["encrypted"]).decode("utf-8"))
    return decoded["credential"]


def delete_connection_secret(vault_name: str) -> bool:
    """접속 Secret을 삭제합니다."""
    _require_secret_store()
    if _provider() == "db_encrypted" and db_encrypted_store._is_available():
        return db_encrypted_store.delete_db_encrypted_connection_secret(vault_name)
    if vault_name not in _MEMORY_VAULT:
        return False
    del _MEMORY_VAULT[vault_name]
    return True