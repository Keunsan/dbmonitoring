"""임계치 정책 인메모리 저장소 (AS-IS services/alert)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from src.errors.api_route import ApiRouteError

_POLICIES: list[dict] = []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seed_default_policies() -> None:
    if _POLICIES:
        return
    created = _now()
    defaults = [
        ("USER_CONNECTIONS", 80, 120, "GTE", 60, "사용자 연결 수"),
        ("COLLECT_DELAY", 1.5, 2.5, "GTE", 60, "수집 지연"),
    ]
    for metric_key, warn, crit, comp, duration, desc in defaults:
        _POLICIES.append(
            {
                "id": f"policy_{uuid.uuid4().hex[:8]}",
                "scopeType": "GLOBAL",
                "scopeId": None,
                "metricKey": metric_key,
                "warningThreshold": warn,
                "criticalThreshold": crit,
                "comparison": comp,
                "durationSec": duration,
                "isActive": True,
                "description": desc,
                "createdAt": created,
                "updatedAt": created,
            }
        )


def list_threshold_policies() -> list[dict]:
    _seed_default_policies()
    return list(_POLICIES)


def create_threshold_policy(payload: dict) -> dict:
    _seed_default_policies()
    created = _now()
    policy = {
        "id": f"policy_{uuid.uuid4().hex[:8]}",
        "createdAt": created,
        "updatedAt": created,
        **payload,
    }
    _POLICIES.append(policy)
    return policy


def update_threshold_policy(policy_id: str, payload: dict) -> dict:
    for index, policy in enumerate(_POLICIES):
        if policy["id"] == policy_id:
            updated = {**policy, **payload, "updatedAt": _now()}
            _POLICIES[index] = updated
            return updated
    raise ApiRouteError(code="NOT_FOUND", message="임계치 정책을 찾을 수 없습니다.", status=404)


def delete_threshold_policy(policy_id: str) -> None:
    before = len(_POLICIES)
    _POLICIES[:] = [p for p in _POLICIES if p["id"] != policy_id]
    if len(_POLICIES) == before:
        raise ApiRouteError(code="NOT_FOUND", message="임계치 정책을 찾을 수 없습니다.", status=404)