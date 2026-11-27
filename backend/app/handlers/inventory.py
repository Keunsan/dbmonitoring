"""업무 시스템·DB 인스턴스 API입니다."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.services.collector.adapters import mssql as mssql_adapter
from app.services.inventory.facade import (
    create_business_system,
    create_db_instance,
    delete_business_system,
    delete_db_instance,
    get_collection_settings,
    get_db_instance,
    list_business_systems,
    list_db_instances,
    update_business_system,
    update_collection_settings,
    update_db_instance,
)
from app.services.inventory.validation import (
    parse_business_system_input,
    parse_collection_settings_input,
    parse_connection_secret_input,
    parse_db_instance_input,
)
from app.services.secrets.connection_secret import (
    remove_db_instance_connection_secret,
    save_db_instance_connection_secret,
)
from src.api.dependencies import get_request_id
from src.api.schemas import success_response
from src.errors.api_route import ApiRouteError

router = APIRouter(tags=["admin"])


@router.post("/business-systems")
async def post_business_systems(request: Request) -> dict:
    """업무 시스템을 등록합니다."""
    payload = parse_business_system_input(await request.json())
    record = create_business_system(payload)
    body = success_response(record, meta={"requestId": get_request_id(request)})
    return JSONResponse(content=body, status_code=201)


@router.patch("/business-systems/{record_id}")
async def patch_business_system(request: Request, record_id: str) -> dict:
    payload = parse_business_system_input(await request.json())
    return success_response(
        update_business_system(record_id, payload),
        meta={"requestId": get_request_id(request)},
    )


@router.delete("/business-systems/{record_id}")
def delete_business_system_handler(request: Request, record_id: str) -> dict:
    delete_business_system(record_id)
    return success_response({"deleted": True}, meta={"requestId": get_request_id(request)})


@router.get("/business-systems")
def get_business_systems(request: Request) -> dict:
    """업무 시스템 목록을 반환합니다."""
    return success_response(
        list_business_systems(),
        meta={"requestId": get_request_id(request)},
    )


@router.post("/db-instances")
async def post_db_instances(request: Request) -> dict:
    """DB 인스턴스를 등록합니다."""
    payload = parse_db_instance_input(await request.json())
    instance = create_db_instance(payload)
    body = success_response(instance, meta={"requestId": get_request_id(request)})
    return JSONResponse(content=body, status_code=201)


@router.get("/db-instances/{instance_id}")
def get_db_instance_handler(request: Request, instance_id: str) -> dict:
    instance = get_db_instance(instance_id)
    if not instance:
        raise ApiRouteError(code="NOT_FOUND", message="DB 인스턴스를 찾을 수 없습니다.", status=404)
    return success_response(instance, meta={"requestId": get_request_id(request)})


@router.patch("/db-instances/{instance_id}")
async def patch_db_instance(request: Request, instance_id: str) -> dict:
    payload = await request.json()
    try:
        instance = update_db_instance(instance_id, payload)
    except KeyError as exc:
        raise ApiRouteError(code="NOT_FOUND", message="DB 인스턴스를 찾을 수 없습니다.", status=404) from exc
    return success_response(instance, meta={"requestId": get_request_id(request)})


@router.delete("/db-instances/{instance_id}")
def delete_db_instance_handler(request: Request, instance_id: str) -> dict:
    try:
        delete_db_instance(instance_id)
    except KeyError as exc:
        raise ApiRouteError(code="NOT_FOUND", message="DB 인스턴스를 찾을 수 없습니다.", status=404) from exc
    return success_response({"id": instance_id}, meta={"requestId": get_request_id(request)})


@router.post("/db-instances/{instance_id}/test-connection")
async def test_db_instance_connection(request: Request, instance_id: str) -> dict:
    instance = get_db_instance(instance_id)
    if not instance:
        raise ApiRouteError(code="NOT_FOUND", message="DB 인스턴스를 찾을 수 없습니다.", status=404)
    result = mssql_adapter.test_connection(instance)
    return success_response(result, meta={"requestId": get_request_id(request)})


@router.get("/db-instances/{instance_id}/collection-settings")
def get_collection_settings_handler(request: Request, instance_id: str) -> dict:
    return success_response(
        get_collection_settings(instance_id),
        meta={"requestId": get_request_id(request)},
    )


@router.patch("/db-instances/{instance_id}/collection-settings")
async def patch_collection_settings(request: Request, instance_id: str) -> dict:
    payload = parse_collection_settings_input(await request.json())
    return success_response(
        update_collection_settings(instance_id, payload),
        meta={"requestId": get_request_id(request)},
    )


@router.post("/db-instances/{instance_id}/connection-secret")
async def post_connection_secret(request: Request, instance_id: str) -> dict:
    payload = parse_connection_secret_input(await request.json())
    return success_response(
        save_db_instance_connection_secret(instance_id, payload),
        meta={"requestId": get_request_id(request)},
    )


@router.delete("/db-instances/{instance_id}/connection-secret")
def delete_connection_secret(request: Request, instance_id: str) -> dict:
    return success_response(
        remove_db_instance_connection_secret(instance_id),
        meta={"requestId": get_request_id(request)},
    )


@router.get("/db-instances")
def get_db_instances(request: Request) -> dict:
    """DB 인스턴스 목록과 업무 시스템 참조를 반환합니다."""
    return success_response(
        {
            "items": list_db_instances(),
            "businessSystems": list_business_systems(),
        },
        meta={"requestId": get_request_id(request)},
    )