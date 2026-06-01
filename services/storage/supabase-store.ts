/** Supabase/PostgreSQL 기반 수집 결과 저장소입니다. */

import { ApiRouteError } from "@/lib/api";
import { serializeError } from "@/lib/serialize-error";
import { pickFullestMetricSnapshot } from "@/lib/monitoring/metric-details";
import { buildResourceSummary } from "@/lib/monitoring/resource-summary";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/db/supabase-server";
import type { CollectorRunResult } from "@/services/collector/types";
import { normalizeCollectorRun } from "@/services/storage/normalize";
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

const BATCH_SIZE = 200;
const SQL_PLAN_TEXT_MAX_LENGTH = 8_000;
const SQL_PLAN_INSERT_BATCH_SIZE = 1;

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

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const truncatePlanText = (planText: string) =>
  planText.length > SQL_PLAN_TEXT_MAX_LENGTH
    ? `${planText.slice(0, SQL_PLAN_TEXT_MAX_LENGTH)}...(truncated)`
    : planText;

const insertInBatches = async (
  table: string,
  rows: Record<string, unknown>[],
  batchSize = BATCH_SIZE,
) => {
  if (rows.length === 0) {
    return;
  }

  const client = getClient();

  for (const batch of chunk(rows, batchSize)) {
    const { error } = await client.from(table).insert(batch);

    if (error) {
      throw error;
    }
  }
};

type CollectionRunRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  started_at: string;
  finished_at: string;
  status: string;
  error_message: string | null;
  metrics_count: number;
  sessions_count: number;
  locks_count: number;
  sql_count: number;
};

type MetricHistoryRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  metric_time: string;
  metric_name: string;
  metric_value: number;
  unit: string | null;
  tags: Record<string, string>;
};

type SessionSnapshotRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  snapshot_time: string;
  session_id: string;
  login_name: string;
  status: string;
  wait_type: string | null;
  wait_ms: number | null;
  sql_id: string | null;
  blocking_session_id: string | null;
  command: string | null;
  cpu_time_ms: number | null;
  logical_reads: number | null;
  sql_text_masked: string | null;
  host_name: string | null;
  program_name: string | null;
  database_name: string | null;
};

type BlockingSnapshotRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  snapshot_time: string;
  blocker_session_id: string;
  blocked_session_id: string;
  lock_type: string;
  wait_ms: number;
  object_name: string | null;
};

type SqlPerformanceRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  metric_time: string;
  sql_id: string;
  sql_text_masked: string;
  executions: number;
  avg_elapsed_ms: number;
  total_cpu_ms: number;
  total_logical_reads: number | null;
  last_execution_time: string | null;
};

type SqlPlanSnapshotRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  captured_at: string;
  sql_id: string;
  plan_hash: string;
  plan_text: string;
  avg_elapsed_ms: number;
  total_cpu_ms: number;
  total_logical_reads: number | null;
  executions: number;
};

type DeadlockRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  occurred_at: string;
  victim_session_id: string;
  graph_xml: string;
};

type SqlRegressionRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  detected_at: string;
  sql_id: string;
  metric_key: string;
  baseline_value: number;
  current_value: number;
  change_percent: number;
  severity: string;
  recommendation: string;
  status: string;
  issue_candidate: Record<string, unknown>;
};

const toCollectionRun = (row: CollectionRunRow): CollectionRunRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  status: row.status as CollectionRunRecord["status"],
  errorMessage: row.error_message,
  metricsCount: row.metrics_count,
  sessionsCount: row.sessions_count,
  locksCount: row.locks_count,
  sqlCount: row.sql_count,
});

const toMetricHistory = (row: MetricHistoryRow): MetricHistoryRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  metricTime: row.metric_time,
  metricName: row.metric_name,
  metricValue: row.metric_value,
  unit: row.unit,
  tags: row.tags ?? {},
});

const toSessionSnapshot = (row: SessionSnapshotRow): SessionSnapshotRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  snapshotTime: row.snapshot_time,
  sessionId: row.session_id,
  loginName: row.login_name,
  status: row.status,
  waitType: row.wait_type,
  waitMs: row.wait_ms,
  sqlId: row.sql_id,
  blockingSessionId: row.blocking_session_id,
  command: row.command,
  cpuTimeMs: row.cpu_time_ms,
  logicalReads: row.logical_reads,
  sqlTextMasked: row.sql_text_masked,
  hostName: row.host_name,
  programName: row.program_name,
  databaseName: row.database_name,
});

const toBlockingSnapshot = (row: BlockingSnapshotRow): BlockingSnapshotRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  snapshotTime: row.snapshot_time,
  blockerSessionId: row.blocker_session_id,
  blockedSessionId: row.blocked_session_id,
  lockType: row.lock_type,
  waitMs: row.wait_ms,
  objectName: row.object_name,
});

const toSqlPerformance = (row: SqlPerformanceRow): SqlPerformanceRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  metricTime: row.metric_time,
  sqlId: row.sql_id,
  sqlTextMasked: row.sql_text_masked,
  executions: Number(row.executions),
  avgElapsedMs: row.avg_elapsed_ms,
  totalCpuMs: row.total_cpu_ms,
  totalLogicalReads: row.total_logical_reads,
  lastExecutionTime: row.last_execution_time,
});

const toSqlPlanSnapshot = (row: SqlPlanSnapshotRow): SqlPlanSnapshotRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  capturedAt: row.captured_at,
  sqlId: row.sql_id,
  planHash: row.plan_hash,
  planText: row.plan_text,
  avgElapsedMs: row.avg_elapsed_ms,
  totalCpuMs: row.total_cpu_ms,
  totalLogicalReads: row.total_logical_reads,
  executions: Number(row.executions),
});

const toDeadlock = (row: DeadlockRow): DeadlockRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  occurredAt: row.occurred_at,
  victimSessionId: row.victim_session_id,
  graphXml: row.graph_xml,
});

const toSqlRegression = (row: SqlRegressionRow): SqlRegressionEventRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  detectedAt: row.detected_at,
  sqlId: row.sql_id,
  metricKey: row.metric_key,
  baselineValue: row.baseline_value,
  currentValue: row.current_value,
  changePercent: row.change_percent,
  severity: row.severity as SqlRegressionEventRecord["severity"],
  recommendation: row.recommendation,
  status: row.status as SqlRegressionEventRecord["status"],
  issueCandidate: row.issue_candidate ?? {},
});

export const isSupabaseMonitoringStorageEnabled = () => isSupabaseServerConfigured();

export const saveCollectorRunToSupabase = async (result: CollectorRunResult) => {
  const normalized = normalizeCollectorRun(result);

  await insertInBatches("collection_run", [
    {
      id: normalized.collectionRun.id,
      tenant_id: normalized.collectionRun.tenantId,
      db_instance_id: normalized.collectionRun.dbInstanceId,
      started_at: normalized.collectionRun.startedAt,
      finished_at: normalized.collectionRun.finishedAt,
      status: normalized.collectionRun.status,
      error_message: normalized.collectionRun.errorMessage,
      metrics_count: normalized.collectionRun.metricsCount,
      sessions_count: normalized.collectionRun.sessionsCount,
      locks_count: normalized.collectionRun.locksCount,
      sql_count: normalized.collectionRun.sqlCount,
    },
  ]);

  await insertInBatches(
    "metric_history",
    normalized.metricHistory.map((metric) => ({
      id: metric.id,
      tenant_id: metric.tenantId,
      db_instance_id: metric.dbInstanceId,
      metric_time: metric.metricTime,
      metric_name: metric.metricName,
      metric_value: metric.metricValue,
      unit: metric.unit,
      tags: metric.tags,
    })),
  );

  await insertInBatches(
    "session_snapshot",
    normalized.sessionSnapshots.map((session) => ({
      id: session.id,
      tenant_id: session.tenantId,
      db_instance_id: session.dbInstanceId,
      snapshot_time: session.snapshotTime,
      session_id: session.sessionId,
      login_name: session.loginName,
      status: session.status,
      wait_type: session.waitType,
      wait_ms: session.waitMs,
      sql_id: session.sqlId,
      blocking_session_id: session.blockingSessionId,
      command: session.command,
      cpu_time_ms: session.cpuTimeMs,
      logical_reads: session.logicalReads,
      sql_text_masked: session.sqlTextMasked,
      host_name: session.hostName,
      program_name: session.programName,
      database_name: session.databaseName,
    })),
  );

  await insertInBatches(
    "blocking_snapshot",
    normalized.blockingSnapshots.map((blocking) => ({
      id: blocking.id,
      tenant_id: blocking.tenantId,
      db_instance_id: blocking.dbInstanceId,
      snapshot_time: blocking.snapshotTime,
      blocker_session_id: blocking.blockerSessionId,
      blocked_session_id: blocking.blockedSessionId,
      lock_type: blocking.lockType,
      wait_ms: blocking.waitMs,
      object_name: blocking.objectName,
    })),
  );

  await insertInBatches(
    "sql_performance",
    normalized.sqlPerformance.map((sql) => ({
      id: sql.id,
      tenant_id: sql.tenantId,
      db_instance_id: sql.dbInstanceId,
      metric_time: sql.metricTime,
      sql_id: sql.sqlId,
      sql_text_masked: sql.sqlTextMasked,
      executions: sql.executions,
      avg_elapsed_ms: sql.avgElapsedMs,
      total_cpu_ms: sql.totalCpuMs,
      total_logical_reads: sql.totalLogicalReads,
      last_execution_time: sql.lastExecutionTime,
    })),
  );

  if (normalized.sqlPlanSnapshots.length > 0) {
    try {
      await insertInBatches(
        "sql_plan_snapshot",
        normalized.sqlPlanSnapshots.map((plan) => ({
          id: plan.id,
          tenant_id: plan.tenantId,
          db_instance_id: plan.dbInstanceId,
          captured_at: plan.capturedAt,
          sql_id: plan.sqlId,
          plan_hash: plan.planHash,
          plan_text: truncatePlanText(plan.planText),
          avg_elapsed_ms: plan.avgElapsedMs,
          total_cpu_ms: plan.totalCpuMs,
          total_logical_reads: plan.totalLogicalReads,
          executions: plan.executions,
        })),
        SQL_PLAN_INSERT_BATCH_SIZE,
      );
    } catch (error) {
      console.warn("[STORAGE_SQL_PLAN_SAVE_SKIPPED]", {
        dbInstanceId: normalized.collectionRun.dbInstanceId,
        planCount: normalized.sqlPlanSnapshots.length,
        error: serializeError(error),
      });
    }
  }

  await insertInBatches(
    "deadlock_event",
    normalized.deadlocks.map((deadlock) => ({
      id: deadlock.id,
      tenant_id: deadlock.tenantId,
      db_instance_id: deadlock.dbInstanceId,
      occurred_at: deadlock.occurredAt,
      victim_session_id: deadlock.victimSessionId,
      graph_xml: deadlock.graphXml,
    })),
  );

  return normalized.collectionRun;
};

export const listCollectionRunsFromSupabase = async (
  dbInstanceId?: DbInstanceId,
): Promise<CollectionRunRecord[]> => {
  let query = getClient()
    .from("collection_run")
    .select("*")
    .order("finished_at", { ascending: false })
    .limit(100);

  if (dbInstanceId) {
    query = query.eq("db_instance_id", dbInstanceId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as CollectionRunRow[]).map(toCollectionRun);
};

export const listMetricHistoryFromSupabase = async (params: {
  dbInstanceId?: DbInstanceId;
  metricName?: string;
  limit?: number;
  metricTimeGte?: string;
}): Promise<MetricHistoryRecord[]> => {
  const limit = params.limit ?? 200;
  let query = getClient()
    .from("metric_history")
    .select("*")
    .order("metric_time", { ascending: false })
    .limit(limit);

  if (params.dbInstanceId) {
    query = query.eq("db_instance_id", params.dbInstanceId);
  }

  if (params.metricName) {
    query = query.eq("metric_name", params.metricName);
  }

  if (params.metricTimeGte) {
    query = query.gte("metric_time", params.metricTimeGte);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as MetricHistoryRow[]).map(toMetricHistory);
};

export const listSessionSnapshotsFromSupabase = async (
  dbInstanceId?: DbInstanceId,
  limit = 200,
): Promise<SessionSnapshotRecord[]> => {
  let query = getClient()
    .from("session_snapshot")
    .select("*")
    .order("snapshot_time", { ascending: false })
    .limit(limit);

  if (dbInstanceId) {
    query = query.eq("db_instance_id", dbInstanceId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as SessionSnapshotRow[]).map(toSessionSnapshot);
};

export const listSqlPerformanceFromSupabase = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
  sqlId?: string,
): Promise<SqlPerformanceRecord[]> => {
  let query = getClient()
    .from("sql_performance")
    .select("*")
    .order("metric_time", { ascending: false })
    .limit(limit);

  if (dbInstanceId) {
    query = query.eq("db_instance_id", dbInstanceId);
  }

  if (sqlId) {
    query = query.eq("sql_id", sqlId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as SqlPerformanceRow[]).map(toSqlPerformance);
};

export const listSqlPlanSnapshotsFromSupabase = async (params: {
  dbInstanceId: DbInstanceId;
  sqlId?: string;
  limit?: number;
}): Promise<SqlPlanSnapshotRecord[]> => {
  const limit = params.limit ?? 50;
  let query = getClient()
    .from("sql_plan_snapshot")
    .select("*")
    .eq("db_instance_id", params.dbInstanceId)
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (params.sqlId) {
    query = query.eq("sql_id", params.sqlId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as SqlPlanSnapshotRow[]).map(toSqlPlanSnapshot);
};

export const listSqlRegressionEventsFromSupabase = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<SqlRegressionEventRecord[]> => {
  let query = getClient()
    .from("sql_regression_event")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(limit);

  if (dbInstanceId) {
    query = query.eq("db_instance_id", dbInstanceId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as SqlRegressionRow[]).map(toSqlRegression);
};

export const saveSqlRegressionEventsToSupabase = async (
  events: SqlRegressionEventRecord[],
) => {
  await insertInBatches(
    "sql_regression_event",
    events.map((event) => ({
      id: event.id,
      tenant_id: event.tenantId,
      db_instance_id: event.dbInstanceId,
      detected_at: event.detectedAt,
      sql_id: event.sqlId,
      metric_key: event.metricKey,
      baseline_value: event.baselineValue,
      current_value: event.currentValue,
      change_percent: event.changePercent,
      severity: event.severity,
      recommendation: event.recommendation,
      status: event.status,
      issue_candidate: event.issueCandidate,
    })),
  );
};

export const listBlockingSnapshotsFromSupabase = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<BlockingSnapshotRecord[]> => {
  let query = getClient()
    .from("blocking_snapshot")
    .select("*")
    .order("snapshot_time", { ascending: false })
    .limit(limit);

  if (dbInstanceId) {
    query = query.eq("db_instance_id", dbInstanceId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as BlockingSnapshotRow[]).map(toBlockingSnapshot);
};

export const listDeadlockEventsFromSupabase = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<DeadlockRecord[]> => {
  let query = getClient()
    .from("deadlock_event")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (dbInstanceId) {
    query = query.eq("db_instance_id", dbInstanceId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as DeadlockRow[]).map(toDeadlock);
};

const SUMMARY_METRIC_LIMIT = 200;
const SUMMARY_METRIC_LOOKBACK_MS = 2 * 60 * 60 * 1_000;

export const getMonitoringSummaryFromSupabase = async (
  dbInstanceId: DbInstanceId,
): Promise<MonitoringSummary> => {
  const latestRun = (await listCollectionRunsFromSupabase(dbInstanceId))[0] ?? null;
  const recentMetrics = await listMetricHistoryFromSupabase({
    dbInstanceId,
    limit: SUMMARY_METRIC_LIMIT,
    metricTimeGte: new Date(Date.now() - SUMMARY_METRIC_LOOKBACK_MS).toISOString(),
  });
  const latestMetrics = pickFullestMetricSnapshot(recentMetrics);

  const { data: latestSessionRow, error: sessionError } = await getClient()
    .from("session_snapshot")
    .select("snapshot_time")
    .eq("db_instance_id", dbInstanceId)
    .order("snapshot_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    throw sessionError;
  }

  const latestSessionTime = latestSessionRow?.snapshot_time ?? null;

  let latestSessions: SessionSnapshotRow[] = [];

  if (latestSessionTime) {
    const { data: sessionRows, error: sessionsError } = await getClient()
      .from("session_snapshot")
      .select("*")
      .eq("db_instance_id", dbInstanceId)
      .eq("snapshot_time", latestSessionTime);

    if (sessionsError) {
      throw sessionsError;
    }

    latestSessions = (sessionRows ?? []) as SessionSnapshotRow[];
  }

  const blockingCountQuery = getClient()
    .from("blocking_snapshot")
    .select("id", { count: "exact", head: true });

  const deadlockCountQuery = getClient()
    .from("deadlock_event")
    .select("id", { count: "exact", head: true });

  const [blockingResult, deadlockResult] = await Promise.all([
    blockingCountQuery.eq("db_instance_id", dbInstanceId),
    deadlockCountQuery.eq("db_instance_id", dbInstanceId),
  ]);

  if (blockingResult.error) {
    throw blockingResult.error;
  }

  if (deadlockResult.error) {
    throw deadlockResult.error;
  }

  const blockingCount = blockingResult.count;
  const deadlockCount = deadlockResult.count;

  return {
    dbInstanceId,
    lastRun: latestRun,
    latestMetrics,
    resourceSummary: buildResourceSummary(latestMetrics),
    latestSessions: (latestSessions as SessionSnapshotRow[]).map(toSessionSnapshot),
    latestSql: await listSqlPerformanceFromSupabase(dbInstanceId, 10),
    blockingCount: blockingCount ?? 0,
    deadlockCount: deadlockCount ?? 0,
  };
};

export const getMonitoringStorageSummaryFromSupabase = async () => {
  const client = getClient();
  const tables = [
    "collection_run",
    "metric_history",
    "session_snapshot",
    "blocking_snapshot",
    "sql_performance",
    "sql_plan_snapshot",
    "sql_regression_event",
    "deadlock_event",
  ] as const;

  const counts = await Promise.all(
    tables.map(async (table) => {
      const { count, error } = await client
        .from(table)
        .select("id", { count: "exact", head: true });

      if (error) {
        throw error;
      }

      return count ?? 0;
    }),
  );

  return {
    collectionRuns: counts[0],
    metricHistory: counts[1],
    sessionSnapshots: counts[2],
    blockingSnapshots: counts[3],
    sqlPerformance: counts[4],
    sqlPlanSnapshots: counts[5],
    sqlRegressionEvents: counts[6],
    deadlocks: counts[7],
    backend: "supabase" as const,
  };
};
