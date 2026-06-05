/** MSSQL 기반 업무 시스템·DB 인스턴스 메타데이터 저장소입니다. */

import sql from "mssql";

import { ApiRouteError, badRequest, notFound } from "@/lib/api";
import { toIsoString } from "@/lib/db/mssql-row-utils";
import { withMssqlOperationalPool } from "@/lib/db/mssql-server";
import {
  toBusinessSystemCreateError,
  toBusinessSystemDeleteError,
  toBusinessSystemUpdateError,
  toDbInstanceCreateError,
  toDbInstanceDeleteError,
  toDbInstanceUpdateError,
} from "@/lib/inventory/purge-db-instance-data";
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
  created_at: Date | string;
  updated_at: Date | string;
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
  last_collect_at: Date | string | null;
  last_collect_status: CollectStatus | null;
  last_connection_test_at: Date | string | null;
  last_connection_test_status: CollectStatus | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const now = () => new Date().toISOString();
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
  createdAt: toIsoString(row.created_at) as string,
  updatedAt: toIsoString(row.updated_at) as string,
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
  lastCollectAt: toIsoString(row.last_collect_at),
  lastCollectStatus: row.last_collect_status,
  lastConnectionTestAt: toIsoString(row.last_connection_test_at),
  lastConnectionTestStatus: row.last_connection_test_status,
  createdAt: toIsoString(row.created_at) as string,
  updatedAt: toIsoString(row.updated_at) as string,
});

export const listBusinessSystemsFromMssql = async () =>
  withMssqlOperationalPool(async (pool) => {
    const result = await pool
      .request()
      .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
      .query<BusinessSystemRow>(`
        SELECT *
        FROM dbo.business_system
        WHERE tenant_id = @tenant_id
        ORDER BY created_at ASC
      `);

    return result.recordset.map(toBusinessSystem);
  });

export const createBusinessSystemInMssql = async (input: BusinessSystemInput) =>
  withMssqlOperationalPool(async (pool) => {
    const existing = await pool
      .request()
      .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
      .input("code", sql.NVarChar(100), input.code)
      .query<{ id: string }>(`
        SELECT id
        FROM dbo.business_system
        WHERE tenant_id = @tenant_id AND code = @code
      `);

    if (existing.recordset.length > 0) {
      throw badRequest("이미 등록된 업무 코드입니다.");
    }

    const id = createId();
    const timestamp = now();

    try {
      const result = await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
        .input("code", sql.NVarChar(100), input.code)
        .input("name", sql.NVarChar(500), input.name)
        .input("importance", sql.NVarChar(50), input.importance)
        .input("owner_dept", sql.NVarChar(200), input.ownerDept ?? null)
        .input("owner_name", sql.NVarChar(200), input.ownerName ?? null)
        .input("owner_email", sql.NVarChar(320), input.ownerEmail ?? null)
        .input("created_at", sql.DateTimeOffset, timestamp)
        .input("updated_at", sql.DateTimeOffset, timestamp)
        .query<BusinessSystemRow>(`
          INSERT INTO dbo.business_system (
            id, tenant_id, code, name, importance,
            owner_dept, owner_name, owner_email, created_at, updated_at
          )
          OUTPUT INSERTED.*
          VALUES (
            @id, @tenant_id, @code, @name, @importance,
            @owner_dept, @owner_name, @owner_email, @created_at, @updated_at
          )
        `);

      return toBusinessSystem(result.recordset[0]);
    } catch (error) {
      throw toBusinessSystemCreateError(error);
    }
  });

export const updateBusinessSystemInMssql = async (
  id: string,
  input: BusinessSystemInput,
) =>
  withMssqlOperationalPool(async (pool) => {
    try {
      const result = await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
        .input("name", sql.NVarChar(500), input.name)
        .input("importance", sql.NVarChar(50), input.importance)
        .input("owner_dept", sql.NVarChar(200), input.ownerDept ?? null)
        .input("owner_name", sql.NVarChar(200), input.ownerName ?? null)
        .input("owner_email", sql.NVarChar(320), input.ownerEmail ?? null)
        .input("updated_at", sql.DateTimeOffset, now())
        .query<BusinessSystemRow>(`
          UPDATE dbo.business_system
          SET
            name = @name,
            importance = @importance,
            owner_dept = @owner_dept,
            owner_name = @owner_name,
            owner_email = @owner_email,
            updated_at = @updated_at
          OUTPUT INSERTED.*
          WHERE id = @id AND tenant_id = @tenant_id
        `);

      if (result.recordset.length === 0) {
        throw notFound("업무 시스템을 찾을 수 없습니다.");
      }

      return toBusinessSystem(result.recordset[0]);
    } catch (error) {
      throw toBusinessSystemUpdateError(error);
    }
  });

export const deleteBusinessSystemFromMssql = async (id: string) =>
  withMssqlOperationalPool(async (pool) => {
    const linked = await pool
      .request()
      .input("business_system_id", sql.UniqueIdentifier, id)
      .query<{ count: number }>(`
        SELECT COUNT(1) AS count
        FROM dbo.db_instance
        WHERE business_system_id = @business_system_id
      `);

    if ((linked.recordset[0]?.count ?? 0) > 0) {
      throw new ApiRouteError({
        code: "BUSINESS_SYSTEM_IN_USE",
        message: "DB 인스턴스가 연결된 업무 시스템은 삭제할 수 없습니다.",
        status: 409,
      });
    }

    try {
      const result = await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
        .query(`
          DELETE FROM dbo.business_system
          OUTPUT DELETED.id
          WHERE id = @id AND tenant_id = @tenant_id
        `);

      if (result.recordset.length === 0) {
        throw notFound("업무 시스템을 찾을 수 없습니다.");
      }
    } catch (error) {
      throw toBusinessSystemDeleteError(error);
    }
  });

export const listDbInstancesFromMssql = async () =>
  withMssqlOperationalPool(async (pool) => {
    const result = await pool
      .request()
      .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
      .query<DbInstanceRow>(`
        SELECT *
        FROM dbo.db_instance
        WHERE tenant_id = @tenant_id
        ORDER BY created_at ASC
      `);

    return result.recordset.map(toDbInstance);
  });

export const getDbInstanceFromMssql = async (id: string) =>
  withMssqlOperationalPool(async (pool) => {
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
      .query<DbInstanceRow>(`
        SELECT *
        FROM dbo.db_instance
        WHERE id = @id AND tenant_id = @tenant_id
      `);

    if (result.recordset.length === 0) {
      throw notFound("DB 인스턴스를 찾을 수 없습니다.");
    }

    return toDbInstance(result.recordset[0]);
  });

export const createDbInstanceInMssql = async (input: DbInstanceInput) =>
  withMssqlOperationalPool(async (pool) => {
    const businessSystem = await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.businessSystemId)
      .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
      .query<{ id: string }>(`
        SELECT id
        FROM dbo.business_system
        WHERE id = @id AND tenant_id = @tenant_id
      `);

    if (businessSystem.recordset.length === 0) {
      throw badRequest("업무 시스템을 먼저 등록해주세요.");
    }

    const id = createId();
    const timestamp = now();

    try {
      const result = await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
        .input("dbms_type", sql.NVarChar(50), input.dbmsType)
        .input("instance_name", sql.NVarChar(200), input.instanceName)
        .input("host", sql.NVarChar(500), input.host)
        .input("port", sql.Int, input.port)
        .input("service_name", sql.NVarChar(200), input.serviceName ?? null)
        .input("database_name", sql.NVarChar(200), input.databaseName ?? null)
        .input("business_system_id", sql.UniqueIdentifier, input.businessSystemId)
        .input("importance", sql.NVarChar(50), input.importance)
        .input("env_type", sql.NVarChar(50), input.envType)
        .input("collector_type", sql.NVarChar(50), input.collectorType)
        .input("collector_id", sql.NVarChar(200), input.collectorId ?? null)
        .input("collect_interval_sec", sql.Int, input.collectIntervalSec)
        .input("sql_aggregate_interval_sec", sql.Int, input.sqlAggregateIntervalSec)
        .input("is_active", sql.Bit, input.isActive)
        .input(
          "connection_secret_ref",
          sql.NVarChar(500),
          input.connectionSecretRef ?? buildVaultConnectionSecretRef(id),
        )
        .input("created_at", sql.DateTimeOffset, timestamp)
        .input("updated_at", sql.DateTimeOffset, timestamp)
        .query<DbInstanceRow>(`
          INSERT INTO dbo.db_instance (
            id, tenant_id, dbms_type, instance_name, host, port,
            service_name, database_name, business_system_id, importance,
            env_type, collector_type, collector_id, collect_interval_sec,
            sql_aggregate_interval_sec, is_active, connection_secret_ref,
            created_at, updated_at
          )
          OUTPUT INSERTED.*
          VALUES (
            @id, @tenant_id, @dbms_type, @instance_name, @host, @port,
            @service_name, @database_name, @business_system_id, @importance,
            @env_type, @collector_type, @collector_id, @collect_interval_sec,
            @sql_aggregate_interval_sec, @is_active, @connection_secret_ref,
            @created_at, @updated_at
          )
        `);

      return toDbInstance(result.recordset[0]);
    } catch (error) {
      throw toDbInstanceCreateError(error);
    }
  });

export const updateDbInstanceSecretRefInMssql = async (
  id: string,
  connectionSecretRef: string,
) =>
  withMssqlOperationalPool(async (pool) => {
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
      .input("connection_secret_ref", sql.NVarChar(500), connectionSecretRef)
      .input("updated_at", sql.DateTimeOffset, now())
      .query<DbInstanceRow>(`
        UPDATE dbo.db_instance
        SET connection_secret_ref = @connection_secret_ref, updated_at = @updated_at
        OUTPUT INSERTED.*
        WHERE id = @id AND tenant_id = @tenant_id
      `);

    if (result.recordset.length === 0) {
      throw notFound("DB 인스턴스를 찾을 수 없습니다.");
    }

    return toDbInstance(result.recordset[0]);
  });

export const updateDbInstanceInMssql = async (id: string, input: DbInstanceInput) =>
  withMssqlOperationalPool(async (pool) => {
    try {
      const result = await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
        .input("dbms_type", sql.NVarChar(50), input.dbmsType)
        .input("instance_name", sql.NVarChar(200), input.instanceName)
        .input("host", sql.NVarChar(500), input.host)
        .input("port", sql.Int, input.port)
        .input("service_name", sql.NVarChar(200), input.serviceName ?? null)
        .input("database_name", sql.NVarChar(200), input.databaseName ?? null)
        .input("business_system_id", sql.UniqueIdentifier, input.businessSystemId)
        .input("importance", sql.NVarChar(50), input.importance)
        .input("env_type", sql.NVarChar(50), input.envType)
        .input("collector_type", sql.NVarChar(50), input.collectorType)
        .input("collector_id", sql.NVarChar(200), input.collectorId ?? null)
        .input("collect_interval_sec", sql.Int, input.collectIntervalSec)
        .input("sql_aggregate_interval_sec", sql.Int, input.sqlAggregateIntervalSec)
        .input("is_active", sql.Bit, input.isActive)
        .input(
          "connection_secret_ref",
          sql.NVarChar(500),
          input.connectionSecretRef ?? null,
        )
        .input("updated_at", sql.DateTimeOffset, now())
        .query<DbInstanceRow>(`
          UPDATE dbo.db_instance
          SET
            dbms_type = @dbms_type,
            instance_name = @instance_name,
            host = @host,
            port = @port,
            service_name = @service_name,
            database_name = @database_name,
            business_system_id = @business_system_id,
            importance = @importance,
            env_type = @env_type,
            collector_type = @collector_type,
            collector_id = @collector_id,
            collect_interval_sec = @collect_interval_sec,
            sql_aggregate_interval_sec = @sql_aggregate_interval_sec,
            is_active = @is_active,
            connection_secret_ref = COALESCE(@connection_secret_ref, connection_secret_ref),
            updated_at = @updated_at
          OUTPUT INSERTED.*
          WHERE id = @id AND tenant_id = @tenant_id
        `);

      if (result.recordset.length === 0) {
        throw notFound("DB 인스턴스를 찾을 수 없습니다.");
      }

      return toDbInstance(result.recordset[0]);
    } catch (error) {
      throw toDbInstanceUpdateError(error);
    }
  });

export const deleteDbInstanceFromMssql = async (id: string) =>
  withMssqlOperationalPool(async (pool) => {
    try {
      const result = await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
        .query(`
          DELETE FROM dbo.db_instance
          OUTPUT DELETED.id
          WHERE id = @id AND tenant_id = @tenant_id
        `);

      if (result.recordset.length === 0) {
        throw notFound("DB 인스턴스를 찾을 수 없습니다.");
      }
    } catch (error) {
      throw toDbInstanceDeleteError(error);
    }
  });

export const updateCollectionSettingsInMssql = async (
  id: string,
  input: CollectionSettingsInput,
) =>
  withMssqlOperationalPool(async (pool) => {
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
      .input("collector_id", sql.NVarChar(200), input.collectorId ?? null)
      .input("collect_interval_sec", sql.Int, input.collectIntervalSec)
      .input("sql_aggregate_interval_sec", sql.Int, input.sqlAggregateIntervalSec)
      .input("is_active", sql.Bit, input.isActive)
      .input("updated_at", sql.DateTimeOffset, now())
      .query<DbInstanceRow>(`
        UPDATE dbo.db_instance
        SET
          collector_id = @collector_id,
          collect_interval_sec = @collect_interval_sec,
          sql_aggregate_interval_sec = @sql_aggregate_interval_sec,
          is_active = @is_active,
          updated_at = @updated_at
        OUTPUT INSERTED.*
        WHERE id = @id AND tenant_id = @tenant_id
      `);

    if (result.recordset.length === 0) {
      throw notFound("DB 인스턴스를 찾을 수 없습니다.");
    }

    return toDbInstance(result.recordset[0]);
  });

export const updateCollectStatusInMssql = async (id: string, status: CollectStatus) =>
  withMssqlOperationalPool(async (pool) => {
    const timestamp = now();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
      .input("last_collect_status", sql.NVarChar(50), status)
      .input("last_collect_at", sql.DateTimeOffset, timestamp)
      .input("updated_at", sql.DateTimeOffset, timestamp)
      .query<DbInstanceRow>(`
        UPDATE dbo.db_instance
        SET
          last_collect_status = @last_collect_status,
          last_collect_at = @last_collect_at,
          updated_at = @updated_at
        OUTPUT INSERTED.*
        WHERE id = @id AND tenant_id = @tenant_id
      `);

    if (result.recordset.length === 0) {
      throw notFound("DB 인스턴스를 찾을 수 없습니다.");
    }

    return toDbInstance(result.recordset[0]);
  });

export const updateConnectionTestStatusInMssql = async (
  id: string,
  status: CollectStatus,
) =>
  withMssqlOperationalPool(async (pool) => {
    const timestamp = now();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("tenant_id", sql.UniqueIdentifier, DEFAULT_TENANT_ID)
      .input("last_connection_test_status", sql.NVarChar(50), status)
      .input("last_connection_test_at", sql.DateTimeOffset, timestamp)
      .input("updated_at", sql.DateTimeOffset, timestamp)
      .query<DbInstanceRow>(`
        UPDATE dbo.db_instance
        SET
          last_connection_test_status = @last_connection_test_status,
          last_connection_test_at = @last_connection_test_at,
          updated_at = @updated_at
        OUTPUT INSERTED.*
        WHERE id = @id AND tenant_id = @tenant_id
      `);

    if (result.recordset.length === 0) {
      throw notFound("DB 인스턴스를 찾을 수 없습니다.");
    }

    return toDbInstance(result.recordset[0]);
  });
