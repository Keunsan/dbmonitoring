"""MSSQL 업무 시스템·DB 인스턴스 조회·변경입니다."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.integrations.mssql.pool import mssql_connection
from app.services.storage.mappers import to_business_system, to_db_instance
from src.config.storage_backend import DEFAULT_TENANT_ID
from src.errors.api_route import ApiRouteError


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


def list_business_systems_mssql() -> list[dict]:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM dbo.business_system
                WHERE tenant_id = %s
                ORDER BY created_at ASC
                """,
                (DEFAULT_TENANT_ID,),
            )
            rows = cur.fetchall()
    return [to_business_system(row) for row in rows]


def list_db_instances_mssql() -> list[dict]:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM dbo.db_instance
                WHERE tenant_id = %s
                ORDER BY created_at ASC
                """,
                (DEFAULT_TENANT_ID,),
            )
            rows = cur.fetchall()
    return [to_db_instance(row) for row in rows]


def get_db_instance_mssql(instance_id: str) -> dict | None:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM dbo.db_instance
                WHERE id = %s AND tenant_id = %s
                """,
                (instance_id, DEFAULT_TENANT_ID),
            )
            row = cur.fetchone()
    return to_db_instance(row) if row else None


def create_business_system_mssql(payload: dict) -> dict:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM dbo.business_system
                WHERE tenant_id = %s AND code = %s
                """,
                (DEFAULT_TENANT_ID, payload["code"]),
            )
            if cur.fetchone():
                raise ApiRouteError(
                    code="VALIDATION_ERROR",
                    message="이미 등록된 업무 코드입니다.",
                    status=400,
                )
            record_id = _new_id()
            ts = _now()
            cur.execute(
                """
                INSERT INTO dbo.business_system (
                    id, tenant_id, code, name, importance,
                    owner_dept, owner_name, owner_email, created_at, updated_at
                )
                OUTPUT INSERTED.*
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    record_id,
                    DEFAULT_TENANT_ID,
                    payload["code"],
                    payload["name"],
                    payload["importance"],
                    payload.get("ownerDept"),
                    payload.get("ownerName"),
                    payload.get("ownerEmail"),
                    ts,
                    ts,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return to_business_system(row)


def update_business_system_mssql(record_id: str, payload: dict) -> dict:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dbo.business_system
                SET name = %s, importance = %s,
                    owner_dept = %s, owner_name = %s, owner_email = %s, updated_at = %s
                OUTPUT INSERTED.*
                WHERE id = %s AND tenant_id = %s
                """,
                (
                    payload["name"],
                    payload["importance"],
                    payload.get("ownerDept"),
                    payload.get("ownerName"),
                    payload.get("ownerEmail"),
                    _now(),
                    record_id,
                    DEFAULT_TENANT_ID,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="업무 시스템을 찾을 수 없습니다.",
            status=404,
        )
    return to_business_system(row)


def delete_business_system_mssql(record_id: str) -> None:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(1) AS cnt FROM dbo.db_instance
                WHERE business_system_id = %s
                """,
                (record_id,),
            )
            count_row = cur.fetchone() or {}
            if int(count_row.get("cnt") or 0) > 0:
                raise ApiRouteError(
                    code="BUSINESS_SYSTEM_IN_USE",
                    message="DB 인스턴스가 연결된 업무 시스템은 삭제할 수 없습니다.",
                    status=409,
                )
            cur.execute(
                """
                DELETE FROM dbo.business_system
                OUTPUT DELETED.id
                WHERE id = %s AND tenant_id = %s
                """,
                (record_id, DEFAULT_TENANT_ID),
            )
            deleted = cur.fetchone()
        conn.commit()
    if not deleted:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="업무 시스템을 찾을 수 없습니다.",
            status=404,
        )


def create_db_instance_mssql(payload: dict) -> dict:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM dbo.business_system
                WHERE id = %s AND tenant_id = %s
                """,
                (payload["businessSystemId"], DEFAULT_TENANT_ID),
            )
            if not cur.fetchone():
                raise ApiRouteError(
                    code="VALIDATION_ERROR",
                    message="업무 시스템을 먼저 등록해주세요.",
                    status=400,
                )
            record_id = _new_id()
            ts = _now()
            cur.execute(
                """
                INSERT INTO dbo.db_instance (
                    id, tenant_id, dbms_type, instance_name, host, port,
                    service_name, database_name, business_system_id, importance,
                    env_type, collector_type, collector_id, collect_interval_sec,
                    sql_aggregate_interval_sec, is_active, connection_secret_ref,
                    created_at, updated_at
                )
                OUTPUT INSERTED.*
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    record_id,
                    DEFAULT_TENANT_ID,
                    payload["dbmsType"],
                    payload["instanceName"],
                    payload["host"],
                    payload["port"],
                    payload.get("serviceName"),
                    payload.get("databaseName"),
                    payload["businessSystemId"],
                    payload["importance"],
                    payload["envType"],
                    payload["collectorType"],
                    payload.get("collectorId"),
                    payload["collectIntervalSec"],
                    payload["sqlAggregateIntervalSec"],
                    1 if payload["isActive"] else 0,
                    payload.get("connectionSecretRef"),
                    ts,
                    ts,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return to_db_instance(row)


def update_db_instance_mssql(instance_id: str, patch: dict) -> dict:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            allowed = {
                k: v
                for k, v in patch.items()
                if k
                in (
                    "instanceName",
                    "host",
                    "port",
                    "serviceName",
                    "databaseName",
                    "importance",
                    "envType",
                    "collectorType",
                    "collectorId",
                    "collectIntervalSec",
                    "sqlAggregateIntervalSec",
                    "isActive",
                    "connectionSecretRef",
                )
            }
            if not allowed:
                instance = get_db_instance_mssql(instance_id)
                if not instance:
                    raise ApiRouteError(
                        code="NOT_FOUND",
                        message="DB 인스턴스를 찾을 수 없습니다.",
                        status=404,
                    )
                return instance
            keys = list(allowed.keys())
            values: list = []
            for key in keys:
                val = allowed[key]
                if key == "isActive":
                    val = 1 if val else 0
                values.append(val)
            sets = ", ".join(f"{_camel_to_snake(k)} = %s" for k in keys)
            values.extend([_now(), instance_id, DEFAULT_TENANT_ID])
            cur.execute(
                f"""
                UPDATE dbo.db_instance
                SET {sets}, updated_at = %s
                OUTPUT INSERTED.*
                WHERE id = %s AND tenant_id = %s
                """,
                tuple(values),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )
    return to_db_instance(row)


def _camel_to_snake(key: str) -> str:
    mapping = {
        "instanceName": "instance_name",
        "serviceName": "service_name",
        "databaseName": "database_name",
        "envType": "env_type",
        "collectorType": "collector_type",
        "collectorId": "collector_id",
        "collectIntervalSec": "collect_interval_sec",
        "sqlAggregateIntervalSec": "sql_aggregate_interval_sec",
        "isActive": "is_active",
        "connectionSecretRef": "connection_secret_ref",
    }
    return mapping.get(key, key)


def delete_db_instance_mssql(instance_id: str) -> None:
    from app.services.inventory.purge_db_instance_data import (
        purge_db_instance_operational_data_mssql,
    )

    purge_db_instance_operational_data_mssql(instance_id)
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM dbo.db_instance OUTPUT DELETED.id
                WHERE id = %s AND tenant_id = %s
                """,
                (instance_id, DEFAULT_TENANT_ID),
            )
            deleted = cur.fetchone()
        conn.commit()
    if not deleted:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )


def update_collection_settings_mssql(instance_id: str, settings: dict) -> dict:
    return update_db_instance_mssql(
        instance_id,
        {
            "collectorId": settings.get("collectorId"),
            "collectIntervalSec": settings["collectIntervalSec"],
            "sqlAggregateIntervalSec": settings["sqlAggregateIntervalSec"],
            "isActive": settings["isActive"],
        },
    )


def update_db_instance_secret_ref_mssql(instance_id: str, secret_ref: str) -> dict:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dbo.db_instance
                SET connection_secret_ref = %s, updated_at = %s
                OUTPUT INSERTED.*
                WHERE id = %s AND tenant_id = %s
                """,
                (secret_ref, _now(), instance_id, DEFAULT_TENANT_ID),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )
    return to_db_instance(row)


def update_collect_status_mssql(instance_id: str, *, status: str) -> dict:
    ts = _now()
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dbo.db_instance
                SET last_collect_status = %s, last_collect_at = %s, updated_at = %s
                OUTPUT INSERTED.*
                WHERE id = %s AND tenant_id = %s
                """,
                (status, ts, ts, instance_id, DEFAULT_TENANT_ID),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )
    return to_db_instance(row)