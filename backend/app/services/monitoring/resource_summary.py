"""최신 metric 스냅샷에서 resourceSummary를 계산합니다."""

from __future__ import annotations

from app.services.monitoring.metric_keys import SERVER_METRIC_KEYS


def _metric_value(metrics: list[dict], key: str) -> float | None:
    for metric in metrics:
        if metric.get("metricName") == key:
            return metric.get("metricValue")
    return None


def build_resource_summary(metrics: list[dict]) -> dict:
    data_used = _metric_value(metrics, SERVER_METRIC_KEYS["storageDataUsedMb"])
    data_size = _metric_value(metrics, SERVER_METRIC_KEYS["storageDataSizeMb"])
    storage_used_percent = None
    if data_used is not None and data_size is not None and data_size > 0:
        storage_used_percent = (data_used / data_size) * 100

    return {
        "cpuUsedPercent": _metric_value(metrics, SERVER_METRIC_KEYS["cpuUsedPercent"]),
        "memoryUsedPercent": _metric_value(metrics, SERVER_METRIC_KEYS["memoryUsedPercent"]),
        "memoryAvailableMb": _metric_value(metrics, SERVER_METRIC_KEYS["memoryAvailableMb"]),
        "pageLifeExpectancy": _metric_value(metrics, SERVER_METRIC_KEYS["pageLifeExpectancy"]),
        "memoryGrantsPending": _metric_value(metrics, SERVER_METRIC_KEYS["memoryGrantsPending"]),
        "diskReadIops": _metric_value(metrics, SERVER_METRIC_KEYS["diskReadIops"]),
        "diskWriteIops": _metric_value(metrics, SERVER_METRIC_KEYS["diskWriteIops"]),
        "diskReadLatencyMs": _metric_value(metrics, SERVER_METRIC_KEYS["diskReadLatencyMs"]),
        "diskWriteLatencyMs": _metric_value(metrics, SERVER_METRIC_KEYS["diskWriteLatencyMs"]),
        "storageUsedPercent": storage_used_percent,
        "logUsedPercent": _metric_value(metrics, SERVER_METRIC_KEYS["logUsedPercent"]),
        "tempdbUsedMb": _metric_value(metrics, SERVER_METRIC_KEYS["tempdbUsedMb"]),
        "batchRequestsPerSec": _metric_value(metrics, SERVER_METRIC_KEYS["batchRequestsPerSec"]),
        "transactionsPerSec": _metric_value(metrics, SERVER_METRIC_KEYS["transactionsPerSec"]),
        "userConnections": _metric_value(metrics, SERVER_METRIC_KEYS["userConnections"]),
        "processesBlocked": _metric_value(metrics, SERVER_METRIC_KEYS["processesBlocked"]),
        "sessionTotalCount": _metric_value(metrics, SERVER_METRIC_KEYS["sessionTotalCount"]),
        "sessionActiveCount": _metric_value(metrics, SERVER_METRIC_KEYS["sessionActiveCount"]),
        "sessionIdleCount": _metric_value(metrics, SERVER_METRIC_KEYS["sessionIdleCount"]),
        "sessionRunningSqlCount": _metric_value(metrics, SERVER_METRIC_KEYS["sessionRunningSqlCount"]),
    }