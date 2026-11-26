"""PostgreSQL/MSSQL 행 → AS-IS camelCase JSON 매핑입니다."""

from __future__ import annotations

import json
from typing import Any


def _iso(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _parse_tags(value: Any) -> dict[str, str]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return {str(k): str(v) for k, v in value.items()}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return {str(k): str(v) for k, v in parsed.items()}
        except json.JSONDecodeError:
            return {}
    return {}


def to_business_system(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "code": row["code"],
        "name": row["name"],
        "importance": row["importance"],
        "ownerDept": row.get("owner_dept"),
        "ownerName": row.get("owner_name"),
        "ownerEmail": row.get("owner_email"),
        "createdAt": _iso(row["created_at"]),
        "updatedAt": _iso(row["updated_at"]),
    }


def to_db_instance(row: dict[str, Any], *, connection_username: str | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "dbmsType": row["dbms_type"],
        "instanceName": row["instance_name"],
        "host": row["host"],
        "port": int(row["port"]),
        "serviceName": row.get("service_name"),
        "databaseName": row.get("database_name"),
        "businessSystemId": row["business_system_id"],
        "importance": row["importance"],
        "envType": row["env_type"],
        "collectorType": row["collector_type"],
        "collectorId": row.get("collector_id"),
        "collectIntervalSec": int(row["collect_interval_sec"]),
        "sqlAggregateIntervalSec": int(row["sql_aggregate_interval_sec"]),
        "isActive": bool(row["is_active"]),
        "connectionSecretRef": row["connection_secret_ref"],
        "connectionUsername": connection_username,
        "lastCollectAt": _iso(row.get("last_collect_at")),
        "lastCollectStatus": row.get("last_collect_status"),
        "lastConnectionTestAt": _iso(row.get("last_connection_test_at")),
        "lastConnectionTestStatus": row.get("last_connection_test_status"),
        "createdAt": _iso(row["created_at"]),
        "updatedAt": _iso(row["updated_at"]),
    }


def to_collection_run(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "dbInstanceId": row["db_instance_id"],
        "startedAt": _iso(row["started_at"]),
        "finishedAt": _iso(row["finished_at"]),
        "status": row["status"],
        "errorMessage": row.get("error_message"),
        "metricsCount": int(row["metrics_count"]),
        "sessionsCount": int(row["sessions_count"]),
        "locksCount": int(row["locks_count"]),
        "sqlCount": int(row["sql_count"]),
    }


def to_metric_history(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "dbInstanceId": row["db_instance_id"],
        "metricTime": _iso(row["metric_time"]),
        "metricName": row["metric_name"],
        "metricValue": float(row["metric_value"]),
        "unit": row.get("unit"),
        "tags": _parse_tags(row.get("tags")),
    }


def to_session_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "dbInstanceId": row["db_instance_id"],
        "snapshotTime": _iso(row["snapshot_time"]),
        "sessionId": row["session_id"],
        "loginName": row["login_name"],
        "status": row["status"],
        "waitType": row.get("wait_type"),
        "waitMs": row.get("wait_ms"),
        "sqlId": row.get("sql_id"),
        "blockingSessionId": row.get("blocking_session_id"),
        "command": row.get("command"),
        "cpuTimeMs": row.get("cpu_time_ms"),
        "logicalReads": row.get("logical_reads"),
        "sqlTextMasked": row.get("sql_text_masked"),
        "hostName": row.get("host_name"),
        "programName": row.get("program_name"),
        "databaseName": row.get("database_name"),
    }


def to_sql_performance(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "dbInstanceId": row["db_instance_id"],
        "metricTime": _iso(row["metric_time"]),
        "sqlId": row["sql_id"],
        "sqlTextMasked": row["sql_text_masked"],
        "executions": int(row["executions"]),
        "avgElapsedMs": float(row["avg_elapsed_ms"]),
        "totalCpuMs": float(row["total_cpu_ms"]),
        "totalLogicalReads": row.get("total_logical_reads"),
        "lastExecutionTime": _iso(row.get("last_execution_time")),
    }


def to_blocking_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "dbInstanceId": row["db_instance_id"],
        "snapshotTime": _iso(row["snapshot_time"]),
        "blockerSessionId": str(row["blocker_session_id"]),
        "blockedSessionId": str(row["blocked_session_id"]),
        "lockType": row["lock_type"],
        "waitMs": int(row["wait_ms"]),
        "objectName": row.get("object_name"),
    }


def to_deadlock(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "dbInstanceId": row["db_instance_id"],
        "occurredAt": _iso(row["occurred_at"]),
        "victimSessionId": str(row["victim_session_id"]),
        "graphXml": row["graph_xml"],
    }


def to_sql_plan_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "dbInstanceId": row["db_instance_id"],
        "capturedAt": _iso(row["captured_at"]),
        "sqlId": row["sql_id"],
        "planHash": row["plan_hash"],
        "planText": row["plan_text"],
        "avgElapsedMs": float(row["avg_elapsed_ms"]),
        "totalCpuMs": float(row["total_cpu_ms"]),
        "totalLogicalReads": row.get("total_logical_reads"),
        "executions": int(row["executions"]),
    }


def to_sql_regression(row: dict[str, Any]) -> dict[str, Any]:
    issue = row.get("issue_candidate")
    if isinstance(issue, str):
        try:
            issue = json.loads(issue)
        except json.JSONDecodeError:
            issue = {}
    if not isinstance(issue, dict):
        issue = {}

    return {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "dbInstanceId": row["db_instance_id"],
        "detectedAt": _iso(row["detected_at"]),
        "sqlId": row["sql_id"],
        "metricKey": row["metric_key"],
        "baselineValue": float(row["baseline_value"]),
        "currentValue": float(row["current_value"]),
        "changePercent": float(row["change_percent"]),
        "severity": row["severity"],
        "recommendation": row["recommendation"],
        "status": row["status"],
        "issueCandidate": issue,
    }