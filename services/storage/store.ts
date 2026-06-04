/** 수집 결과 저장소 facade — Supabase 우선, 미설정 시 메모리 fallback입니다. */

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

const shouldUseSupabaseStorage = () => isSupabaseMonitoringStorageEnabled();

/**
 * Collector 실행 결과를 저장합니다.
 */
export const saveCollectorRun = async (result: CollectorRunResult) =>
  shouldUseSupabaseStorage() ? saveCollectorRunToSupabase(result) : saveCollectorRunToMemory(result);

/** 실시간 세션 경량 수집 결과(세션 스냅샷만)를 저장합니다. */
export const saveSessionsCollectorRun = async (result: CollectorRunResult) =>
  shouldUseSupabaseStorage()
    ? saveSessionsCollectorRunToSupabase(result)
    : saveSessionsCollectorRunToMemory(result);

/**
 * 최근 Collector 실행 이력을 반환합니다.
 */
export const listCollectionRuns = async (
  dbInstanceId?: DbInstanceId,
): Promise<CollectionRunRecord[]> =>
  shouldUseSupabaseStorage()
    ? listCollectionRunsFromSupabase(dbInstanceId)
    : listCollectionRunsFromMemory(dbInstanceId);

/**
 * 시계열 지표 이력을 반환합니다.
 */
export const listMetricHistory = async (params: {
  dbInstanceId?: DbInstanceId;
  metricName?: string;
  limit?: number;
}): Promise<MetricHistoryRecord[]> =>
  shouldUseSupabaseStorage()
    ? listMetricHistoryFromSupabase(params)
    : listMetricHistoryFromMemory(params);

/**
 * 최근 세션 스냅샷을 반환합니다.
 */
export const listSessionSnapshots = async (
  dbInstanceId?: DbInstanceId,
  limit = 200,
): Promise<SessionSnapshotRecord[]> =>
  shouldUseSupabaseStorage()
    ? listSessionSnapshotsFromSupabase(dbInstanceId, limit)
    : listSessionSnapshotsFromMemory(dbInstanceId, limit);

/**
 * 최근 SQL 성능 집계 결과를 반환합니다.
 */
export const listSqlPerformance = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
  sqlId?: string,
): Promise<SqlPerformanceRecord[]> =>
  shouldUseSupabaseStorage()
    ? listSqlPerformanceFromSupabase(dbInstanceId, limit, sqlId)
    : listSqlPerformanceFromMemory(dbInstanceId, limit, sqlId);

/**
 * SQL 실행 계획 스냅샷을 반환합니다.
 */
export const listSqlPlanSnapshots = async (params: {
  dbInstanceId: DbInstanceId;
  sqlId?: string;
  limit?: number;
}): Promise<SqlPlanSnapshotRecord[]> =>
  shouldUseSupabaseStorage()
    ? listSqlPlanSnapshotsFromSupabase(params)
    : listSqlPlanSnapshotsFromMemory(params);

/**
 * SQL 성능 회귀 이벤트를 반환합니다.
 */
export const listSqlRegressionEvents = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<SqlRegressionEventRecord[]> =>
  shouldUseSupabaseStorage()
    ? listSqlRegressionEventsFromSupabase(dbInstanceId, limit)
    : listSqlRegressionEventsFromMemory(dbInstanceId, limit);

/**
 * SQL 성능 회귀 이벤트를 저장합니다.
 */
export const saveSqlRegressionEvents = async (events: SqlRegressionEventRecord[]) =>
  shouldUseSupabaseStorage()
    ? saveSqlRegressionEventsToSupabase(events)
    : saveSqlRegressionEventsToMemory(events);

/**
 * 최근 Blocking 스냅샷을 반환합니다.
 */
export const listBlockingSnapshots = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<BlockingSnapshotRecord[]> =>
  shouldUseSupabaseStorage()
    ? listBlockingSnapshotsFromSupabase(dbInstanceId, limit)
    : listBlockingSnapshotsFromMemory(dbInstanceId, limit);

/**
 * 최근 Deadlock 이벤트를 반환합니다.
 */
export const listDeadlockEvents = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<DeadlockRecord[]> =>
  shouldUseSupabaseStorage()
    ? listDeadlockEventsFromSupabase(dbInstanceId, limit)
    : listDeadlockEventsFromMemory(dbInstanceId, limit);

/**
 * 대시보드와 실시간 화면에서 사용할 최신 모니터링 요약을 반환합니다.
 */
export const getMonitoringSummary = async (
  dbInstanceId: DbInstanceId,
): Promise<MonitoringSummary> =>
  shouldUseSupabaseStorage()
    ? getMonitoringSummaryFromSupabase(dbInstanceId)
    : getMonitoringSummaryFromMemory(dbInstanceId);

/**
 * 저장소 상태 요약을 반환합니다.
 */
export const getMonitoringStorageSummary = async () =>
  shouldUseSupabaseStorage()
    ? getMonitoringStorageSummaryFromSupabase()
    : getMonitoringStorageSummaryFromMemory();
