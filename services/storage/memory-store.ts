/** 개발용 메모리 기반 수집 결과 저장소입니다. */

import { pickFullestMetricSnapshot } from "@/lib/monitoring/metric-details";
import { buildResourceSummary } from "@/lib/monitoring/resource-summary";
import type { CollectorRunResult } from "@/services/collector/types";
import { normalizeCollectorRun } from "@/services/storage/normalize";
import type {
  BlockingSnapshotRecord,
  CollectionRunRecord,
  DeadlockRecord,
  MetricHistoryRecord,
  MonitoringStorageState,
  MonitoringSummary,
  SessionSnapshotRecord,
  SqlPerformanceRecord,
  SqlPlanSnapshotRecord,
  SqlRegressionEventRecord,
} from "@/services/storage/types";
import type { DbInstanceId } from "@/types/domain";

type GlobalMonitoringStorageState = typeof globalThis & {
  __dbMonitoringStorageState?: MonitoringStorageState;
};

const MAX_RECORDS_PER_BUCKET = 5_000;

const getState = (): MonitoringStorageState => {
  const globalState = globalThis as GlobalMonitoringStorageState;

  if (!globalState.__dbMonitoringStorageState) {
    globalState.__dbMonitoringStorageState = {
      collectionRuns: [],
      metricHistory: [],
      sessionSnapshots: [],
      blockingSnapshots: [],
      sqlPerformance: [],
      sqlPlanSnapshots: [],
      sqlRegressionEvents: [],
      deadlocks: [],
    };
  }

  if (!globalState.__dbMonitoringStorageState.sqlPlanSnapshots) {
    globalState.__dbMonitoringStorageState.sqlPlanSnapshots = [];
  }

  if (!globalState.__dbMonitoringStorageState.sqlRegressionEvents) {
    globalState.__dbMonitoringStorageState.sqlRegressionEvents = [];
  }

  return globalState.__dbMonitoringStorageState;
};

const trimBucket = <T>(items: T[]) => items.slice(-MAX_RECORDS_PER_BUCKET);

export const saveCollectorRunToMemory = async (result: CollectorRunResult) => {
  const state = getState();
  const normalized = normalizeCollectorRun(result);

  state.collectionRuns = trimBucket([
    ...state.collectionRuns,
    normalized.collectionRun,
  ]);
  state.metricHistory = trimBucket([
    ...state.metricHistory,
    ...normalized.metricHistory,
  ]);
  state.sessionSnapshots = trimBucket([
    ...state.sessionSnapshots,
    ...normalized.sessionSnapshots,
  ]);
  state.blockingSnapshots = trimBucket([
    ...state.blockingSnapshots,
    ...normalized.blockingSnapshots,
  ]);
  state.sqlPerformance = trimBucket([
    ...state.sqlPerformance,
    ...normalized.sqlPerformance,
  ]);
  state.sqlPlanSnapshots = trimBucket([
    ...state.sqlPlanSnapshots,
    ...normalized.sqlPlanSnapshots,
  ]);
  state.deadlocks = trimBucket([...state.deadlocks, ...normalized.deadlocks]);

  return normalized.collectionRun;
};

export const listCollectionRunsFromMemory = async (
  dbInstanceId?: DbInstanceId,
): Promise<CollectionRunRecord[]> => {
  const runs = getState().collectionRuns;
  const filtered = dbInstanceId
    ? runs.filter((run) => run.dbInstanceId === dbInstanceId)
    : runs;

  return [...filtered].reverse();
};

export const listMetricHistoryFromMemory = async (params: {
  dbInstanceId?: DbInstanceId;
  metricName?: string;
  sqlId?: string;
  limit?: number;
}): Promise<MetricHistoryRecord[]> => {
  const limit = params.limit ?? 200;
  const filtered = getState().metricHistory.filter((metric) => {
    if (params.dbInstanceId && metric.dbInstanceId !== params.dbInstanceId) {
      return false;
    }

    if (params.metricName && metric.metricName !== params.metricName) {
      return false;
    }

    return true;
  });

  return [...filtered]
    .sort((left, right) => left.metricTime.localeCompare(right.metricTime))
    .slice(-limit);
};

export const listSessionSnapshotsFromMemory = async (
  dbInstanceId?: DbInstanceId,
  limit = 200,
): Promise<SessionSnapshotRecord[]> => {
  const filtered = getState().sessionSnapshots.filter(
    (session) => !dbInstanceId || session.dbInstanceId === dbInstanceId,
  );

  return filtered.slice(-limit).reverse();
};

export const listSqlPerformanceFromMemory = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
  sqlId?: string,
): Promise<SqlPerformanceRecord[]> => {
  const filtered = getState().sqlPerformance.filter((sql) => {
    if (dbInstanceId && sql.dbInstanceId !== dbInstanceId) {
      return false;
    }

    if (sqlId && sql.sqlId !== sqlId) {
      return false;
    }

    return true;
  });

  return filtered.slice(-limit).reverse();
};

export const listSqlPlanSnapshotsFromMemory = async (params: {
  dbInstanceId: DbInstanceId;
  sqlId?: string;
  limit?: number;
}): Promise<SqlPlanSnapshotRecord[]> => {
  const limit = params.limit ?? 50;
  const filtered = getState().sqlPlanSnapshots.filter((plan) => {
    if (plan.dbInstanceId !== params.dbInstanceId) {
      return false;
    }

    if (params.sqlId && plan.sqlId !== params.sqlId) {
      return false;
    }

    return true;
  });

  return filtered.slice(-limit).reverse();
};

export const listSqlRegressionEventsFromMemory = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<SqlRegressionEventRecord[]> => {
  const filtered = getState().sqlRegressionEvents.filter(
    (event) => !dbInstanceId || event.dbInstanceId === dbInstanceId,
  );

  return filtered.slice(-limit).reverse();
};

export const saveSqlRegressionEventsToMemory = async (
  events: SqlRegressionEventRecord[],
) => {
  const state = getState();
  state.sqlRegressionEvents = trimBucket([...state.sqlRegressionEvents, ...events]);
};

export const listBlockingSnapshotsFromMemory = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<BlockingSnapshotRecord[]> => {
  const filtered = getState().blockingSnapshots.filter(
    (blocking) => !dbInstanceId || blocking.dbInstanceId === dbInstanceId,
  );

  return filtered.slice(-limit).reverse();
};

export const listDeadlockEventsFromMemory = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<DeadlockRecord[]> => {
  const filtered = getState().deadlocks.filter(
    (deadlock) => !dbInstanceId || deadlock.dbInstanceId === dbInstanceId,
  );

  return filtered.slice(-limit).reverse();
};

export const getMonitoringSummaryFromMemory = async (
  dbInstanceId: DbInstanceId,
): Promise<MonitoringSummary> => {
  const latestRun = (await listCollectionRunsFromMemory(dbInstanceId))[0] ?? null;
  const recentMetrics = getState().metricHistory.filter(
    (metric) => metric.dbInstanceId === dbInstanceId,
  );
  const latestMetrics = pickFullestMetricSnapshot(recentMetrics.slice(-500));
  const latestSessionTime = getState()
    .sessionSnapshots.filter((session) => session.dbInstanceId === dbInstanceId)
    .at(-1)?.snapshotTime;

  return {
    dbInstanceId,
    lastRun: latestRun,
    latestMetrics,
    resourceSummary: buildResourceSummary(latestMetrics),
    latestSessions: latestSessionTime
      ? getState().sessionSnapshots.filter(
          (session) =>
            session.dbInstanceId === dbInstanceId &&
            session.snapshotTime === latestSessionTime,
        )
      : [],
    latestSql: await listSqlPerformanceFromMemory(dbInstanceId, 10),
    blockingCount: (await listBlockingSnapshotsFromMemory(dbInstanceId, 100)).length,
    deadlockCount: (await listDeadlockEventsFromMemory(dbInstanceId, 100)).length,
  };
};

export const getMonitoringStorageSummaryFromMemory = async () => {
  const state = getState();

  return {
    collectionRuns: state.collectionRuns.length,
    metricHistory: state.metricHistory.length,
    sessionSnapshots: state.sessionSnapshots.length,
    blockingSnapshots: state.blockingSnapshots.length,
    sqlPerformance: state.sqlPerformance.length,
    sqlPlanSnapshots: state.sqlPlanSnapshots.length,
    sqlRegressionEvents: state.sqlRegressionEvents.length,
    deadlocks: state.deadlocks.length,
    backend: "memory" as const,
  };
};
