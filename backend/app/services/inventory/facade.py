"""인벤토리 조회·변경 facade (MSSQL → Supabase → 메모리)."""



from __future__ import annotations



from app.services.inventory import memory_store, mssql_store, supabase_store

from src.config import storage_backend

from src.errors.api_route import ApiRouteError





def list_business_systems() -> list[dict]:

    if storage_backend.use_mssql_backend():

        return mssql_store.list_business_systems_mssql()

    if storage_backend.use_supabase_backend():

        return supabase_store.list_business_systems_supabase()

    return memory_store.list_business_systems_memory()





def create_business_system(payload: dict) -> dict:

    if storage_backend.use_mssql_backend():

        return mssql_store.create_business_system_mssql(payload)

    if storage_backend.use_supabase_backend():

        return supabase_store.create_business_system_supabase(payload)

    return memory_store.create_business_system_memory(payload)





def update_business_system(record_id: str, payload: dict) -> dict:

    if storage_backend.use_mssql_backend():

        return mssql_store.update_business_system_mssql(record_id, payload)

    if storage_backend.use_supabase_backend():

        return supabase_store.update_business_system_supabase(record_id, payload)

    try:

        return memory_store.update_business_system_memory(record_id, payload)

    except KeyError as exc:

        raise ApiRouteError(

            code="NOT_FOUND",

            message="업무 시스템을 찾을 수 없습니다.",

            status=404,

        ) from exc





def delete_business_system(record_id: str) -> None:

    if storage_backend.use_mssql_backend():

        mssql_store.delete_business_system_mssql(record_id)

        return

    if storage_backend.use_supabase_backend():

        supabase_store.delete_business_system_supabase(record_id)

        return

    try:

        memory_store.delete_business_system_memory(record_id)

    except KeyError as exc:

        raise ApiRouteError(

            code="NOT_FOUND",

            message="업무 시스템을 찾을 수 없습니다.",

            status=404,

        ) from exc





def list_db_instances() -> list[dict]:

    if storage_backend.use_mssql_backend():

        return mssql_store.list_db_instances_mssql()

    if storage_backend.use_supabase_backend():

        return supabase_store.list_db_instances_supabase()

    return memory_store.list_db_instances_memory()





def get_db_instance(instance_id: str) -> dict | None:

    if storage_backend.use_mssql_backend():

        return mssql_store.get_db_instance_mssql(instance_id)

    if storage_backend.use_supabase_backend():

        return supabase_store.get_db_instance_supabase(instance_id)

    return memory_store.get_db_instance_memory(instance_id)





def create_db_instance(payload: dict) -> dict:

    if storage_backend.use_mssql_backend():

        return mssql_store.create_db_instance_mssql(payload)

    if storage_backend.use_supabase_backend():

        return supabase_store.create_db_instance_supabase(payload)

    return memory_store.create_db_instance_memory(payload)





def update_db_instance(instance_id: str, patch: dict) -> dict:

    if storage_backend.use_mssql_backend():

        return mssql_store.update_db_instance_mssql(instance_id, patch)

    if storage_backend.use_supabase_backend():

        return supabase_store.update_db_instance_supabase(instance_id, patch)

    try:

        return memory_store.update_db_instance_memory(instance_id, patch)

    except KeyError as exc:

        raise ApiRouteError(

            code="NOT_FOUND",

            message="DB 인스턴스를 찾을 수 없습니다.",

            status=404,

        ) from exc





def delete_db_instance(instance_id: str) -> None:

    if storage_backend.use_mssql_backend():

        mssql_store.delete_db_instance_mssql(instance_id)

        return

    if storage_backend.use_supabase_backend():

        supabase_store.delete_db_instance_supabase(instance_id)

        return

    try:

        memory_store.delete_db_instance_memory(instance_id)

    except KeyError as exc:

        raise ApiRouteError(

            code="NOT_FOUND",

            message="DB 인스턴스를 찾을 수 없습니다.",

            status=404,

        ) from exc





def get_collection_settings(instance_id: str) -> dict:

    instance = get_db_instance(instance_id)

    if not instance:

        raise ApiRouteError(

            code="NOT_FOUND",

            message="DB 인스턴스를 찾을 수 없습니다.",

            status=404,

        )

    if storage_backend.use_mssql_backend() or storage_backend.use_supabase_backend():

        return {

            "collectorId": instance.get("collectorId"),

            "collectIntervalSec": instance.get("collectIntervalSec"),

            "sqlAggregateIntervalSec": instance.get("sqlAggregateIntervalSec"),

            "isActive": instance.get("isActive"),

            "lastCollectAt": instance.get("lastCollectAt"),

            "lastCollectStatus": instance.get("lastCollectStatus"),

        }

    return memory_store.get_collection_settings_memory(instance_id)





def update_collection_settings(instance_id: str, settings: dict) -> dict:

    if storage_backend.use_mssql_backend():

        return mssql_store.update_collection_settings_mssql(instance_id, settings)

    if storage_backend.use_supabase_backend():

        return supabase_store.update_collection_settings_supabase(instance_id, settings)

    try:

        return memory_store.update_collection_settings_memory(instance_id, settings)

    except KeyError as exc:

        raise ApiRouteError(

            code="NOT_FOUND",

            message="DB 인스턴스를 찾을 수 없습니다.",

            status=404,

        ) from exc





def update_db_instance_secret_ref(instance_id: str, secret_ref: str) -> dict:

    if storage_backend.use_mssql_backend():

        return mssql_store.update_db_instance_secret_ref_mssql(instance_id, secret_ref)

    if storage_backend.use_supabase_backend():

        return supabase_store.update_db_instance_secret_ref_supabase(instance_id, secret_ref)

    try:

        return memory_store.update_db_instance_secret_ref_memory(instance_id, secret_ref)

    except KeyError as exc:

        raise ApiRouteError(

            code="NOT_FOUND",

            message="DB 인스턴스를 찾을 수 없습니다.",

            status=404,

        ) from exc





def update_collect_status(

    instance_id: str,

    *,

    status: str,

    error_message: str | None,

) -> dict:

    if storage_backend.use_mssql_backend():

        return mssql_store.update_collect_status_mssql(instance_id, status=status)

    return memory_store.update_collect_status_memory(

        instance_id,

        status=status,

        error_message=error_message,

    )
