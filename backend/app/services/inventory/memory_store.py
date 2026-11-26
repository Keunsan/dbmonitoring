"""개발용 인메모리 업무 시스템·DB 인스턴스 (AS-IS createInitialState)."""

from __future__ import annotations

from datetime import datetime, timezone

from src.config.storage_backend import DEFAULT_TENANT_ID

_MEMORY: dict | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seed() -> dict:
    created = _now()
    business_system_id = "bs_erp"
    return {
        "business_systems": [
            {
                "id": business_system_id,
                "tenantId": DEFAULT_TENANT_ID,
                "code": "ERP",
                "name": "ERP 테스트",
                "importance": "HIGH",
                "ownerDept": "IT 운영팀",
                "ownerName": "운영 담당자",
                "ownerEmail": "ops@example.com",
                "createdAt": created,
                "updatedAt": created,
            }
        ],
        "db_instances": [
            {
                "id": "db_erp_test",
                "tenantId": DEFAULT_TENANT_ID,
                "dbmsType": "MSSQL",
                "instanceName": "ERP 테스트 MSSQL",
                "host": "ERP_TEST_DB_HOST",
                "port": 1433,
                "serviceName": None,
                "databaseName": "WONIK_TEST",
                "businessSystemId": business_system_id,
                "importance": "HIGH",
                "envType": "DEV",
                "collectorType": "AGENTLESS",
                "collectorId": "local-dev-collector",
                "collectIntervalSec": 60,
                "sqlAggregateIntervalSec": 300,
                "isActive": True,
                "connectionSecretRef": "env:ERP_TEST_DB",
                "connectionUsername": None,
                "lastCollectAt": None,
                "lastCollectStatus": None,
                "lastConnectionTestAt": None,
                "lastConnectionTestStatus": None,
                "createdAt": created,
                "updatedAt": created,
            }
        ],
    }


def _state() -> dict:
    global _MEMORY
    if _MEMORY is None:
        _MEMORY = _seed()
    return _MEMORY


def list_business_systems_memory() -> list[dict]:
    return list(_state()["business_systems"])


def list_db_instances_memory() -> list[dict]:
    return list(_state()["db_instances"])


def get_db_instance_memory(instance_id: str) -> dict | None:
    for item in _state()["db_instances"]:
        if item["id"] == instance_id:
            return dict(item)
    return None


def create_db_instance_memory(payload: dict) -> dict:
    created = _now()
    instance_id = payload.get("id") or f"db_{len(_state()['db_instances']) + 1}"
    record = {
        "id": instance_id,
        "tenantId": DEFAULT_TENANT_ID,
        "dbmsType": payload.get("dbmsType", "MSSQL"),
        "instanceName": payload["instanceName"],
        "host": payload["host"],
        "port": int(payload.get("port", 1433)),
        "serviceName": payload.get("serviceName"),
        "databaseName": payload.get("databaseName"),
        "businessSystemId": payload["businessSystemId"],
        "importance": payload.get("importance", "MEDIUM"),
        "envType": payload.get("envType", "DEV"),
        "collectorType": payload.get("collectorType", "AGENTLESS"),
        "collectorId": payload.get("collectorId"),
        "collectIntervalSec": int(payload.get("collectIntervalSec", 60)),
        "sqlAggregateIntervalSec": int(payload.get("sqlAggregateIntervalSec", 300)),
        "isActive": bool(payload.get("isActive", True)),
        "connectionSecretRef": payload.get("connectionSecretRef") or "env:ERP_TEST_DB",
        "connectionUsername": payload.get("connectionUsername"),
        "lastCollectAt": None,
        "lastCollectStatus": None,
        "lastConnectionTestAt": None,
        "lastConnectionTestStatus": None,
        "createdAt": created,
        "updatedAt": created,
    }
    _state()["db_instances"].append(record)
    return record


def update_db_instance_memory(instance_id: str, patch: dict) -> dict:
    for index, item in enumerate(_state()["db_instances"]):
        if item["id"] == instance_id:
            updated = {**item, **patch, "updatedAt": _now()}
            _state()["db_instances"][index] = updated
            return updated
    raise KeyError(instance_id)


def delete_db_instance_memory(instance_id: str) -> None:
    before = len(_state()["db_instances"])
    _state()["db_instances"] = [
        item for item in _state()["db_instances"] if item["id"] != instance_id
    ]
    if len(_state()["db_instances"]) == before:
        raise KeyError(instance_id)


def update_collect_status_memory(
    instance_id: str,
    *,
    status: str,
    error_message: str | None,
) -> dict:
    return update_db_instance_memory(
        instance_id,
        {
            "lastCollectAt": _now(),
            "lastCollectStatus": status,
            "lastConnectionTestStatus": None,
        },
    )