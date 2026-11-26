"""지표 수가 가장 많은 스냅샷을 고릅니다."""

from __future__ import annotations


def pick_fullest_metric_snapshot(metrics: list[dict]) -> list[dict]:
    if not metrics:
        return []

    groups: dict[str, list[dict]] = {}
    for metric in metrics:
        key = str(metric.get("metricTime", ""))
        groups.setdefault(key, []).append(metric)

    fullest: list[dict] = []
    for group in groups.values():
        if len(group) > len(fullest):
            fullest = group

    if fullest:
        return fullest

    latest_time = max(str(m.get("metricTime", "")) for m in metrics)
    return [m for m in metrics if str(m.get("metricTime")) == latest_time]