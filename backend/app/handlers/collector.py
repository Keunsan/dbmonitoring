"""Collector 수동 실행·상태 API입니다."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.services.collector.scheduler import (
    list_scheduler_statuses,
    run_collector_for_instance,
    run_collector_once,
    start_collector_scheduler,
)
from src.api.dependencies import get_request_id
from src.api.schemas import success_response
from src.errors.api_route import ApiRouteError

router = APIRouter(tags=["collector"])


@router.post("/collector/run")
async def post_collector_run(request: Request) -> dict:
    """전체 또는 단일 DB 인스턴스 Collector를 즉시 실행합니다."""
    start_collector_scheduler()
    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except Exception:
        body = {}

    db_instance_id = body.get("dbInstanceId")
    if isinstance(db_instance_id, str):
        db_instance_id = db_instance_id.strip() or None
    scope = "sessions" if body.get("scope") == "sessions" else "full"

    if db_instance_id:
        try:
            results = [run_collector_for_instance(db_instance_id, scope=scope)]
        except ValueError as exc:
            raise ApiRouteError(code="NOT_FOUND", message=str(exc), status=404) from exc
    else:
        results = run_collector_once()

    return success_response({"items": results}, meta={"requestId": get_request_id(request)})


@router.get("/collector/status")
def get_collector_status(request: Request) -> dict:
    """스케줄러 상태를 반환합니다."""
    start_collector_scheduler()
    return success_response(
        {"items": list_scheduler_statuses()},
        meta={"requestId": get_request_id(request)},
    )