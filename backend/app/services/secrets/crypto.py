"""connection secret AES-256-GCM 암·복호화 (AS-IS lib/secrets/crypto.ts)."""

from __future__ import annotations

import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from src.config.loader import get_settings
from src.errors.api_route import ApiRouteError

_ALGORITHM_IV_LENGTH = 12
_AUTH_TAG_LENGTH = 16


def _decode_encryption_key() -> bytes:
    raw = (get_settings().secret_encryption_key or os.getenv("SECRET_ENCRYPTION_KEY", "")).strip()
    if not raw:
        raise ApiRouteError(
            code="DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
            message="SECRET_ENCRYPTION_KEY 환경 변수가 설정되지 않았습니다.",
            status=503,
        )
    try:
        key = base64.b64decode(raw)
    except Exception as exc:
        raise ApiRouteError(
            code="DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
            message="SECRET_ENCRYPTION_KEY 형식이 올바르지 않습니다.",
            status=503,
        ) from exc
    if len(key) != 32:
        raise ApiRouteError(
            code="DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
            message="SECRET_ENCRYPTION_KEY는 32바이트(base64) 값이어야 합니다.",
            status=503,
        )
    return key


def encrypt_secret_payload(plaintext: str, key_version: int = 1) -> bytes:
    """평문 JSON을 AES-256-GCM 패킷으로 암호화합니다."""
    key = _decode_encryption_key()
    iv = os.urandom(_ALGORITHM_IV_LENGTH)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    ciphertext = ciphertext_with_tag[:-_AUTH_TAG_LENGTH]
    auth_tag = ciphertext_with_tag[-_AUTH_TAG_LENGTH:]
    return bytes([key_version]) + iv + auth_tag + ciphertext


def decrypt_secret_payload(payload: bytes) -> str:
    """AS-IS 패킷([version][iv][tag][cipher])을 평문으로 복호화합니다."""
    min_len = 1 + _ALGORITHM_IV_LENGTH + _AUTH_TAG_LENGTH + 1
    if len(payload) < min_len:
        raise ApiRouteError(
            code="DB_CONNECTION_SECRET_INVALID",
            message="저장된 Secret 형식이 올바르지 않습니다.",
            status=400,
        )
    key_version = payload[0]
    if key_version != 1:
        raise ApiRouteError(
            code="DB_CONNECTION_SECRET_INVALID",
            message=f"지원하지 않는 Secret key_version({key_version}) 입니다.",
            status=400,
        )
    iv = payload[1 : 1 + _ALGORITHM_IV_LENGTH]
    auth_tag = payload[1 + _ALGORITHM_IV_LENGTH : 1 + _ALGORITHM_IV_LENGTH + _AUTH_TAG_LENGTH]
    encrypted = payload[1 + _ALGORITHM_IV_LENGTH + _AUTH_TAG_LENGTH :]
    key = _decode_encryption_key()
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, encrypted + auth_tag, None)
    return plaintext.decode("utf-8")