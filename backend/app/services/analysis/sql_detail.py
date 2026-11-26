"""SQL 상세 분석 화면용 데이터를 조합합니다."""

from __future__ import annotations

from app.services.storage.facade import list_sql_performance, list_sql_plan_snapshots


def _percent_change(current: float, baseline: float | None) -> float | None:
    if baseline is None or baseline <= 0:
        return None
    return ((current - baseline) / baseline) * 100


def get_sql_detail_view(db_instance_id: str, sql_id: str) -> dict | None:
    """SQL ID 기준 상세 분석 데이터를 반환합니다."""
    history = sorted(
        list_sql_performance(db_instance_id, 100, sql_id),
        key=lambda item: item["metricTime"],
    )
    if not history:
        return None

    latest = history[-1]
    baseline = history[0] if len(history) > 1 else None
    plans = list_sql_plan_snapshots(db_instance_id=db_instance_id, sql_id=sql_id, limit=20)

    return {
        "sqlId": sql_id,
        "latest": latest,
        "history": history,
        "plans": plans,
        "performanceChange": {
            "avgElapsedChangePercent": _percent_change(
                float(latest["avgElapsedMs"]),
                float(baseline["avgElapsedMs"]) if baseline else None,
            ),
            "cpuChangePercent": _percent_change(
                float(latest["totalCpuMs"]),
                float(baseline["totalCpuMs"]) if baseline else None,
            ),
        },
    }