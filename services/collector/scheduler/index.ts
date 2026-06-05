/** 인스턴스별 Collector 실행 엔진입니다. */

import { listDbInstances, updateCollectStatus } from "@/lib/inventory/store";
import type {
  CollectorContext,
  CollectorRunOptions,
  CollectorRunResult,
  CollectorRunScope,
} from "@/services/collector/types";
import { detectSqlRegressions } from "@/lib/analysis/sql-regression";
import { serializeError } from "@/lib/serialize-error";
import { saveCollectorRun, saveSessionsCollectorRun } from "@/services/storage";
import type { CollectStatus, DbInstanceId } from "@/types/domain";
import type { DbInstance } from "@/types/entities";

export type SchedulerStatus = {
  dbInstanceId: DbInstanceId;
  lastRunAt: string | null;
  nextRunAt: string | null;
  consecutiveFailures: number;
  lastStatus: CollectStatus | null;
  lastErrorMessage: string | null;
  isRunning: boolean;
};

type MutableSchedulerStatus = SchedulerStatus & {
  collectIntervalSec: number;
};

type GlobalSchedulerState = typeof globalThis & {
  __dbMonitoringCollectorSchedulerState?: Record<
    DbInstanceId,
    MutableSchedulerStatus
  >;
  __dbMonitoringCollectorSchedulerRuntime?: {
    intervalId: ReturnType<typeof setInterval> | null;
    isTickRunning: boolean;
    startedAt: string | null;
    lastTickAt: string | null;
  };
};

const now = () => new Date().toISOString();
const SCHEDULER_TICK_MS = 1_000;

const getState = () => {
  const globalState = globalThis as GlobalSchedulerState;

  if (!globalState.__dbMonitoringCollectorSchedulerState) {
    globalState.__dbMonitoringCollectorSchedulerState = {};
  }

  return globalState.__dbMonitoringCollectorSchedulerState;
};

const getOrCreateStatus = (
  dbInstanceId: DbInstanceId,
  collectIntervalSec: number,
): MutableSchedulerStatus => {
  const state = getState();

  if (!state[dbInstanceId]) {
    state[dbInstanceId] = {
      dbInstanceId,
      lastRunAt: null,
      nextRunAt: null,
      consecutiveFailures: 0,
      lastStatus: null,
      lastErrorMessage: null,
      isRunning: false,
      collectIntervalSec,
    };
  }

  state[dbInstanceId].collectIntervalSec = collectIntervalSec;

  return state[dbInstanceId];
};

const calculateNextRunAt = (collectIntervalSec: number) =>
  new Date(Date.now() + collectIntervalSec * 1_000).toISOString();

const getRuntime = () => {
  const globalState = globalThis as GlobalSchedulerState;

  if (!globalState.__dbMonitoringCollectorSchedulerRuntime) {
    globalState.__dbMonitoringCollectorSchedulerRuntime = {
      intervalId: null,
      isTickRunning: false,
      startedAt: null,
      lastTickAt: null,
    };
  }

  return globalState.__dbMonitoringCollectorSchedulerRuntime;
};

const isSchedulerDisabled = () =>
  process.env.COLLECTOR_SCHEDULER_DISABLED === "true";

const isRunDue = (status: MutableSchedulerStatus) => {
  if (status.isRunning) {
    return false;
  }

  if (!status.lastRunAt) {
    return true;
  }

  const elapsedMs = Date.now() - new Date(status.lastRunAt).getTime();
  return elapsedMs >= status.collectIntervalSec * 1_000;
};

const toCollectorContext = (
  instance: DbInstance,
  runScope?: CollectorRunScope,
): CollectorContext => ({
  dbInstanceId: instance.id,
  dbmsType: instance.dbmsType,
  connectionSecretRef: instance.connectionSecretRef,
  instanceName: instance.instanceName,
  host: instance.host,
  port: instance.port,
  serviceName: instance.serviceName,
  databaseName: instance.databaseName,
  envType: instance.envType,
  runScope,
});

const createFailedResult = (
  dbInstanceId: DbInstanceId,
  startedAt: string,
  error: unknown,
): CollectorRunResult => ({
  dbInstanceId,
  startedAt,
  finishedAt: now(),
  status: "FAIL",
  availability: null,
  metrics: [],
  sessions: [],
  locks: [],
  deadlocks: [],
  sql: [],
  sqlPlans: [],
  errorMessage:
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "수집 중 오류가 발생했습니다.",
});

/**
 * 활성 DB 인스턴스에 대한 스케줄러 상태 목록을 반환합니다.
 */
export const listSchedulerStatuses = async (): Promise<SchedulerStatus[]> => {
  const instances = await listDbInstances();

  return instances.map((instance) => {
    const status = getOrCreateStatus(instance.id, instance.collectIntervalSec);

    return {
      dbInstanceId: status.dbInstanceId,
      lastRunAt: status.lastRunAt,
      nextRunAt: status.nextRunAt,
      consecutiveFailures: status.consecutiveFailures,
      lastStatus: status.lastStatus,
      lastErrorMessage: status.lastErrorMessage,
      isRunning: status.isRunning,
    };
  });
};

/**
 * 수집 주기가 지난 활성 DB 인스턴스를 찾아 자동 수집합니다.
 */
export const runCollectorSchedulerTick = async () => {
  const runtime = getRuntime();

  if (runtime.isTickRunning) {
    return;
  }

  runtime.isTickRunning = true;
  runtime.lastTickAt = now();

  try {
    const activeInstances = (await listDbInstances()).filter(
      (instance) => instance.isActive,
    );

    for (const instance of activeInstances) {
      const status = getOrCreateStatus(instance.id, instance.collectIntervalSec);

      if (!status.nextRunAt) {
        status.nextRunAt = status.lastRunAt
          ? calculateNextRunAt(instance.collectIntervalSec)
          : now();
      }

      if (!isRunDue(status)) {
        continue;
      }

      try {
        await runCollectorForInstance(instance.id);
      } catch (instanceError) {
        console.error("[COLLECTOR_INSTANCE_FAILED]", {
          dbInstanceId: instance.id,
          error: serializeError(instanceError),
        });
      }
    }
  } catch (error) {
    console.error("[COLLECTOR_SCHEDULER_TICK_FAILED]", {
      error: serializeError(error),
    });
  } finally {
    runtime.isTickRunning = false;
  }
};

/**
 * 서버 프로세스 안에서 Collector 자동 수집 스케줄러를 한 번만 시작합니다.
 */
export const startCollectorScheduler = () => {
  const runtime = getRuntime();
  if (isSchedulerDisabled()) {
    return {
      started: false,
      reason: "disabled",
    };
  }

  if (runtime.intervalId) {
    if (process.env.NODE_ENV === "development") {
      clearInterval(runtime.intervalId);
      runtime.intervalId = null;
    } else {
      return {
        started: false,
        reason: "already_started",
      };
    }
  }

  runtime.startedAt = now();
  runtime.intervalId = setInterval(() => {
    void runCollectorSchedulerTick();
  }, SCHEDULER_TICK_MS);
  runtime.intervalId.unref?.();

  void runCollectorSchedulerTick();

  return {
    started: true,
    reason: "started",
  };
};

/**
 * 단일 DB 인스턴스에 대해 Collector를 한 번 실행하고 결과를 저장합니다.
 */
export const runCollectorForInstance = async (
  dbInstanceId: DbInstanceId,
  options: CollectorRunOptions = {},
): Promise<CollectorRunResult> => {
  const instance = (await listDbInstances()).find((item) => item.id === dbInstanceId);

  if (!instance) {
    throw new Error("DB 인스턴스를 찾을 수 없습니다.");
  }

  if (!instance.isActive) {
    throw new Error("비활성 DB 인스턴스는 수집할 수 없습니다.");
  }

  const scope = options.scope ?? "full";
  const status = getOrCreateStatus(instance.id, instance.collectIntervalSec);
  const startedAt = now();

  if (status.isRunning) {
    return {
      dbInstanceId: instance.id,
      startedAt,
      finishedAt: now(),
      status: "OK",
      availability: null,
      metrics: [],
      sessions: [],
      locks: [],
      deadlocks: [],
      sql: [],
      sqlPlans: [],
      errorMessage: null,
    };
  }

  status.isRunning = true;

  try {
    const { createCollectorAdapter } = await import("@/services/collector/registry");
    const adapter = createCollectorAdapter(toCollectorContext(instance, scope));

    let metrics: CollectorRunResult["metrics"] = [];
    let sessions: CollectorRunResult["sessions"] = [];
    let locks: CollectorRunResult["locks"] = [];
    let deadlocks: CollectorRunResult["deadlocks"] = [];
    let sql: CollectorRunResult["sql"] = [];
    let sqlPlans: CollectorRunResult["sqlPlans"] = [];
    let availability: CollectorRunResult["availability"] = null;

    if (scope === "sessions") {
      sessions = await adapter.collectSessions();
    } else {
      availability = await adapter.collectAvailability();

      if (!availability.isReachable) {
        throw new Error(availability.healthMessage ?? "DB 연결 확인에 실패했습니다.");
      }

      metrics = await adapter.collectMetrics();
      sessions = await adapter.collectSessions();
      locks = await adapter.collectLocks();
      deadlocks = await adapter.collectDeadlocks();
      sql = await adapter.collectSql();
      sqlPlans = adapter.collectSqlPlans
        ? await (adapter.collectSqlPlans?.() ?? Promise.resolve([]))
        : [];
    }

    const result: CollectorRunResult = {
      dbInstanceId: instance.id,
      startedAt,
      finishedAt: now(),
      status: "OK",
      availability,
      metrics,
      sessions,
      locks,
      deadlocks,
      sql,
      sqlPlans,
      errorMessage: null,
    };

    if (scope === "sessions") {
      await saveSessionsCollectorRun(result);
    } else {
      await saveCollectorRun(result);
    }

    if (scope === "full") {
      try {
        await detectSqlRegressions(instance.id);
      } catch (regressionError) {
        console.warn("[COLLECTOR_REGRESSION_DETECT_FAILED]", {
          dbInstanceId: instance.id,
          message:
            regressionError instanceof Error
              ? regressionError.message
              : "회귀 탐지 중 오류가 발생했습니다.",
        });
      }
    }

    await updateCollectStatus(instance.id, "OK");
    status.lastStatus = "OK";
    status.lastErrorMessage = null;
    status.consecutiveFailures = 0;
    status.lastRunAt = result.finishedAt;
    status.nextRunAt = calculateNextRunAt(instance.collectIntervalSec);

    return result;
  } catch (error) {
    const result = createFailedResult(instance.id, startedAt, error);

    // #region agent log
    fetch("http://127.0.0.1:7718/ingest/0b6cee79-769d-4ee1-a9e0-bafe5550e42a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "469e27",
      },
      body: JSON.stringify({
        sessionId: "469e27",
        runId: "collect-fail",
        hypothesisId: "B",
        location: "scheduler/index.ts:collect-catch",
        message: "collector run failed",
        data: {
          dbInstanceId: instance.id,
          instanceName: instance.instanceName,
          dbmsType: instance.dbmsType,
          host: instance.host,
          databaseName: instance.databaseName,
          errorMessage: result.errorMessage,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    await saveCollectorRun(result);
    await updateCollectStatus(instance.id, "FAIL");
    status.lastStatus = "FAIL";
    status.lastErrorMessage = result.errorMessage;
    status.consecutiveFailures += 1;
    status.lastRunAt = result.finishedAt;
    status.nextRunAt = calculateNextRunAt(instance.collectIntervalSec);

    return result;
  } finally {
    status.isRunning = false;
  }
};

/**
 * 활성화된 모든 DB 인스턴스를 한 번씩 수집합니다.
 */
export const runCollectorOnce = async () => {
  const activeInstances = (await listDbInstances()).filter((instance) => instance.isActive);
  const results: CollectorRunResult[] = [];

  for (const instance of activeInstances) {
    results.push(await runCollectorForInstance(instance.id));
  }

  return results;
};
