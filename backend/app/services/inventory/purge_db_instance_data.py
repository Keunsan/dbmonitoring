"""DB 인스턴스 삭제 시 연관 운영 데이터를 purge 합니다 (AS-IS mssql-store)."""

from __future__ import annotations

from app.integrations.mssql.pool import mssql_connection

_PURGE_TABLES = (
    "sql_regression_event",
    "sql_plan_snapshot",
    "sql_performance",
    "deadlock_event",
    "blocking_snapshot",
    "session_snapshot",
    "metric_history",
    "collection_run",
)


def purge_db_instance_operational_data_mssql(db_instance_id: str) -> None:
    with mssql_connection() as conn:
        with conn.cursor() as cur:
            for table in _PURGE_TABLES:
                cur.execute(
                    f"DELETE FROM dbo.{table} WHERE db_instance_id = %s",
                    (db_instance_id,),
                )
        conn.commit()