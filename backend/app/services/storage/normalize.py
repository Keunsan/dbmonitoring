"""Collector payload를 공통 저장 모델로 정규화합니다."""

from __future__ import annotations

import uuid
from typing import Any

from src.config.storage_backend import DEFAULT_TENANT_ID


def _new_id() -> str:
    return str(uuid.uuid4())


def normalize_collector_run(result: dict[str, Any]) -> dict[str, list[dict] | dict]:
    """단일 Collector 실행 결과를 저장 가능한 정규화 레코드로 변환합니다."""
    db_instance_id = result["dbInstanceId"]
    metrics = result.get("metrics") or []
    sessions = result.get("sessions") or []
    locks = result.get("locks") or []
    sql_items = result.get("sql") or []
    deadlocks = result.get("deadlocks") or []
    sql_plans = result.get("sqlPlans") or []

    collection_run = {
        "id": _new_id(),
        "tenantId": DEFAULT_TENANT_ID,
        "dbInstanceId": db_instance_id,
        "startedAt": result["startedAt"],
        "finishedAt": result["finishedAt"],
        "status": result["status"],
        "errorMessage": result.get("errorMessage"),
        "metricsCount": len(metrics),
        "sessionsCount": len(sessions),
        "locksCount": len(locks),
        "sqlCount": len(sql_items),
    }

    metric_history = [
        {
            "id": _new_id(),
            "tenantId": DEFAULT_TENANT_ID,
            "dbInstanceId": db_instance_id,
            "metricTime": m["collectTime"],
            "metricName": m["metricName"],
            "metricValue": float(m["metricValue"]),
            "unit": m.get("unit"),
            "tags": m.get("tags") or {},
        }
        for m in metrics
    ]

    session_snapshots = [
        {
            "id": _new_id(),
            "tenantId": DEFAULT_TENANT_ID,
            "dbInstanceId": db_instance_id,
            "snapshotTime": s["collectTime"],
            "sessionId": str(s["sessionId"]),
            "loginName": s["loginName"],
            "status": s["status"],
            "waitType": s.get("waitType"),
            "waitMs": s.get("waitMs"),
            "sqlId": s.get("sqlId"),
            "blockingSessionId": (
                str(s["blockingSessionId"]) if s.get("blockingSessionId") is not None else None
            ),
            "command": s.get("command"),
            "cpuTimeMs": s.get("cpuTimeMs"),
            "logicalReads": s.get("logicalReads"),
            "sqlTextMasked": s.get("sqlTextMasked"),
            "hostName": s.get("hostName"),
            "programName": s.get("programName"),
            "databaseName": s.get("databaseName"),
        }
        for s in sessions
    ]

    blocking_snapshots = [
        {
            "id": _new_id(),
            "tenantId": DEFAULT_TENANT_ID,
            "dbInstanceId": db_instance_id,
            "snapshotTime": lock["collectTime"],
            "blockerSessionId": str(lock["blockerSessionId"]),
            "blockedSessionId": str(lock["blockedSessionId"]),
            "lockType": lock["lockType"],
            "waitMs": int(lock["waitMs"]),
            "objectName": lock.get("objectName"),
        }
        for lock in locks
    ]

    sql_performance = [
        {
            "id": _new_id(),
            "tenantId": DEFAULT_TENANT_ID,
            "dbInstanceId": db_instance_id,
            "metricTime": sql["collectTime"],
            "sqlId": sql["sqlId"],
            "sqlTextMasked": sql["sqlTextMasked"],
            "executions": int(sql["executions"]),
            "avgElapsedMs": float(sql["avgElapsedMs"]),
            "totalCpuMs": float(sql["totalCpuMs"]),
            "totalLogicalReads": sql.get("totalLogicalReads"),
            "lastExecutionTime": sql.get("lastExecutionTime"),
        }
        for sql in sql_items
    ]

    deadlock_records = [
        {
            "id": _new_id(),
            "tenantId": DEFAULT_TENANT_ID,
            "dbInstanceId": db_instance_id,
            "occurredAt": d["occurredAt"],
            "victimSessionId": str(d["victimSessionId"]),
            "graphXml": d["graphXml"],
        }
        for d in deadlocks
    ]

    sql_plan_snapshots = [
        {
            "id": _new_id(),
            "tenantId": DEFAULT_TENANT_ID,
            "dbInstanceId": db_instance_id,
            "capturedAt": p["collectTime"],
            "sqlId": p["sqlId"],
            "planHash": p["planHash"],
            "planText": p["planText"],
            "avgElapsedMs": float(p["avgElapsedMs"]),
            "totalCpuMs": float(p["totalCpuMs"]),
            "totalLogicalReads": p.get("totalLogicalReads"),
            "executions": int(p["executions"]),
        }
        for p in sql_plans
    ]

    return {
        "collectionRun": collection_run,
        "metricHistory": metric_history,
        "sessionSnapshots": session_snapshots,
        "blockingSnapshots": blocking_snapshots,
        "sqlPerformance": sql_performance,
        "deadlocks": deadlock_records,
        "sqlPlanSnapshots": sql_plan_snapshots,
    }