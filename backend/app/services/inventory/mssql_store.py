"""MSSQL 업무 시스템·DB 인스턴스 조회입니다."""

from __future__ import annotations

from app.integrations.mssql.pool import mssql_connection
from app.services.storage.mappers import to_business_system, to_db_instance
from src.config.storage_backend import DEFAULT_TENANT_ID


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