/** Collector 어댑터·수집 payload 타입 (T-003 §4.4, T-014)입니다. */

import type { DbInstanceId, DbmsType } from "@/types/domain";

export type ConnectionTestResult = {
  success: boolean;
  message: string;
  latencyMs?: number;
};

/** 수동·스케줄 수집 범위입니다. */
export type CollectorRunScope = "full" | "sessions";

export type CollectorContext = {
  dbInstanceId: DbInstanceId;
  dbmsType: DbmsType;
  connectionSecretRef: string;
  instanceName: string;
  host: string;
  port: number;
  serviceName: string | null;
  databaseName: string | null;
  envType: string;
  /** sessions일 때 어댑터가 세션 전용 경량 쿼리를 실행합니다. */
  runScope?: CollectorRunScope;
};

export type CollectorRunOptions = {
  scope?: CollectorRunScope;
};

/** DBMS별 수집 어댑터 공통 인터페이스 */
export type ICollectorAdapter = {
  connect: () => Promise<ConnectionTestResult>;
  collectAvailability: () => Promise<AvailabilityPayload>;
  collectMetrics: () => Promise<MetricPayload[]>;
  collectSessions: () => Promise<SessionPayload[]>;
  collectLocks: () => Promise<BlockingPayload[]>;
  collectDeadlocks: () => Promise<DeadlockPayload[]>;
  collectSql: () => Promise<SqlPerformancePayload[]>;
  collectSqlPlans?: () => Promise<SqlPlanPayload[]>;
};

export type CollectorAdapter = ICollectorAdapter;

export type AvailabilityPayload = {
  collectTime: string;
  isReachable: boolean;
  healthMessage?: string;
  latencyMs?: number;
  serverName?: string | null;
  databaseName?: string | null;
  version?: string | null;
};

export type MetricPayload = {
  collectTime: string;
  metricName: string;
  metricValue: number;
  unit?: string;
  tags?: Record<string, string>;
};

export type SessionPayload = {
  collectTime: string;
  sessionId: string;
  loginName: string;
  status: string;
  waitType: string | null;
  waitMs: number | null;
  sqlId: string | null;
  blockingSessionId?: string | null;
  command?: string | null;
  cpuTimeMs?: number | null;
  logicalReads?: number | null;
  sqlTextMasked?: string | null;
  hostName?: string | null;
  programName?: string | null;
  databaseName?: string | null;
};

export type BlockingPayload = {
  collectTime: string;
  blockerSessionId: string;
  blockedSessionId: string;
  lockType: string;
  waitMs: number;
  objectName: string | null;
};

export type DeadlockPayload = {
  occurredAt: string;
  victimSessionId: string;
  graphXml: string;
};

export type SqlPerformancePayload = {
  collectTime: string;
  sqlId: string;
  sqlTextMasked: string;
  executions: number;
  avgElapsedMs: number;
  totalCpuMs: number;
  totalLogicalReads?: number;
  lastExecutionTime?: string | null;
};

export type SqlPlanPayload = {
  collectTime: string;
  sqlId: string;
  planHash: string;
  planText: string;
  avgElapsedMs: number;
  totalCpuMs: number;
  totalLogicalReads?: number;
  executions: number;
};

export type CollectorAdapterFactory = (
  context: CollectorContext,
) => CollectorAdapter;

export type CollectorRunResult = {
  dbInstanceId: DbInstanceId;
  startedAt: string;
  finishedAt: string;
  status: "OK" | "FAIL";
  availability: AvailabilityPayload | null;
  metrics: MetricPayload[];
  sessions: SessionPayload[];
  locks: BlockingPayload[];
  deadlocks: DeadlockPayload[];
  sql: SqlPerformancePayload[];
  sqlPlans: SqlPlanPayload[];
  errorMessage: string | null;
};
