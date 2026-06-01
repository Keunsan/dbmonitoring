/** Supabase 기반 업무 시스템·DB 인스턴스 메타데이터 저장소입니다. */

import { ApiRouteError, badRequest, notFound } from "@/lib/api";
import {
  toBusinessSystemCreateError,
  toBusinessSystemDeleteError,
  toBusinessSystemUpdateError,
  toDbInstanceCreateError,
  toDbInstanceDeleteError,
  toDbInstanceUpdateError,
} from "@/lib/inventory/purge-db-instance-data";
import { getSupabaseServerClient } from "@/lib/db/supabase-server";
import { buildVaultConnectionSecretRef } from "@/lib/secrets";
import { DEFAULT_TENANT_ID, type CollectStatus } from "@/types/domain";
import type { BusinessSystem, DbInstance } from "@/types/entities";

import type {
  BusinessSystemInput,
  CollectionSettingsInput,
  DbInstanceInput,
} from "./store";

type BusinessSystemRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  importance: BusinessSystem["importance"];
  owner_dept: string | null;
  owner_name: string | null;
  owner_email: string | null;
  created_at: string;
  updated_at: string;
};

type DbInstanceRow = {
  id: string;
  tenant_id: string;
  dbms_type: DbInstance["dbmsType"];
  instance_name: string;
  host: string;
  port: number;
  service_name: string | null;
  database_name: string | null;
  business_system_id: string;
  importance: DbInstance["importance"];
  env_type: DbInstance["envType"];
  collector_type: DbInstance["collectorType"];
  collector_id: string | null;
  collect_interval_sec: number;
  sql_aggregate_interval_sec: number;
  is_active: boolean;
  connection_secret_ref: string;
  last_collect_at: string | null;
  last_collect_status: CollectStatus | null;
  last_connection_test_at: string | null;
  last_connection_test_status: CollectStatus | null;
  created_at: string;
  updated_at: string;
};

const now = () => new Date().toISOString();

const getClient = () => {
  const client = getSupabaseServerClient();

  if (!client) {
    throw new ApiRouteError({
      code: "SUPABASE_NOT_CONFIGURED",
      message: "Supabase 서버 연결 설정이 필요합니다.",
      status: 503,
    });
  }

  return client;
};

const createId = () => crypto.randomUUID();

const toBusinessSystem = (row: BusinessSystemRow): BusinessSystem => ({
  id: row.id,
  tenantId: row.tenant_id,
  code: row.code,
  name: row.name,
  importance: row.importance,
  ownerDept: row.owner_dept,
  ownerName: row.owner_name,
  ownerEmail: row.owner_email,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toDbInstance = (row: DbInstanceRow): DbInstance => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbmsType: row.dbms_type,
  instanceName: row.instance_name,
  host: row.host,
  port: row.port,
  serviceName: row.service_name,
  databaseName: row.database_name,
  businessSystemId: row.business_system_id,
  importance: row.importance,
  envType: row.env_type,
  collectorType: row.collector_type,
  collectorId: row.collector_id,
  collectIntervalSec: row.collect_interval_sec,
  sqlAggregateIntervalSec: row.sql_aggregate_interval_sec,
  isActive: row.is_active,
  connectionSecretRef: row.connection_secret_ref,
  lastCollectAt: row.last_collect_at,
  lastCollectStatus: row.last_collect_status,
  lastConnectionTestAt: row.last_connection_test_at,
  lastConnectionTestStatus: row.last_connection_test_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toBusinessSystemInsert = (input: BusinessSystemInput, id = createId()) => {
  const timestamp = now();

  return {
    id,
    tenant_id: DEFAULT_TENANT_ID,
    code: input.code,
    name: input.name,
    importance: input.importance,
    owner_dept: input.ownerDept ?? null,
    owner_name: input.ownerName ?? null,
    owner_email: input.ownerEmail ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };
};

const toDbInstanceInsert = (input: DbInstanceInput, id = createId()) => {
  const timestamp = now();

  return {
    id,
    tenant_id: DEFAULT_TENANT_ID,
    dbms_type: input.dbmsType,
    instance_name: input.instanceName,
    host: input.host,
    port: input.port,
    service_name: input.serviceName ?? null,
    database_name: input.databaseName ?? null,
    business_system_id: input.businessSystemId,
    importance: input.importance,
    env_type: input.envType,
    collector_type: input.collectorType,
    collector_id: input.collectorId ?? null,
    collect_interval_sec: input.collectIntervalSec,
    sql_aggregate_interval_sec: input.sqlAggregateIntervalSec,
    is_active: input.isActive,
    connection_secret_ref: input.connectionSecretRef ?? buildVaultConnectionSecretRef(id),
    last_collect_at: null,
    last_collect_status: null,
    last_connection_test_at: null,
    last_connection_test_status: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
};

export const listBusinessSystemsFromSupabase = async () => {
  const { data, error } = await getClient()
    .from("business_system")
    .select("*")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as BusinessSystemRow[]).map(toBusinessSystem);
};

export const createBusinessSystemInSupabase = async (input: BusinessSystemInput) => {
  const client = getClient();
  const { data: existing, error: existingError } = await client
    .from("business_system")
    .select("id")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .eq("code", input.code)
    .maybeSingle();

  if (existingError) {
    throw toBusinessSystemCreateError(existingError);
  }

  if (existing) {
    throw badRequest("이미 등록된 업무 코드입니다.");
  }

  const { data, error } = await client
    .from("business_system")
    .insert(toBusinessSystemInsert(input))
    .select("*")
    .single();

  if (error) {
    throw toBusinessSystemCreateError(error);
  }

  return toBusinessSystem(data as BusinessSystemRow);
};

export const updateBusinessSystemInSupabase = async (
  id: string,
  input: BusinessSystemInput,
) => {
  const { data, error } = await getClient()
    .from("business_system")
    .update({
      name: input.name,
      importance: input.importance,
      owner_dept: input.ownerDept ?? null,
      owner_name: input.ownerName ?? null,
      owner_email: input.ownerEmail ?? null,
      updated_at: now(),
    })
    .eq("id", id)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .select("*")
    .maybeSingle();

  if (error) {
    throw toBusinessSystemUpdateError(error);
  }

  if (!data) {
    throw notFound("업무 시스템을 찾을 수 없습니다.");
  }

  return toBusinessSystem(data as BusinessSystemRow);
};

export const deleteBusinessSystemFromSupabase = async (id: string) => {
  const { count, error: countError } = await getClient()
    .from("db_instance")
    .select("id", { count: "exact", head: true })
    .eq("business_system_id", id);

  if (countError) {
    throw toBusinessSystemDeleteError(countError);
  }

  if ((count ?? 0) > 0) {
    throw new ApiRouteError({
      code: "BUSINESS_SYSTEM_IN_USE",
      message: "DB 인스턴스가 연결된 업무 시스템은 삭제할 수 없습니다.",
      status: 409,
    });
  }

  const { error } = await getClient()
    .from("business_system")
    .delete()
    .eq("id", id)
    .eq("tenant_id", DEFAULT_TENANT_ID);

  if (error) {
    throw toBusinessSystemDeleteError(error);
  }
};

export const listDbInstancesFromSupabase = async () => {
  const { data, error } = await getClient()
    .from("db_instance")
    .select("*")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbInstanceRow[]).map(toDbInstance);
};

export const getDbInstanceFromSupabase = async (id: string) => {
  const { data, error } = await getClient()
    .from("db_instance")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }

  return toDbInstance(data as DbInstanceRow);
};

export const createDbInstanceInSupabase = async (input: DbInstanceInput) => {
  const client = getClient();
  const { data: businessSystem, error: systemError } = await client
    .from("business_system")
    .select("id")
    .eq("id", input.businessSystemId)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .maybeSingle();

  if (systemError) {
    throw toDbInstanceCreateError(systemError);
  }

  if (!businessSystem) {
    throw badRequest("업무 시스템을 먼저 등록해주세요.");
  }

  const { data, error } = await client
    .from("db_instance")
    .insert(toDbInstanceInsert(input))
    .select("*")
    .single();

  if (error) {
    throw toDbInstanceCreateError(error);
  }

  return toDbInstance(data as DbInstanceRow);
};

export const updateDbInstanceSecretRefInSupabase = async (
  id: string,
  connectionSecretRef: string,
) => {
  const { data, error } = await getClient()
    .from("db_instance")
    .update({
      connection_secret_ref: connectionSecretRef,
      updated_at: now(),
    })
    .eq("id", id)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }

  return toDbInstance(data as DbInstanceRow);
};

export const updateDbInstanceInSupabase = async (id: string, input: DbInstanceInput) => {
  const updatePayload = {
    dbms_type: input.dbmsType,
    instance_name: input.instanceName,
    host: input.host,
    port: input.port,
    service_name: input.serviceName ?? null,
    database_name: input.databaseName ?? null,
    business_system_id: input.businessSystemId,
    importance: input.importance,
    env_type: input.envType,
    collector_type: input.collectorType,
    collector_id: input.collectorId ?? null,
    collect_interval_sec: input.collectIntervalSec,
    sql_aggregate_interval_sec: input.sqlAggregateIntervalSec,
    is_active: input.isActive,
    ...(input.connectionSecretRef
      ? { connection_secret_ref: input.connectionSecretRef }
      : {}),
    updated_at: now(),
  };

  const { data, error } = await getClient()
    .from("db_instance")
    .update(updatePayload)
    .eq("id", id)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .select("*")
    .maybeSingle();

  if (error) {
    throw toDbInstanceUpdateError(error);
  }

  if (!data) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }

  return toDbInstance(data as DbInstanceRow);
};

export const deleteDbInstanceFromSupabase = async (id: string) => {
  const { data, error } = await getClient()
    .from("db_instance")
    .delete()
    .eq("id", id)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toDbInstanceDeleteError(error);
  }

  if (!data) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }
};

export const updateCollectionSettingsInSupabase = async (
  id: string,
  input: CollectionSettingsInput,
) => {
  const { data, error } = await getClient()
    .from("db_instance")
    .update({
      collector_id: input.collectorId ?? null,
      collect_interval_sec: input.collectIntervalSec,
      sql_aggregate_interval_sec: input.sqlAggregateIntervalSec,
      is_active: input.isActive,
      updated_at: now(),
    })
    .eq("id", id)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }

  return toDbInstance(data as DbInstanceRow);
};

export const updateCollectStatusInSupabase = async (id: string, status: CollectStatus) => {
  const timestamp = now();
  const { data, error } = await getClient()
    .from("db_instance")
    .update({
      last_collect_status: status,
      last_collect_at: timestamp,
      updated_at: timestamp,
    })
    .eq("id", id)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }

  return toDbInstance(data as DbInstanceRow);
};

export const updateConnectionTestStatusInSupabase = async (
  id: string,
  status: CollectStatus,
) => {
  const timestamp = now();
  const { data, error } = await getClient()
    .from("db_instance")
    .update({
      last_connection_test_status: status,
      last_connection_test_at: timestamp,
      updated_at: timestamp,
    })
    .eq("id", id)
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }

  return toDbInstance(data as DbInstanceRow);
};
