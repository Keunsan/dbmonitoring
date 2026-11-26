"""API 공통 의존성 (requestId 등)."""

from __future__ import annotations

import uuid

from fastapi import Request


def get_request_id(request: Request) -> str:
    return request.headers.get("x-request-id") or f"req_{uuid.uuid4()}"