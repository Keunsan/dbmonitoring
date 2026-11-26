"""임계치 평가·알림 이벤트 생성 (AS-IS evaluateAlertPolicies)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.services.alert import store as alert_store
from app.services.alert.threshold_store import list_threshold_policies
from app.services.inventory.facade import list_db_instances
from app.services.monitoring.metric_keys import SERVER_METRIC_KEYS
from app.services.storage.facade import (
    list_blocking_snapshots,
    list_collection_runs,
    list_deadlock_events,
    list_metric_history,
    list_session_snapshots,
    list_sql_performance,
)
from src.config.storage_backend import DEFAULT_TENANT_ID

_FINGERPRINTS: dict[str, str] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _severity(policy: dict, value: float) -> str | None:
    comp = policy.get("comparison", "GTE")
    warn = float(policy["warningThreshold"])
    crit = float(policy["criticalThreshold"])
    if comp == "GTE":
        if value >= crit:
            return "CRITICAL"
        if value >= warn:
            return "WARNING"
    else:
        if value <= crit:
            return "CRITICAL"
        if value <= warn:
            return "WARNING"
    return None


def _policy_value(instance_id: str, metric_key: str) -> float | None:
    instance = next((i for i in list_db_instances() if i["id"] == instance_id), None)
    last_run = (list_collection_runs(instance_id) or [None])[0]
    if metric_key == "CONNECTION_FAILURE":
        return 1.0 if last_run and last_run.get("status") == "FAIL" else 0.0
    if metric_key == "USER_CONNECTIONS":
        items = list_metric_history(
            db_instance_id=instance_id,
            metric_name=SERVER_METRIC_KEYS["userConnections"],
            limit=1,
        )
        return float(items[0]["metricValue"]) if items else 0.0
    if metric_key == "ACTIVE_SESSIONS":
        return float(
            len([s for s in list_session_snapshots(instance_id, 200) if s.get("status") == "running"])
        )
    if metric_key == "BLOCKING_SECONDS":
        waits = [b.get("waitMs", 0) / 1000 for b in list_blocking_snapshots(instance_id, 100)]
        return max(waits) if waits else 0.0
    if metric_key == "DEADLOCK_COUNT":
        return float(len(list_deadlock_events(instance_id, 100)))
    if metric_key == "SQL_AVG_ELAPSED_MS":
        sql_items = list_sql_performance(instance_id, 20)
        return max((float(s["avgElapsedMs"]) for s in sql_items), default=0.0)
    if metric_key == "COLLECT_DELAY":
        if not instance or not instance.get("lastCollectAt"):
            return 0.0
        elapsed = (
            datetime.now(timezone.utc)
            - datetime.fromisoformat(instance["lastCollectAt"].replace("Z", "+00:00"))
        ).total_seconds()
        return elapsed / max(int(instance.get("collectIntervalSec") or 60), 1)
    return None


def evaluate_alert_policies() -> dict:
    events: list[dict] = []
    suppressed = 0
    evaluated_at = _now()
    policies = [p for p in list_threshold_policies() if p.get("isActive")]

    for instance in list_db_instances():
        if not instance.get("isActive"):
            continue
        for policy in policies:
            value = _policy_value(instance["id"], policy["metricKey"])
            if value is None:
                continue
            severity = _severity(policy, value)
            if not severity:
                continue
            fingerprint = f"{instance['id']}:{policy['metricKey']}:{severity}"
            last = _FINGERPRINTS.get(fingerprint)
            if last:
                elapsed = (
                    datetime.now(timezone.utc)
                    - datetime.fromisoformat(last.replace("Z", "+00:00"))
                ).total_seconds()
                if elapsed < max(int(policy.get("durationSec") or 60), 60):
                    suppressed += 1
                    continue
            _FINGERPRINTS[fingerprint] = evaluated_at
            threshold = (
                policy["criticalThreshold"]
                if severity == "CRITICAL"
                else policy["warningThreshold"]
            )
            event = {
                "id": f"alert_{uuid.uuid4().hex[:10]}",
                "tenantId": DEFAULT_TENANT_ID,
                "dbInstanceId": instance["id"],
                "eventTime": evaluated_at,
                "severity": severity,
                "category": policy["metricKey"],
                "title": f"{policy['description']} 기준 초과",
                "message": (
                    f"{policy['description']} 값이 {value}로 "
                    f"기준({threshold})을 초과했습니다."
                ),
                "status": "NEW",
                "acknowledgedAt": None,
                "acknowledgedBy": None,
            }
            alert_store.append_alert_event(event)
            events.append(event)

    return {
        "eventsCreated": len(events),
        "suppressed": suppressed,
        "evaluatedAt": evaluated_at,
        "events": events,
    }