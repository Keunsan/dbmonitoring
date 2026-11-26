"""모니터링 조회 API입니다."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.services.inventory.facade import list_db_instances
from app.services.storage.empty_summary import create_empty_monitoring_summary
from app.services.storage.facade import get_monitoring_summary, list_metric_history
from src.api.dependencies import get_request_id
from src.api.schemas import success_response
from src.errors.api_route import ApiRouteError
from src.observability.logging import logger

router = APIRouter(tags=["monitoring"])


def _parse_limit(value: int | None) -> int:
    if value is None:
        return 200
    return max(1, min(value, 1000))


@router.get("/monitoring/summary")
def get_monitoring_summary_handler(
    request: Request,
    db_instance_id: str | None = Query(default=None, alias="dbInstanceId"),
) -> dict:
    """DB 인스턴스별 최신 수집 요약을 반환합니다."""
    instances = list_db_instances()
    target_instances = (
        [item for item in instances if item["id"] == db_instance_id.strip()]
        if db_instance_id and db_instance_id.strip()
        else instances
    )

    if db_instance_id and db_instance_id.strip() and not target_instances:
        raise ApiRouteError(
            code="NOT_FOUND",
            message="요청한 DB 인스턴스를 찾을 수 없습니다.",
            status=404,
        )

    items = []
    for instance in target_instances:
        instance_id = instance["id"]
        try:
            summary = get_monitoring_summary(instance_id)
            items.append({"instance": instance, "summary": summary})
        except Exception as exc:
            logger.warning(
                "인스턴스 요약 조회 실패",
                db_instance_id=instance_id,
                reason=str(exc),
            )
            items.append(
                {
                    "instance": instance,
                    "summary": create_empty_monitoring_summary(instance_id),
                }
            )

    return success_response({"items": items}, meta={"requestId": get_request_id(request)})


@router.get("/monitoring/metrics")
def get_monitoring_metrics(
    request: Request,
    db_instance_id: str | None = Query(default=None, alias="dbInstanceId"),
    metric_name: str | None = Query(default=None, alias="metricName"),
    limit: int | None = Query(default=None),
) -> dict:
    """최근 지표 이력을 반환합니다."""
    items = list_metric_history(
        db_instance_id=db_instance_id,
        metric_name=metric_name,
        limit=_parse_limit(limit),
    )
    return success_response({"items": items}, meta={"requestId": get_request_id(request)})


@router.get("/monitoring/sessions")
def get_monitoring_sessions(
    request: Request,
    db_instance_id: str | None = Query(default=None, alias="dbInstanceId"),
    limit: int | None = Query(default=None),
) -> dict:
    """최근 세션 스냅샷을 반환합니다."""
    from app.services.storage.facade import list_session_snapshots

    items = list_session_snapshots(db_instance_id, _parse_limit(limit))
    return success_response({"items": items}, meta={"requestId": get_request_id(request)})


@router.get("/monitoring/sql")
def get_monitoring_sql(
    request: Request,
    db_instance_id: str | None = Query(default=None, alias="dbInstanceId"),
    limit: int | None = Query(default=None),
    sql_id: str | None = Query(default=None, alias="sqlId"),
) -> dict:
    """최근 SQL 성능 집계를 반환합니다."""
    from app.services.storage.facade import list_sql_performance

    items = list_sql_performance(db_instance_id, _parse_limit(limit), sql_id)
    return success_response({"items": items}, meta={"requestId": get_request_id(request)})


@router.get("/monitoring/runs")
def get_monitoring_runs(
    request: Request,
    db_instance_id: str | None = Query(default=None, alias="dbInstanceId"),
) -> dict:
    """Collector 실행 이력을 반환합니다."""
    from app.services.storage.facade import list_collection_runs

    items = list_collection_runs(db_instance_id)
    return success_response({"items": items}, meta={"requestId": get_request_id(request)})


@router.get("/monitoring/blocking")
def get_monitoring_blocking(
    request: Request,
    db_instance_id: str | None = Query(default=None, alias="dbInstanceId"),
    limit: int | None = Query(default=None),
) -> dict:
    """Blocking 스냅샷을 반환합니다."""
    from app.services.storage.facade import list_blocking_snapshots

    items = list_blocking_snapshots(db_instance_id, min(_parse_limit(limit), 500))
    return success_response({"items": items}, meta={"requestId": get_request_id(request)})


@router.get("/monitoring/deadlocks")
def get_monitoring_deadlocks(
    request: Request,
    db_instance_id: str | None = Query(default=None, alias="dbInstanceId"),
    limit: int | None = Query(default=None),
) -> dict:
    """Deadlock 이벤트를 반환합니다."""
    from app.services.storage.facade import list_deadlock_events

    items = list_deadlock_events(db_instance_id, min(_parse_limit(limit), 500))
    return success_response({"items": items}, meta={"requestId": get_request_id(request)})