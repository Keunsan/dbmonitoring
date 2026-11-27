"""connectionSecretRef 파싱 (AS-IS lib/secrets/refs)."""

from __future__ import annotations

from src.errors.api_route import ApiRouteError

_VAULT_PREFIX = "vault:"
_ENV_PREFIX = "env:"


def parse_connection_secret_ref(raw: str) -> str:
    """vault: 또는 env: ref 형식을 검증하고 정규화합니다."""
    trimmed = raw.strip()
    if trimmed.startswith(_VAULT_PREFIX):
        name = trimmed[len(_VAULT_PREFIX) :].strip()
        if not name:
            raise ApiRouteError(
                code="VALIDATION_ERROR",
                message="vault secret ref 형식이 올바르지 않습니다.",
                status=400,
            )
        return trimmed
    if trimmed.startswith(_ENV_PREFIX):
        key = trimmed[len(_ENV_PREFIX) :].strip()
        if not key:
            raise ApiRouteError(
                code="VALIDATION_ERROR",
                message="env secret ref 형식이 올바르지 않습니다.",
                status=400,
            )
        return trimmed
    raise ApiRouteError(
        code="VALIDATION_ERROR",
        message="connectionSecretRef는 vault: 또는 env: 로 시작해야 합니다.",
        status=400,
    )


def parse_connection_secret_ref_kind(raw: str | None) -> dict:
    """ref 종류(vault/env)와 이름을 반환합니다."""
    if not raw:
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message="connectionSecretRef가 설정되지 않았습니다.",
            status=400,
        )
    ref = parse_connection_secret_ref(raw)
    if ref.startswith(_VAULT_PREFIX):
        return {"kind": "vault", "vaultName": ref[len(_VAULT_PREFIX) :], "raw": ref}
    return {"kind": "env", "envKey": ref[len(_ENV_PREFIX) :], "raw": ref}


def build_vault_secret_name(db_instance_id: str) -> str:
    return f"dbmonitoring/instances/{db_instance_id}"


def build_vault_connection_secret_ref(db_instance_id: str) -> str:
    return f"{_VAULT_PREFIX}{build_vault_secret_name(db_instance_id)}"