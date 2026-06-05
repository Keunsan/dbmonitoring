/** DB 인스턴스 삭제 시 연결된 운영·모니터링 데이터를 정리합니다. */

import { ApiRouteError, badRequest, serviceUnavailable } from "@/lib/api";
import {
  isMssqlForeignKeyViolation,
  isMssqlUniqueViolation,
} from "@/lib/db/mssql-errors";
import { getSupabaseServerClient } from "@/lib/db/supabase-server";import type { MonitoringStorageState } from "@/services/storage/types";
import type { DbInstanceId } from "@/types/domain";

const OPERATIONAL_TABLES = [
  "sql_regression_event",
  "sql_plan_snapshot",
  "sql_performance",
  "deadlock_event",
  "blocking_snapshot",
  "session_snapshot",
  "metric_history",
  "collection_run",
] as const;

type GlobalMonitoringStorageState = typeof globalThis & {
  __dbMonitoringStorageState?: MonitoringStorageState;
};

const getMemoryStorageState = (): MonitoringStorageState | null => {
  const globalState = globalThis as GlobalMonitoringStorageState;
  return globalState.__dbMonitoringStorageState ?? null;
};

/**
 * Supabase 등록 오류를 사용자 친화 메시지로 변환합니다.
 */
export const toDbInstanceCreateError = (error: unknown): ApiRouteError => {
  if (error instanceof ApiRouteError) {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as { code?: string };
    if (record.code === "23505" || isMssqlUniqueViolation(error)) {
      return badRequest(
        "동일한 인스턴스명이 이미 등록되어 있습니다. 인스턴스명을 변경해주세요.",
      );
    }
  }

  return serviceUnavailable(
    "DB 인스턴스를 등록하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.",
    undefined,
    error,
  );
};

/**
 * Supabase 삭제 오류를 사용자 친화 메시지로 변환합니다.
 */
export const toDbInstanceDeleteError = (error: unknown): ApiRouteError => {
  if (error instanceof ApiRouteError) {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as { code?: string; message?: string };
    if (record.code === "23503" || isMssqlForeignKeyViolation(error)) {
      return badRequest(
        "연결된 모니터링 데이터가 남아 있어 삭제할 수 없습니다. 잠시 후 다시 시도해주세요.",
      );
    }
    if (record.message?.toLowerCase().includes("jwt")) {
      return serviceUnavailable(
        "데이터베이스에 연결하지 못했습니다. 환경 설정을 확인한 뒤 다시 시도해주세요.",
      );
    }
  }

  return serviceUnavailable(
    "DB 인스턴스를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.",
    undefined,
    error,
  );
};

/**
 * Supabase 수정 오류를 사용자 친화 메시지로 변환합니다.
 */
export const toDbInstanceUpdateError = (error: unknown): ApiRouteError => {
  if (error instanceof ApiRouteError) {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as { code?: string };
    if (record.code === "23505" || isMssqlUniqueViolation(error)) {
      return badRequest(
        "동일한 인스턴스명이 이미 등록되어 있습니다. 인스턴스명을 변경해주세요.",
      );
    }
  }

  return serviceUnavailable(
    "DB 인스턴스 정보를 수정하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.",
    undefined,
    error,
  );
};

/**
 * 업무 시스템 등록 오류를 사용자 친화 메시지로 변환합니다.
 */
export const toBusinessSystemCreateError = (error: unknown): ApiRouteError => {
  if (error instanceof ApiRouteError) {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as { code?: string };
    if (record.code === "23505" || isMssqlUniqueViolation(error)) {
      return badRequest("이미 등록된 업무 코드입니다. 업무 코드를 변경해주세요.");
    }
  }

  return serviceUnavailable(
    "업무 시스템을 등록하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.",
    undefined,
    error,
  );
};

/**
 * 업무 시스템 수정 오류를 사용자 친화 메시지로 변환합니다.
 */
export const toBusinessSystemUpdateError = (error: unknown): ApiRouteError => {
  if (error instanceof ApiRouteError) {
    return error;
  }

  return serviceUnavailable(
    "업무 시스템 정보를 수정하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.",
    undefined,
    error,
  );
};

/**
 * 업무 시스템 삭제 오류를 사용자 친화 메시지로 변환합니다.
 */
export const toBusinessSystemDeleteError = (error: unknown): ApiRouteError => {
  if (error instanceof ApiRouteError) {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as { code?: string };
    if (record.code === "23503" || isMssqlForeignKeyViolation(error)) {
      return badRequest(
        "DB 인스턴스가 연결된 업무 시스템은 삭제할 수 없습니다. 먼저 연결된 DB 인스턴스를 삭제해주세요.",
      );
    }
  }

  return serviceUnavailable(
    "업무 시스템을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.",
    undefined,
    error,
  );
};

/**
 * Supabase에 적재된 인스턴스별 운영 데이터를 삭제합니다.
 */
export const purgeDbInstanceOperationalDataFromSupabase = async (
  dbInstanceId: DbInstanceId,
) => {
  const client = getSupabaseServerClient();

  if (!client) {
    throw serviceUnavailable(
      "Supabase가 설정되지 않아 DB 인스턴스를 삭제할 수 없습니다.",
    );
  }

  for (const table of OPERATIONAL_TABLES) {
    const { error } = await client.from(table).delete().eq("db_instance_id", dbInstanceId);

    if (error) {
      throw toDbInstanceDeleteError(error);
    }
  }
};

/**
 * 메모리 저장소의 인스턴스별 운영 데이터를 삭제합니다.
 */
export const purgeDbInstanceOperationalDataFromMemory = (dbInstanceId: DbInstanceId) => {
  const state = getMemoryStorageState();

  if (!state) {
    return;
  }

  const exclude = <T extends { dbInstanceId: string }>(items: T[]) =>
    items.filter((item) => item.dbInstanceId !== dbInstanceId);

  state.collectionRuns = exclude(state.collectionRuns);
  state.metricHistory = exclude(state.metricHistory);
  state.sessionSnapshots = exclude(state.sessionSnapshots);
  state.blockingSnapshots = exclude(state.blockingSnapshots);
  state.sqlPerformance = exclude(state.sqlPerformance);
  state.sqlPlanSnapshots = exclude(state.sqlPlanSnapshots ?? []);
  state.sqlRegressionEvents = exclude(state.sqlRegressionEvents ?? []);
  state.deadlocks = exclude(state.deadlocks);
};
