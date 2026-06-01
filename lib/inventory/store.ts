/** Phase 3 DB 인스턴스 관리용 개발 메모리 저장소입니다. */

import { ApiRouteError, badRequest, notFound } from "@/lib/api";
import { isSupabaseServerConfigured } from "@/lib/db/supabase-server";
import {
  purgeDbInstanceOperationalDataFromMemory,
  purgeDbInstanceOperationalDataFromSupabase,
  toBusinessSystemCreateError,
  toBusinessSystemDeleteError,
  toBusinessSystemUpdateError,
  toDbInstanceCreateError,
  toDbInstanceDeleteError,
  toDbInstanceUpdateError,
} from "@/lib/inventory/purge-db-instance-data";
import {
  buildVaultConnectionSecretRef,
  parseConnectionSecretRef,
} from "@/lib/secrets/refs";
import { deleteConnectionSecret } from "@/lib/secrets";
import { toConnectionTestApiError } from "@/lib/secrets/errors";
import { maskHost, formatSecretRefForLog } from "@/lib/security/mask";
import { createCollectorAdapter } from "@/services/collector/registry";

import type { CollectorContext } from "@/services/collector/types";
import {
  createBusinessSystemInSupabase,
  createDbInstanceInSupabase,
  deleteBusinessSystemFromSupabase,
  deleteDbInstanceFromSupabase,
  getDbInstanceFromSupabase,
  listBusinessSystemsFromSupabase,
  listDbInstancesFromSupabase,
  updateBusinessSystemInSupabase,
  updateCollectStatusInSupabase,
  updateCollectionSettingsInSupabase,
  updateConnectionTestStatusInSupabase,
  updateDbInstanceInSupabase,
  updateDbInstanceSecretRefInSupabase,
} from "@/lib/inventory/supabase-store";
import {
  DEFAULT_TENANT_ID,
  type CollectStatus,
  type CollectorType,
  type DbmsType,
  type EnvType,
  type ImportanceLevel,
} from "@/types/domain";
import type { BusinessSystem, DbInstance } from "@/types/entities";

type InventoryState = {
  businessSystems: BusinessSystem[];
  dbInstances: DbInstance[];
};

export type BusinessSystemInput = {
  code: string;
  name: string;
  importance: ImportanceLevel;
  ownerDept?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

export type DbInstanceInput = {
  dbmsType: DbmsType;
  instanceName: string;
  host: string;
  port: number;
  serviceName?: string | null;
  databaseName?: string | null;
  businessSystemId: string;
  importance: ImportanceLevel;
  envType: EnvType;
  collectorType: CollectorType;
  collectorId?: string | null;
  collectIntervalSec: number;
  sqlAggregateIntervalSec: number;
  isActive: boolean;
  connectionSecretRef?: string | null;
};

export type CollectionSettingsInput = {
  collectorId?: string | null;
  collectIntervalSec: number;
  sqlAggregateIntervalSec: number;
  isActive: boolean;
};

type GlobalInventoryState = typeof globalThis & {
  __dbMonitoringInventoryState?: InventoryState;
};

const now = () => new Date().toISOString();

const shouldUseSupabaseInventory = () => isSupabaseServerConfigured();

const normalizeDbInstance = (instance: DbInstance): DbInstance => ({
  ...instance,
  lastConnectionTestAt: instance.lastConnectionTestAt ?? null,
  lastConnectionTestStatus: instance.lastConnectionTestStatus ?? null,
});

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const createInitialState = (): InventoryState => {
  const createdAt = now();
  const businessSystemId = "bs_erp";

  return {
    businessSystems: [
      {
        id: businessSystemId,
        tenantId: DEFAULT_TENANT_ID,
        code: "ERP",
        name: "ERP 테스트",
        importance: "HIGH",
        ownerDept: "IT 운영팀",
        ownerName: "운영 담당자",
        ownerEmail: "ops@example.com",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    dbInstances: [
      {
        id: "db_erp_test",
        tenantId: DEFAULT_TENANT_ID,
        dbmsType: "MSSQL",
        instanceName: "ERP 테스트 MSSQL",
        host: "ERP_TEST_DB_HOST",
        port: 1433,
        serviceName: null,
        databaseName: "WONIK_TEST",
        businessSystemId,
        importance: "HIGH",
        envType: "DEV",
        collectorType: "AGENTLESS",
        collectorId: "local-dev-collector",
        collectIntervalSec: 30,
        sqlAggregateIntervalSec: 300,
        isActive: true,
        connectionSecretRef: "env:ERP_TEST_DB",
        lastCollectAt: null,
        lastCollectStatus: null,
        lastConnectionTestAt: null,
        lastConnectionTestStatus: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
};

const getState = (): InventoryState => {
  const globalState = globalThis as GlobalInventoryState;

  if (!globalState.__dbMonitoringInventoryState) {
    globalState.__dbMonitoringInventoryState = createInitialState();
  }

  return globalState.__dbMonitoringInventoryState;
};

const normalizeNullable = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const requireString = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${key} 값은 필수입니다.`);
  }

  return value.trim();
};

const parseNumber = (
  payload: Record<string, unknown>,
  key: string,
  fallback: number,
) => {
  const value = payload[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : fallback;

  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (
  payload: Record<string, unknown>,
  key: string,
  fallback: boolean,
) => {
  const value = payload[key];

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase());
  }

  return fallback;
};

const assertOneOf = <T extends string>(
  value: string,
  allowed: readonly T[],
  key: string,
): T => {
  if (!allowed.includes(value as T)) {
    throw badRequest(`${key} 값이 허용 범위에 없습니다.`, {
      allowed,
    });
  }

  return value as T;
};

const validateCollectionIntervals = (
  collectIntervalSec: number,
  sqlAggregateIntervalSec: number,
) => {
  if (collectIntervalSec < 5 || collectIntervalSec > 60) {
    throw badRequest("수집 주기는 5~60초 범위여야 합니다.");
  }

  if (sqlAggregateIntervalSec < 10 || sqlAggregateIntervalSec > 300) {
    throw badRequest("SQL 집계 주기는 10~300초 범위여야 합니다.");
  }
};

export const parseBusinessSystemInput = (
  payload: Record<string, unknown>,
): BusinessSystemInput => ({
  code: requireString(payload, "code").toUpperCase(),
  name: requireString(payload, "name"),
  importance: assertOneOf(
    requireString(payload, "importance"),
    ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    "importance",
  ),
  ownerDept: normalizeNullable(payload.ownerDept),
  ownerName: normalizeNullable(payload.ownerName),
  ownerEmail: normalizeNullable(payload.ownerEmail),
});

export const parseDbInstanceInput = (
  payload: Record<string, unknown>,
): DbInstanceInput => {
  const collectIntervalSec = parseNumber(payload, "collectIntervalSec", 30);
  const sqlAggregateIntervalSec = parseNumber(
    payload,
    "sqlAggregateIntervalSec",
    300,
  );

  validateCollectionIntervals(collectIntervalSec, sqlAggregateIntervalSec);

  return {
    dbmsType: assertOneOf(
      requireString(payload, "dbmsType"),
      ["MSSQL", "ORACLE", "AZURE_SQL"],
      "dbmsType",
    ),
    instanceName: requireString(payload, "instanceName"),
    host: requireString(payload, "host"),
    port: parseNumber(payload, "port", 1433),
    serviceName: normalizeNullable(payload.serviceName),
    databaseName: normalizeNullable(payload.databaseName),
    businessSystemId: requireString(payload, "businessSystemId"),
    importance: assertOneOf(
      requireString(payload, "importance"),
      ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      "importance",
    ),
    envType: assertOneOf(
      requireString(payload, "envType"),
      ["PROD", "DEV", "STG", "DR"],
      "envType",
    ),
    collectorType: assertOneOf(
      requireString(payload, "collectorType"),
      ["AGENT", "AGENTLESS", "API"],
      "collectorType",
    ),
    collectorId: normalizeNullable(payload.collectorId),
    collectIntervalSec,
    sqlAggregateIntervalSec,
    isActive: parseBoolean(payload, "isActive", true),
    connectionSecretRef: (() => {
      const value = payload.connectionSecretRef;

      if (typeof value !== "string" || value.trim().length === 0) {
        return null;
      }

      const ref = value.trim();
      parseConnectionSecretRef(ref);
      return ref;
    })(),
  };
};

export const parseCollectionSettingsInput = (
  payload: Record<string, unknown>,
): CollectionSettingsInput => {
  const collectIntervalSec = parseNumber(payload, "collectIntervalSec", 30);
  const sqlAggregateIntervalSec = parseNumber(
    payload,
    "sqlAggregateIntervalSec",
    300,
  );

  validateCollectionIntervals(collectIntervalSec, sqlAggregateIntervalSec);

  return {
    collectorId: normalizeNullable(payload.collectorId),
    collectIntervalSec,
    sqlAggregateIntervalSec,
    isActive: parseBoolean(payload, "isActive", true),
  };
};

export const listBusinessSystems = async () => {
  if (shouldUseSupabaseInventory()) {
    return listBusinessSystemsFromSupabase();
  }

  return getState().businessSystems;
};

export const createBusinessSystem = async (input: BusinessSystemInput) => {
  try {
    if (shouldUseSupabaseInventory()) {
      return await createBusinessSystemInSupabase(input);
    }

    const state = getState();

    if (state.businessSystems.some((system) => system.code === input.code)) {
      throw badRequest("이미 등록된 업무 코드입니다.");
    }

    const createdAt = now();
    const businessSystem: BusinessSystem = {
      id: createId(),
      tenantId: DEFAULT_TENANT_ID,
      ...input,
      ownerDept: input.ownerDept ?? null,
      ownerName: input.ownerName ?? null,
      ownerEmail: input.ownerEmail ?? null,
      createdAt,
      updatedAt: createdAt,
    };

    state.businessSystems.push(businessSystem);
    return businessSystem;
  } catch (error) {
    throw toBusinessSystemCreateError(error);
  }
};

export const updateBusinessSystem = async (
  id: string,
  input: BusinessSystemInput,
) => {
  try {
    if (shouldUseSupabaseInventory()) {
      return await updateBusinessSystemInSupabase(id, input);
    }

    const state = getState();
    const index = state.businessSystems.findIndex((system) => system.id === id);

    if (index < 0) {
      throw notFound("업무 시스템을 찾을 수 없습니다.");
    }

    state.businessSystems[index] = {
      ...state.businessSystems[index],
      ...input,
      code: state.businessSystems[index].code,
      ownerDept: input.ownerDept ?? null,
      ownerName: input.ownerName ?? null,
      ownerEmail: input.ownerEmail ?? null,
      updatedAt: now(),
    };

    return state.businessSystems[index];
  } catch (error) {
    throw toBusinessSystemUpdateError(error);
  }
};

export const deleteBusinessSystem = async (id: string) => {
  try {
    if (shouldUseSupabaseInventory()) {
      await deleteBusinessSystemFromSupabase(id);
      return;
    }

    const state = getState();

    if (state.dbInstances.some((instance) => instance.businessSystemId === id)) {
      throw new ApiRouteError({
        code: "BUSINESS_SYSTEM_IN_USE",
        message: "DB 인스턴스가 연결된 업무 시스템은 삭제할 수 없습니다.",
        status: 409,
      });
    }

    const nextSystems = state.businessSystems.filter((system) => system.id !== id);

    if (nextSystems.length === state.businessSystems.length) {
      throw notFound("업무 시스템을 찾을 수 없습니다.");
    }

    state.businessSystems = nextSystems;
  } catch (error) {
    throw toBusinessSystemDeleteError(error);
  }
};

export const listDbInstances = async () => {
  if (shouldUseSupabaseInventory()) {
    return listDbInstancesFromSupabase();
  }

  return getState().dbInstances.map((instance) => normalizeDbInstance(instance));
};

export const getDbInstance = async (id: string) => {
  if (shouldUseSupabaseInventory()) {
    return getDbInstanceFromSupabase(id);
  }

  const instance = getState().dbInstances.find((item) => item.id === id);

  if (!instance) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }

  return normalizeDbInstance(instance);
};

export const createDbInstance = async (input: DbInstanceInput) => {
  try {
    if (shouldUseSupabaseInventory()) {
      return await createDbInstanceInSupabase(input);
    }

    const state = getState();

    if (!state.businessSystems.some((system) => system.id === input.businessSystemId)) {
      throw badRequest("업무 시스템을 먼저 등록해주세요.");
    }

    const createdAt = now();
    const id = createId();
    const instance: DbInstance = {
      id,
      tenantId: DEFAULT_TENANT_ID,
      ...input,
      serviceName: input.serviceName ?? null,
      databaseName: input.databaseName ?? null,
      collectorId: input.collectorId ?? null,
      connectionSecretRef: input.connectionSecretRef ?? buildVaultConnectionSecretRef(id),
      lastCollectAt: null,
      lastCollectStatus: null,
      lastConnectionTestAt: null,
      lastConnectionTestStatus: null,
      createdAt,
      updatedAt: createdAt,
    };

    state.dbInstances.push(instance);
    return instance;
  } catch (error) {
    throw toDbInstanceCreateError(error);
  }
};

/**
 * DB 인스턴스의 connection_secret_ref만 갱신합니다.
 */
export const updateDbInstanceSecretRef = async (id: string, connectionSecretRef: string) => {
  if (shouldUseSupabaseInventory()) {
    return updateDbInstanceSecretRefInSupabase(id, connectionSecretRef);
  }

  const instance = await getDbInstance(id);
  instance.connectionSecretRef = connectionSecretRef;
  instance.updatedAt = now();
  return instance;
};

export const updateDbInstance = async (id: string, input: DbInstanceInput) => {
  try {
    if (shouldUseSupabaseInventory()) {
      return await updateDbInstanceInSupabase(id, input);
    }

    const state = getState();
    const index = state.dbInstances.findIndex((instance) => instance.id === id);

    if (index < 0) {
      throw notFound("DB 인스턴스를 찾을 수 없습니다.");
    }

    state.dbInstances[index] = {
      ...state.dbInstances[index],
      ...input,
      serviceName: input.serviceName ?? null,
      databaseName: input.databaseName ?? null,
      collectorId: input.collectorId ?? null,
      connectionSecretRef:
        input.connectionSecretRef ?? state.dbInstances[index].connectionSecretRef,
      updatedAt: now(),
    };

    return state.dbInstances[index];
  } catch (error) {
    throw toDbInstanceUpdateError(error);
  }
};

const removeDbInstanceConnectionSecretBestEffort = async (instance: DbInstance) => {
  try {
    const parsed = parseConnectionSecretRef(instance.connectionSecretRef);
    if (parsed.kind === "vault") {
      await deleteConnectionSecret(parsed.vaultName);
    }
  } catch {
    // Vault Secret이 없어도 인스턴스 삭제는 계속 진행합니다.
  }
};

export const deleteDbInstance = async (id: string) => {
  const instance = await getDbInstance(id);

  try {
    if (shouldUseSupabaseInventory()) {
      await purgeDbInstanceOperationalDataFromSupabase(id);
      await removeDbInstanceConnectionSecretBestEffort(instance);
      await deleteDbInstanceFromSupabase(id);
      return;
    }

    purgeDbInstanceOperationalDataFromMemory(id);

    const state = getState();
    const nextInstances = state.dbInstances.filter((item) => item.id !== id);

    if (nextInstances.length === state.dbInstances.length) {
      throw notFound("DB 인스턴스를 찾을 수 없습니다.");
    }

    state.dbInstances = nextInstances;
  } catch (error) {
    throw toDbInstanceDeleteError(error);
  }
};

export const updateCollectionSettings = async (
  id: string,
  input: CollectionSettingsInput,
) => {
  if (shouldUseSupabaseInventory()) {
    return updateCollectionSettingsInSupabase(id, input);
  }

  const instance = getState().dbInstances.find((item) => item.id === id);

  if (!instance) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }

  Object.assign(instance, {
    collectorId: input.collectorId ?? null,
    collectIntervalSec: input.collectIntervalSec,
    sqlAggregateIntervalSec: input.sqlAggregateIntervalSec,
    isActive: input.isActive,
    updatedAt: now(),
  });

  return instance;
};

export const updateCollectStatus = async (id: string, status: CollectStatus) => {
  if (shouldUseSupabaseInventory()) {
    return updateCollectStatusInSupabase(id, status);
  }

  const instance = getState().dbInstances.find((item) => item.id === id);

  if (!instance) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }

  instance.lastCollectStatus = status;
  instance.lastCollectAt = now();
  instance.updatedAt = now();
  return instance;
};

const updateConnectionTestStatus = async (id: string, status: CollectStatus) => {
  if (shouldUseSupabaseInventory()) {
    return updateConnectionTestStatusInSupabase(id, status);
  }

  const instance = getState().dbInstances.find((item) => item.id === id);

  if (!instance) {
    throw notFound("DB 인스턴스를 찾을 수 없습니다.");
  }
  instance.lastConnectionTestStatus = status;
  instance.lastConnectionTestAt = now();
  instance.updatedAt = now();
  return instance;
};

const toCollectorContext = (instance: DbInstance): CollectorContext => ({
  dbInstanceId: instance.id,
  dbmsType: instance.dbmsType,
  connectionSecretRef: instance.connectionSecretRef,
  instanceName: instance.instanceName,
  host: instance.host,
  port: instance.port,
  serviceName: instance.serviceName,
  databaseName: instance.databaseName,
  envType: instance.envType,
});

export const testDbInstanceConnection = async (id: string) => {
  const instance = await getDbInstance(id);
  const context = toCollectorContext(instance);

  try {
    const adapter = createCollectorAdapter(context);
    const result = await adapter.connect();

    if (!result.success) {
      await updateConnectionTestStatus(id, "FAIL");
      throw toConnectionTestApiError(new Error(result.message));
    }

    await updateConnectionTestStatus(id, "OK");

    return {
      status: "connected",
      dbmsType: instance.dbmsType,
      host: maskHost(instance.host),
      port: instance.port,
      databaseName: instance.databaseName,
      secretRef: formatSecretRefForLog(instance.connectionSecretRef),
      latencyMs: result.latencyMs ?? null,
      message: result.message,
      checkedAt: now(),
    };
  } catch (error) {
    await updateConnectionTestStatus(id, "FAIL");
    throw toConnectionTestApiError(error);
  }
};
