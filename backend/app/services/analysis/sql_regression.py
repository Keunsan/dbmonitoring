"""SQL 성능 회귀 탐지 (AS-IS lib/analysis/sql-regression.ts 동등)."""

from __future__ import annotations

import uuid
from statistics import mean

from app.services.storage.facade import list_sql_performance, list_sql_regression_events
from src.config.storage_backend import DEFAULT_TENANT_ID

REGRESSION_WARNING_PERCENT = 50.0
REGRESSION_CRITICAL_PERCENT = 100.0
BASELINE_SAMPLE_SIZE = 8


def _build_recommendation(metric_key: str, change_percent: float, sql_id: str) -> str:
    if metric_key == "avgElapsedMs":
        return (
            f"SQL {sql_id}의 평균 수행 시간이 baseline 대비 {change_percent:.1f}% 증가했습니다. "
            "실행 계획 변경, 인덱스 누락, 통계 정보 갱신을 확인하세요."
        )
    if metric_key == "totalCpuMs":
        return (
            f"SQL {sql_id}의 CPU 사용량이 baseline 대비 {change_percent:.1f}% 증가했습니다. "
            "스캔 범위, 조인 순서, 병렬 처리 설정을 점검하세요."
        )
    return f"SQL {sql_id}의 {metric_key} 지표가 baseline 대비 {change_percent:.1f}% 악화되었습니다."


def _detect_metric_regression(
    db_instance_id: str,
    sql_id: str,
    metric_key: str,
    history: list[dict],
) -> dict | None:
    if len(history) < 3:
        return None
    baseline_values = [item["value"] for item in history[:-1][-BASELINE_SAMPLE_SIZE:]]
    baseline = mean(baseline_values) if baseline_values else 0.0
    current = history[-1]["value"]
    if baseline <= 0 or current <= baseline:
        return None
    change_percent = ((current - baseline) / baseline) * 100.0
    if change_percent < REGRESSION_WARNING_PERCENT:
        return None
    severity = "CRITICAL" if change_percent >= REGRESSION_CRITICAL_PERCENT else "WARNING"
    return {
        "id": str(uuid.uuid4()),
        "tenantId": DEFAULT_TENANT_ID,
        "dbInstanceId": db_instance_id,
        "detectedAt": history[-1]["metricTime"],
        "sqlId": sql_id,
        "metricKey": metric_key,
        "baselineValue": baseline,
        "currentValue": current,
        "changePercent": change_percent,
        "severity": severity,
        "recommendation": _build_recommendation(metric_key, change_percent, sql_id),
        "status": "OPEN",
        "issueCandidate": {
            "title": f"SQL 성능 회귀 ({sql_id})",
            "category": "SQL_REGRESSION",
            "severity": severity,
            "metricKey": metric_key,
            "changePercent": change_percent,
        },
    }


def detect_sql_regressions_for_instance(
    db_instance_id: str,
    *,
    history_limit: int = 500,
) -> list[dict]:
    """인스턴스별 SQL 성능 이력에서 회귀 후보를 계산합니다."""
    history = sorted(
        list_sql_performance(db_instance_id, history_limit),
        key=lambda row: row.get("metricTime") or "",
    )
    sql_ids = sorted({row["sqlId"] for row in history if row.get("sqlId")})
    detected: list[dict] = []
    for sql_id in sql_ids:
        sql_history = [row for row in history if row.get("sqlId") == sql_id]
        for metric_key, value_key in (("avgElapsedMs", "avgElapsedMs"), ("totalCpuMs", "totalCpuMs")):
            series = [
                {
                    "metricTime": row["metricTime"],
                    "value": float(row.get(value_key) or 0),
                }
                for row in sql_history
                if row.get("metricTime")
            ]
            event = _detect_metric_regression(db_instance_id, sql_id, metric_key, series)
            if event:
                detected.append(event)
    return detected


def detect_sql_regressions(
    db_instance_id: str | None = None,
) -> dict:
    """전체 또는 단일 인스턴스에 대해 회귀를 탐지하고 신규 항목만 반환합니다."""
    from app.services.inventory.facade import list_db_instances

    targets = (
        [i for i in list_db_instances() if i.get("isActive") and i.get("id") == db_instance_id]
        if db_instance_id
        else [i for i in list_db_instances() if i.get("isActive")]
    )
    existing_keys = {
        (e["dbInstanceId"], e["sqlId"], e["metricKey"], e.get("detectedAt", "")[:10])
        for e in list_sql_regression_events(db_instance_id, limit=500)
    }
    new_events: list[dict] = []
    for instance in targets:
        for event in detect_sql_regressions_for_instance(instance["id"]):
            key = (
                event["dbInstanceId"],
                event["sqlId"],
                event["metricKey"],
                event.get("detectedAt", "")[:10],
            )
            if key not in existing_keys:
                new_events.append(event)
                existing_keys.add(key)
    return {"items": new_events, "detectedCount": len(new_events)}