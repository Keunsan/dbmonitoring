"""표준 API 예외 타입입니다."""

from __future__ import annotations


class FrameworkError(Exception):
    """플랫폼 공통 예외 베이스."""

    def __init__(self, message: str, *, code: str = "INTERNAL_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class ValidationError(FrameworkError):
    def __init__(self, message: str, *, field: str | None = None) -> None:
        super().__init__(message, code="VALIDATION_ERROR")
        self.field = field


class NotFoundError(FrameworkError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="NOT_FOUND")