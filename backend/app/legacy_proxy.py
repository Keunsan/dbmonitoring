"""R1 전환기: 미구현 TO-BE 경로를 AS-IS Next API로 프록시합니다."""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, Request, Response

from src.api.schemas import failure_response
from src.observability.logging import logger

router = APIRouter(include_in_schema=False)

LEGACY_ENV = "NEXT_LEGACY_BASE_URL"


def _legacy_base() -> str | None:
    raw = (os.getenv(LEGACY_ENV) or "").strip().rstrip("/")
    return raw or None


def _map_to_legacy_path(v1_path: str) -> str:
    """/api/v1/* → Next /api/* (v1 세그먼트 제거)."""
    trimmed = v1_path.lstrip("/")
    if trimmed.startswith("v1/"):
        trimmed = trimmed[3:]
    return f"/api/{trimmed}"


@router.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_legacy(request: Request, full_path: str) -> Response:
    base = _legacy_base()
    if not base:
        body = failure_response(
            "NOT_IMPLEMENTED",
            "해당 API는 아직 Python으로 이관 중입니다. NEXT_LEGACY_BASE_URL을 설정하거나 Next.js(3000)를 사용해 주세요.",
        )
        return Response(
            content=__import__("json").dumps(body, ensure_ascii=False),
            status_code=501,
            media_type="application/json; charset=utf-8",
        )

    legacy_path = _map_to_legacy_path(full_path)
    url = f"{base}{legacy_path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    body = await request.body()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length")
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            upstream = await client.request(
                request.method,
                url,
                content=body if body else None,
                headers=headers,
            )
    except httpx.HTTPError as exc:
        logger.error("레거시 API 프록시 실패", target=url, error=str(exc))
        err = failure_response("BAD_GATEWAY", "레거시 API에 연결하지 못했습니다. Next.js 개발 서버가 실행 중인지 확인해 주세요.")
        return Response(
            content=__import__("json").dumps(err, ensure_ascii=False),
            status_code=502,
            media_type="application/json; charset=utf-8",
        )

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "application/json"),
    )