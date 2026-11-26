"""알림 API입니다."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.services.alert.evaluate import evaluate_alert_policies
from app.services.alert.store import acknowledge_alert, list_alert_events
from src.api.dependencies import get_request_id
from src.api.schemas import success_response
from src.errors.api_route import ApiRouteError

router = APIRouter(tags=["alerts"])


@router.get("/alerts")
def get_alerts(request: Request) -> dict:
    """생성된 알림 이벤트 목록을 반환합니다."""
    return success_response(
        {"items": list_alert_events()},
        meta={"requestId": get_request_id(request)},
    )


@router.post("/alerts/evaluate")
def post_alerts_evaluate(request: Request) -> dict:
    """최신 수집 데이터에 임계치를 적용합니다."""
    return success_response(
        evaluate_alert_policies(),
        meta={"requestId": get_request_id(request)},
    )


@router.post("/alerts/{alert_id}/ack")
async def post_alert_ack(request: Request, alert_id: str) -> dict:
    body = (
        await request.json()
        if request.headers.get("content-type", "").startswith("application/json")
        else {}
    )
    acknowledged_by = body.get("acknowledgedBy") or "operator"
    try:
        event = acknowledge_alert(alert_id, acknowledged_by=acknowledged_by)
    except KeyError as exc:
        raise ApiRouteError(code="NOT_FOUND", message="알림을 찾을 수 없습니다.", status=404) from exc
    return success_response(event, meta={"requestId": get_request_id(request)})