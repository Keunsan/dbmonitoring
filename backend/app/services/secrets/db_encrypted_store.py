"""MSSQL dbo.connection_secret 암호화 저장·조회 (AS-IS db-encrypted-store.ts)."""

from __future__ import annotations

import json

from app.integrations.mssql.pool import mssql_connection
from app.services.secrets.crypto import decrypt_secret_payload, encrypt_secret_payload
from src.config import storage_backend
from src.config.loader import get_settings
from src.errors.api_route import ApiRouteError


def _is_available() -> bool:
    return storage_backend.is_mssql_configured() and bool(
        get_settings().secret_encryption_key.strip()
    )


def _require_available() -> None:
    if not _is_available():
        raise ApiRouteError(
            code="DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
            message=(
                "DB 암호화 Secret Provider가 설정되지 않았습니다. "
                "MSSQL_* 및 SECRET_ENCRYPTION_KEY를 확인해 주세요."
            ),
            status=503,
        )


def _parse_credential(plaintext: str) -> dict:
    try:
        payload = json.loads(plaintext)
    except json.JSONDecodeError as exc:
        raise ApiRouteError(
            code="DB_CONNECTION_SECRET_INVALID",
            message="저장된 Secret JSON 형식이 올바르지 않습니다.",
            status=400,
        ) from exc
    if not isinstance(payload, dict):
        raise ApiRouteError(
            code="DB_CONNECTION_SECRET_INVALID",
            message="저장된 Secret JSON 형식이 올바르지 않습니다.",
            status=400,
        )
    return payload


def fetch_db_encrypted_connection_secret(secret_name: str) -> dict:
    """MSSQL에서 암호문을 조회해 credential dict를 반환합니다."""
    _require_available()
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT encrypted_payload
                FROM dbo.connection_secret
                WHERE secret_name = %s
                """,
                (secret_name,),
            )
            row = cur.fetchone()
    if not row or row.get("encrypted_payload") is None:
        raise ApiRouteError(
            code="DB_CONNECTION_SECRET_NOT_FOUND",
            message="등록된 접속 Secret을 찾을 수 없습니다. 관리 화면에서 Secret을 등록해 주세요.",
            status=404,
        )
    raw = row["encrypted_payload"]
    payload_bytes = bytes(raw) if not isinstance(raw, (bytes, bytearray)) else raw
    plaintext = decrypt_secret_payload(payload_bytes)
    return _parse_credential(plaintext)


def upsert_db_encrypted_connection_secret(
    secret_name: str,
    credential: dict,
    description: str = "",
) -> None:
    """credential JSON을 암호화해 MERGE 합니다."""
    _require_available()
    encrypted = encrypt_secret_payload(json.dumps(credential, ensure_ascii=False))
    desc = description or f"DB connection credential for {secret_name}"
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                MERGE dbo.connection_secret AS target
                USING (SELECT %s AS secret_name) AS source
                ON target.secret_name = source.secret_name
                WHEN MATCHED THEN
                    UPDATE SET
                        encrypted_payload = %s,
                        key_version = 1,
                        description = %s,
                        updated_at = SYSDATETIMEOFFSET()
                WHEN NOT MATCHED THEN
                    INSERT (secret_name, encrypted_payload, key_version, description)
                    VALUES (%s, %s, 1, %s);
                """,
                (secret_name, encrypted, desc, secret_name, encrypted, desc),
            )
        conn.commit()


def delete_db_encrypted_connection_secret(secret_name: str) -> bool:
    _require_available()
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM dbo.connection_secret
                OUTPUT DELETED.secret_name
                WHERE secret_name = %s
                """,
                (secret_name,),
            )
            deleted = cur.fetchone()
        conn.commit()
    return bool(deleted)