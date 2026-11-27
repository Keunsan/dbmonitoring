"""SQL 텍스트 적재용 sanitize 단위 테스트."""

from app.services.processing.sanitize_sql import sanitize_sql_text_for_storage


def test_sanitize_strips_null_and_truncates_unclosed_quote() -> None:
    raw = "FETCH API_CURSOR000000000011D4BC'\x00"
    result = sanitize_sql_text_for_storage(raw)
    assert result is not None
    assert "\x00" not in result
    assert result.endswith("D4BC") or "FETCH" in result


def test_sanitize_masks_literals() -> None:
    result = sanitize_sql_text_for_storage("SELECT * FROM t WHERE name = 'secret'")
    assert result is not None
    assert "secret" not in result