"""수집 요약 실패 시 빈 MonitoringSummary입니다."""

from __future__ import annotations

from app.services.monitoring.resource_summary import build_resource_summary


def create_empty_monitoring_summary(db_instance_id: str) -> dict:
    return {
        "dbInstanceId": db_instance_id,
        "lastRun": None,
        "latestMetrics": [],
        "resourceSummary": build_resource_summary([]),
        "latestSessions": [],
        "latestSql": [],
        "blockingCount": 0,
        "deadlockCount": 0,
    }