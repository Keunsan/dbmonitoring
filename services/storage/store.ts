/** 수집 결과 저장소 facade — MSSQL 우선, Supabase fallback, 미설정 시 메모리 fallback입니다. */

import { isMssqlMonitoringStorageEnabled } from "@/services/storage/mssql-store";
import { isSupabaseMonitoringStorageEnabled } from "@/services/storage/supabase-store";
import type { CollectorRunResult } from "@/services/collector/types";
import type {
  BlockingSnapshotRecord,
  CollectionRunRecord,
  DeadlockRecord,
  MetricHistoryRecord,
  MonitoringSummary,
  SessionSnapshotRecord,
  SqlPerformanceRecord,
  SqlPlanSnapshotRecord,
  SqlRegressionEventRecord,
} from "@/services/storage/types";
import type { DbInstanceId } from "@/types/domain";

import {
  getMonitoringStorageSummaryFromMemory,
  getMonitoringSummaryFromMemory,
  listBlockingSnapshotsFromMemory,
  listCollectionRunsFromMemory,
  listDeadlockEventsFromMemory,
  listMetricHistoryFromMemory,
  listSessionSnapshotsFromMemory,
  listSqlPerformanceFromMemory,
  listSqlPlanSnapshotsFromMemory,
  listSqlRegressionEventsFromMemory,
  saveCollectorRunToMemory,
  saveSessionsCollectorRunToMemory,
  saveSqlRegressionEventsToMemory,
} from "./memory-store";
import {
  getMonitoringStorageSummaryFromMssql,
  getMonitoringSummaryFromMssql,
  listBlockingSnapshotsFromMssql,
  listCollectionRunsFromMssql,
  listDeadlockEventsFromMssql,
  listMetricHistoryFromMssql,
  listSessionSnapshotsFromMssql,
  listSqlPerformanceFromMssql,
  listSqlPlanSnapshotsFromMssql,
  listSqlRegressionEventsFromMssql,
  saveCollectorRunToMssql,
  saveSessionsCollectorRunToMssql,
  saveSqlRegressionEventsToMssql,
} from "./mssql-store";
import {
  getMonitoringStorageSummaryFromSupabase,
  getMonitoringSummaryFromSupabase,
  listBlockingSnapshotsFromSupabase,
  listCollectionRunsFromSupabase,
  listDeadlockEventsFromSupabase,
  listMetricHistoryFromSupabase,
  listSessionSnapshotsFromSupabase,
  listSqlPerformanceFromSupabase,
  listSqlPlanSnapshotsFromSupabase,
  listSqlRegressionEventsFromSupabase,
  saveCollectorRunToSupabase,
  saveSessionsCollectorRunToSupabase,
  saveSqlRegressionEventsToSupabase,
} from "./supabase-store";

const shouldUseMssqlStorage = () => isMssqlMonitoringStorageEnabled();
const shouldUseSupabaseStorage = () =>
  !shouldUseMssqlStorage() && isSupabaseMonitoringStorageEnabled();

/**
 * Collector 실행 결과를 저장합니다.
 */
export const saveCollectorRun = async (result: CollectorRunResult) => {
  if (shouldUseMssqlStorage()) {
    return saveCollectorRunToMssql(result);
  }

  if (shouldUseSupabaseStorage()) {
    return saveCollectorRunToSupabase(result);
  }

  return saveCollectorRunToMemory(result);
};

/** 실시간 세션 경량 수집 결과(세션 스냅샷만)를 저장합니다. */
export const saveSessionsCollectorRun = async (result: CollectorRunResult) => {
  if (shouldUseMssqlStorage()) {
    return saveSessionsCollectorRunToMssql(result);
  }

  if (shouldUseSupabaseStorage()) {
    return saveSessionsCollectorRunToSupabase(result);
  }

  return saveSessionsCollectorRunToMemory(result);
};

/**
 * 최근 Collector 실행 이력을 반환합니다.
 */
export const listCollectionRuns = async (
  dbInstanceId?: DbInstanceId,
): Promise<CollectionRunRecord[]> => {
  if (shouldUseMssqlStorage()) {
    return listCollectionRunsFromMssql(dbInstanceId);
  }

  if (shouldUseSupabaseStorage()) {
    return listCollectionRunsFromSupabase(dbInstanceId);
  }

  return listCollectionRunsFromMemory(dbInstanceId);
};

/**
 * 시계열 지표 이력을 반환합니다.
 */
export const listMetricHistory = async (params: {
  dbInstanceId?: DbInstanceId;
  metricName?: string;
  limit?: number;
}): Promise<MetricHistoryRecord[]> => {
  if (shouldUseMssqlStorage()) {
    return listMetricHistoryFromMssql(params);
  }

  if (shouldUseSupabaseStorage()) {
    return listMetricHistoryFromSupabase(params);
  }

  return listMetricHistoryFromMemory(params);
};

/**
 * 최근 세션 스냅샷을 반환합니다.
 */
export const listSessionSnapshots = async (
  dbInstanceId?: DbInstanceId,
  limit = 200,
): Promise<SessionSnapshotRecord[]> => {
  if (shouldUseMssqlStorage()) {
    return listSessionSnapshotsFromMssql(dbInstanceId, limit);
  }

  if (shouldUseSupabaseStorage()) {
    return listSessionSnapshotsFromSupabase(dbInstanceId, limit);
  }

  return listSessionSnapshotsFromMemory(dbInstanceId, limit);
};

/**
 * 최근 SQL 성능 집계 결과를 반환합니다.
 */
export const listSqlPerformance = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
  sqlId?: string,
): Promise<SqlPerformanceRecord[]> => {
  if (shouldUseMssqlStorage()) {
    return listSqlPerformanceFromMssql(dbInstanceId, limit, sqlId);
  }

  if (shouldUseSupabaseStorage()) {
    return listSqlPerformanceFromSupabase(dbInstanceId, limit, sqlId);
  }

  return listSqlPerformanceFromMemory(dbInstanceId, limit, sqlId);
};

/**
 * SQL 실행 계획 스냅샷을 반환합니다.
 */
export const listSqlPlanSnapshots = async (params: {
  dbInstanceId: DbInstanceId;
  sqlId?: string;
  limit?: number;
}): Promise<SqlPlanSnapshotRecord[]> => {
  if (shouldUseMssqlStorage()) {
    return listSqlPlanSnapshotsFromMssql(params);
  }

  if (shouldUseSupabaseStorage()) {
    return listSqlPlanSnapshotsFromSupabase(params);
  }

  return listSqlPlanSnapshotsFromMemory(params);
};

/**
 * SQL 성능 회귀 이벤트를 반환합니다.
 */
export const listSqlRegressionEvents = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<SqlRegressionEventRecord[]> => {
  if (shouldUseMssqlStorage()) {
    return listSqlRegressionEventsFromMssql(dbInstanceId, limit);
  }

  if (shouldUseSupabaseStorage()) {
    return listSqlRegressionEventsFromSupabase(dbInstanceId, limit);
  }

  return listSqlRegressionEventsFromMemory(dbInstanceId, limit);
};

/**
 * SQL 성능 회귀 이벤트를 저장합니다.
 */
export const saveSqlRegressionEvents = async (events: SqlRegressionEventRecord[]) => {
  if (shouldUseMssqlStorage()) {
    return saveSqlRegressionEventsToMssql(events);
  }

  if (shouldUseSupabaseStorage()) {
    return saveSqlRegressionEventsToSupabase(events);
  }

  return saveSqlRegressionEventsToMemory(events);
};

/**
 * 최근 Blocking 스냅샷을 반환합니다.
 */
export const listBlockingSnapshots = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<BlockingSnapshotRecord[]> => {
  if (shouldUseMssqlStorage()) {
    return listBlockingSnapshotsFromMssql(dbInstanceId, limit);
  }

  if (shouldUseSupabaseStorage()) {
    return listBlockingSnapshotsFromSupabase(dbInstanceId, limit);
  }

  return listBlockingSnapshotsFromMemory(dbInstanceId, limit);
};

/**
 * 최근 Deadlock 이벤트를 반환합니다.
 */
export const listDeadlockEvents = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<DeadlockRecord[]> => {
  if (shouldUseMssqlStorage()) {
    return listDeadlockEventsFromMssql(dbInstanceId, limit);
  }

  if (shouldUseSupabaseStorage()) {
    return listDeadlockEventsFromSupabase(dbInstanceId, limit);
  }

  return listDeadlockEventsFromMemory(dbInstanceId, limit);
};

/**
 * 대시보드와 실시간 화면에서 사용할 최신 모니터링 요약을 반환합니다.
 */
export const getMonitoringSummary = async (
  dbInstanceId: DbInstanceId,
): Promise<MonitoringSummary> => {
  if (shouldUseMssqlStorage()) {
    return getMonitoringSummaryFromMssql(dbInstanceId);
  }

  if (shouldUseSupabaseStorage()) {
    return getMonitoringSummaryFromSupabase(dbInstanceId);
  }

  return getMonitoringSummaryFromMemory(dbInstanceId);
};

/**
 * 저장소 상태 요약을 반환합니다.
 */
export const getMonitoringStorageSummary = async () => {
  if (shouldUseMssqlStorage()) {
    return getMonitoringStorageSummaryFromMssql();
  }

  if (shouldUseSupabaseStorage()) {
    return getMonitoringStorageSummaryFromSupabase();
  }

  return getMonitoringStorageSummaryFromMemory();
};
