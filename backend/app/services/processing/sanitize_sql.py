"""MSSQL 적재·pymssql 바인딩에 안전한 SQL 텍스트 정제입니다."""

from __future__ import annotations

from app.services.processing.mask_sql import mask_sql_text

_STORE_MAX_LEN = 8000


def sanitize_sql_text_for_storage(sql_text: str | None) -> str | None:
    """마스킹 후 적재용 길이·제어문자·따옴표 깨짐을 정리합니다."""
    masked = mask_sql_text(sql_text)
    if masked is None:
        return None
    cleaned = (
        masked.replace("\x00", "")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("\t", " ")
    )
    while len(cleaned) >= 2 and cleaned[-1] in "'\"" and cleaned.count(cleaned[-1]) % 2 == 1:
        cleaned = cleaned[:-1]
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        return cleaned
    return cleaned[:_STORE_MAX_LEN]