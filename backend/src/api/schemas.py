"""Next.js AS-IS와 동일한 API 응답 봉투 스키마입니다."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiErrorBody(BaseModel):
    code: str
    message: str


class ApiResponse(BaseModel, Generic[T]):
    data: T | None = None
    error: ApiErrorBody | None = None
    meta: dict[str, Any] | None = None


def success_response(data: T, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """성공 응답 — AS-IS Next와 동일하게 error:null·meta 키를 유지합니다."""
    return {
        "data": data,
        "error": None,
        "meta": meta if meta is not None else {},
    }


def failure_response(code: str, message: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    return ApiResponse(
        data=None,
        error=ApiErrorBody(code=code, message=message),
        meta=meta,
    ).model_dump(exclude_none=True)