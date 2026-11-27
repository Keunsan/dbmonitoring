"""Collector 스케줄러·수동 실행 (AS-IS scripts/worker/collector.ts 동등)."""

from __future__ import annotations

import os
import threading
from datetime import datetime, timedelta, timezone

from app.services.collector.adapters import azure_sql_stub, mssql, oracle_stub
from app.services.inventory.facade import get_db_instance, list_db_instances, update_collect_status
from app.services.storage.facade import save_collector_run
from src.config import storage_backend

_SCHEDULER_LOCK = threading.Lock()
_SCHEDULER_STARTED = False
_INSTANCE_STATUS: dict[str, dict] = {}
_RUNTIME: dict = {
    "startedAt": None,
    "lastTickAt": None,
    "isTickRunning": False,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_disabled() -> bool:
    return os.getenv("COLLECTOR_SCHEDULER_DISABLED", "").lower() == "true"


def _status(instance: dict) -> dict:
    instance_id = instance["id"]
    interval = int(instance.get("collectIntervalSec") or 60)
    if instance_id not in _INSTANCE_STATUS:
        _INSTANCE_STATUS[instance_id] = {
            "dbInstanceId": instance_id,
            "lastRunAt": None,
            "nextRunAt": None,
            "consecutiveFailures": 0,
            "lastStatus": None,
            "lastErrorMessage": None,
            "isRunning": False,
            "collectIntervalSec": interval,
        }
    _INSTANCE_STATUS[instance_id]["collectIntervalSec"] = interval
    return _INSTANCE_STATUS[instance_id]


def list_scheduler_statuses() -> list[dict]:
    return [_status(item) for item in list_db_instances() if item.get("isActive")]


def _adapter_for(instance: dict):
    dbms = (instance.get("dbmsType") or "").upper()
    if dbms == "MSSQL":
        return mssql
    if dbms == "ORACLE":
        return oracle_stub
    if dbms in ("AZURE_SQL", "AZURESQL"):
        return azure_sql_stub
    return mssql


def _run_instance(instance: dict, *, scope: str = "full") -> dict:
    status = _status(instance)
    status["isRunning"] = True
    adapter = _adapter_for(instance)
    context = {
        "dbInstanceId": instance["id"],
        "dbmsType": instance.get("dbmsType"),
        "connectionSecretRef": instance.get("connectionSecretRef"),
        "host": instance.get("host"),
        "port": instance.get("port"),
        "databaseName": instance.get("databaseName"),
    }
    use_persistent_backend = (
        storage_backend.use_mssql_backend() or storage_backend.use_supabase_backend()
    )
    try:
        try:
            payload = adapter.collect(context, scope=scope)
        except Exception:
            if not use_persistent_backend:
                payload = mssql.collect_dev_fallback(instance["id"], scope=scope)
            else:
                raise
        if (
            not use_persistent_backend
            and payload.get("status") == "FAIL"
            and not payload.get("metrics")
        ):
            payload = mssql.collect_dev_fallback(instance["id"], scope=scope)

        payload["dbInstanceId"] = instance["id"]
        try:
            save_collector_run(payload, sessions_only=scope == "sessions")
        except Exception as save_exc:
            payload["status"] = "FAIL"
            payload["errorMessage"] = f"수집 결과 저장에 실패했습니다: {save_exc}"
            update_collect_status(
                instance["id"],
                status="FAIL",
                error_message=payload["errorMessage"],
            )
            status["lastRunAt"] = payload.get("finishedAt") or _now()
            status["lastStatus"] = "FAIL"
            status["lastErrorMessage"] = payload["errorMessage"]
            status["consecutiveFailures"] = status["consecutiveFailures"] + 1
            return payload
        update_collect_status(
            instance["id"],
            status=payload.get("status") or "SUCCESS",
            error_message=payload.get("errorMessage"),
        )
        status["lastRunAt"] = payload.get("finishedAt") or _now()
        status["lastStatus"] = payload.get("status")
        status["lastErrorMessage"] = payload.get("errorMessage")
        status["consecutiveFailures"] = (
            0 if payload.get("status") == "SUCCESS" else status["consecutiveFailures"] + 1
        )
        interval = int(instance.get("collectIntervalSec") or 60)
        status["nextRunAt"] = (
            datetime.now(timezone.utc) + timedelta(seconds=interval)
        ).isoformat()
        return payload
    finally:
        status["isRunning"] = False


def run_collector_for_instance(db_instance_id: str, *, scope: str = "full") -> dict:
    instance = get_db_instance(db_instance_id)
    if not instance:
        raise ValueError("DB 인스턴스를 찾을 수 없습니다.")
    return _run_instance(instance, scope=scope)


def run_collector_once() -> list[dict]:
    results = []
    for instance in list_db_instances():
        if instance.get("isActive"):
            results.append(_run_instance(instance, scope="full"))
    return results


def start_collector_scheduler() -> None:
    global _SCHEDULER_STARTED
    if _is_disabled() or _SCHEDULER_STARTED:
        return
    with _SCHEDULER_LOCK:
        if _SCHEDULER_STARTED:
            return
        _SCHEDULER_STARTED = True
        _RUNTIME["startedAt"] = _now()

        def tick() -> None:
            if _RUNTIME["isTickRunning"]:
                return
            _RUNTIME["isTickRunning"] = True
            _RUNTIME["lastTickAt"] = _now()
            try:
                now_ms = datetime.now(timezone.utc).timestamp() * 1000
                for instance in list_db_instances():
                    if not instance.get("isActive"):
                        continue
                    status = _status(instance)
                    if status["isRunning"]:
                        continue
                    if not status["lastRunAt"]:
                        _run_instance(instance)
                        continue
                    elapsed = now_ms - datetime.fromisoformat(
                        status["lastRunAt"].replace("Z", "+00:00")
                    ).timestamp() * 1000
                    if elapsed >= status["collectIntervalSec"] * 1000:
                        _run_instance(instance)
            finally:
                _RUNTIME["isTickRunning"] = False

        timer = threading.Timer(1.0, tick)
        timer.daemon = True
        timer.start()

        def loop() -> None:
            while _SCHEDULER_STARTED:
                tick()
                threading.Event().wait(1.0)

        thread = threading.Thread(target=loop, daemon=True, name="collector-scheduler")
        thread.start()