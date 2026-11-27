"""SQL 텍스트 마스킹 (AS-IS collector 어댑터 동등)."""

from __future__ import annotations

import re

_MASK = "••••••••"

_LITERAL_PATTERN = re.compile(
    r"(['\"])(?:(?=(\\?))\2.)*?\1",
    re.DOTALL,
)


def mask_sql_text(sql_text: str | None) -> str | None:
    """리터럴 문자열 구간을 마스킹합니다."""
    if sql_text is None:
        return None
    trimmed = sql_text.strip()
    if not trimmed:
        return trimmed
    masked = _LITERAL_PATTERN.sub(r"\1" + _MASK + r"\1", trimmed)
    # pymssql/MSSQL 적재 시 깨진 따옴표·NULL 바이트로 인한 오류 방지
    return masked.replace("\x00", "")[:8000]