"""SQL 분석 조회 API입니다."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.services.analysis.sql_detail import get_sql_detail_view
from app.services.analysis.sql_regression import detect_sql_regressions
from app.services.storage.facade import append_sql_regression_events
from app.services.storage.facade import list_sql_plan_snapshots, list_sql_regression_events
from src.api.dependencies import get_request_id
from src.api.schemas import success_response
from src.errors.api_route import ApiRouteError

router = APIRouter(tags=["analysis"])


@router.get("/analysis/sql/{sql_id}")
def get_analysis_sql_detail(
    request: Request,
    sql_id: str,
    db_instance_id: str = Query(alias="dbInstanceId"),
) -> dict:
    """SQL ID 기준 상세 분석 데이터를 반환합니다."""
    if not db_instance_id.strip():
        raise ApiRouteError(
            code="VALIDATION_ERROR",
            message="dbInstanceId가 필요합니다.",
            status=400,
        )
    detail = get_sql_detail_view(db_instance_id.strip(), sql_id)
    if detail is None:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="해당 SQL에 대한 수집 이력이 없습니다.",
            status=404,
        )
    return success_response({"detail": detail}, meta={"requestId": get_request_id(request)})


@router.get("/analysis/plan-changes")
def get_plan_changes(
    request: Request,
    db_instance_id: str = Query(alias="dbInstanceId"),
    limit: int = Query(default=50),
) -> dict:
    """실행 계획 스냅샷 목록을 반환합니다."""
    items = list_sql_plan_snapshots(db_instance_id=db_instance_id, limit=limit)
    return success_response({"items": items}, meta={"requestId": get_request_id(request)})


@router.get("/analysis/regressions")
def get_regressions(
    request: Request,
    db_instance_id: str | None = Query(default=None, alias="dbInstanceId"),
    limit: int = Query(default=100),
) -> dict:
    """SQL 성능 회귀 이벤트를 반환합니다."""
    items = list_sql_regression_events(db_instance_id, limit)
    return success_response({"items": items}, meta={"requestId": get_request_id(request)})


@router.post("/analysis/regressions/detect")
async def detect_regressions(request: Request) -> dict:
    """최근 SQL 성능 이력에서 회귀 후보를 탐지하고 저장합니다."""
    body = (
        await request.json()
        if request.headers.get("content-type", "").startswith("application/json")
        else {}
    )
    db_instance_id = (body.get("dbInstanceId") or "").strip() or None
    result = detect_sql_regressions(db_instance_id)
    if result["items"]:
        append_sql_regression_events(result["items"])
    return success_response(result, meta={"requestId": get_request_id(request)})