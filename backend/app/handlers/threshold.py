"""임계치 정책 CRUD API입니다."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.services.alert.threshold_store import (
    create_threshold_policy,
    delete_threshold_policy,
    list_threshold_policies,
    update_threshold_policy,
)
from src.api.dependencies import get_request_id
from src.api.schemas import success_response
from src.errors.api_route import ApiRouteError

router = APIRouter(tags=["alerts"])


@router.get("/threshold-policies")
def get_threshold_policies(request: Request) -> dict:
    return success_response(
        {"items": list_threshold_policies()},
        meta={"requestId": get_request_id(request)},
    )


@router.post("/threshold-policies")
async def post_threshold_policy(request: Request) -> dict:
    payload = await request.json()
    policy = create_threshold_policy(payload)
    body = success_response(policy, meta={"requestId": get_request_id(request)})
    return JSONResponse(content=body, status_code=201)


@router.get("/threshold-policies/{policy_id}")
def get_threshold_policy(request: Request, policy_id: str) -> dict:
    policy = next((p for p in list_threshold_policies() if p["id"] == policy_id), None)
    if not policy:
        raise ApiRouteError(code="NOT_FOUND", message="임계치 정책을 찾을 수 없습니다.", status=404)
    return success_response(policy, meta={"requestId": get_request_id(request)})


@router.patch("/threshold-policies/{policy_id}")
async def patch_threshold_policy(request: Request, policy_id: str) -> dict:
    payload = await request.json()
    policy = update_threshold_policy(policy_id, payload)
    return success_response(policy, meta={"requestId": get_request_id(request)})


@router.delete("/threshold-policies/{policy_id}")
def delete_threshold_policy_handler(request: Request, policy_id: str) -> dict:
    delete_threshold_policy(policy_id)
    return success_response({"id": policy_id}, meta={"requestId": get_request_id(request)})


@router.post("/threshold-policies/test")
async def test_threshold_policy(request: Request) -> dict:
    payload: dict[str, Any] = await request.json()
    metric_key = payload.get("metricKey")
    value = float(payload.get("sampleValue") or 0)
    warning = float(payload.get("warningThreshold") or 0)
    critical = float(payload.get("criticalThreshold") or 0)
    comp = payload.get("comparison", "GTE")
    severity = None
    if comp == "GTE":
        if value >= critical:
            severity = "CRITICAL"
        elif value >= warning:
            severity = "WARNING"
    else:
        if value <= critical:
            severity = "CRITICAL"
        elif value <= warning:
            severity = "WARNING"
    return success_response(
        {"metricKey": metric_key, "sampleValue": value, "severity": severity},
        meta={"requestId": get_request_id(request)},
    )