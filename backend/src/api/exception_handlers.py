"""표준 JSON 오류 응답 핸들러입니다."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse

from src.api.dependencies import get_request_id
from src.api.schemas import failure_response
from src.errors.api_route import ApiRouteError
from src.errors.exceptions import FrameworkError
from src.observability.logging import logger


def register_exception_handlers(app) -> None:
    @app.exception_handler(ApiRouteError)
    async def handle_api_route_error(request: Request, exc: ApiRouteError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            content=failure_response(exc.code, exc.message, meta={"requestId": get_request_id(request)}),
        )

    @app.exception_handler(FrameworkError)
    async def handle_framework_error(request: Request, exc: FrameworkError) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=failure_response(exc.code, exc.message, meta={"requestId": get_request_id(request)}),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.error("API 예기치 않은 오류", error=str(exc))
        return JSONResponse(
            status_code=500,
            content=failure_response(
                "INTERNAL_SERVER_ERROR",
                "요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
                meta={"requestId": get_request_id(request)},
            ),
        )