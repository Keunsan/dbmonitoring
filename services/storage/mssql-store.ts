/** MSSQL 기반 수집 결과 저장소입니다. */

import sql from "mssql";

import { serializeError } from "@/lib/serialize-error";
import { chunk, parseJsonObject, toIsoString } from "@/lib/db/mssql-row-utils";
import { isMssqlServerConfigured, withMssqlOperationalPool } from "@/lib/db/mssql-server";
import { pickFullestMetricSnapshot } from "@/lib/monitoring/metric-details";
import { buildResourceSummary } from "@/lib/monitoring/resource-summary";
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

const truncatePlanText = (planText: string) =>
  planText.length > SQL_PLAN_TEXT_MAX_LENGTH
    ? `${planText.slice(0, SQL_PLAN_TEXT_MAX_LENGTH)}...(truncated)`
    : planText;

type CollectionRunRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  started_at: Date | string;
  finished_at: Date | string;
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
  metric_time: Date | string;
  metric_name: string;
  metric_value: number;
  unit: string | null;
  tags: string;
};

type SessionSnapshotRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  snapshot_time: Date | string;
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
  snapshot_time: Date | string;
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
  metric_time: Date | string;
  sql_id: string;
  sql_text_masked: string;
  executions: number;
  avg_elapsed_ms: number;
  total_cpu_ms: number;
  total_logical_reads: number | null;
  last_execution_time: Date | string | null;
};

type SqlPlanSnapshotRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  captured_at: Date | string;
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
  occurred_at: Date | string;
  victim_session_id: string;
  graph_xml: string;
};

type SqlRegressionRow = {
  id: string;
  tenant_id: string;
  db_instance_id: string;
  detected_at: Date | string;
  sql_id: string;
  metric_key: string;
  baseline_value: number;
  current_value: number;
  change_percent: number;
  severity: string;
  recommendation: string;
  status: string;
  issue_candidate: string;
};

const toCollectionRun = (row: CollectionRunRow): CollectionRunRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  startedAt: toIsoString(row.started_at) as string,
  finishedAt: toIsoString(row.finished_at) as string,
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
  metricTime: toIsoString(row.metric_time) as string,
  metricName: row.metric_name,
  metricValue: row.metric_value,
  unit: row.unit,
  tags: parseJsonObject<Record<string, string>>(row.tags, {}),
});

const toSessionSnapshot = (row: SessionSnapshotRow): SessionSnapshotRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  snapshotTime: toIsoString(row.snapshot_time) as string,
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
  snapshotTime: toIsoString(row.snapshot_time) as string,
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
  metricTime: toIsoString(row.metric_time) as string,
  sqlId: row.sql_id,
  sqlTextMasked: row.sql_text_masked,
  executions: Number(row.executions),
  avgElapsedMs: row.avg_elapsed_ms,
  totalCpuMs: row.total_cpu_ms,
  totalLogicalReads: row.total_logical_reads,
  lastExecutionTime: toIsoString(row.last_execution_time),
});

const toSqlPlanSnapshot = (row: SqlPlanSnapshotRow): SqlPlanSnapshotRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  capturedAt: toIsoString(row.captured_at) as string,
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
  occurredAt: toIsoString(row.occurred_at) as string,
  victimSessionId: row.victim_session_id,
  graphXml: row.graph_xml,
});

const toSqlRegression = (row: SqlRegressionRow): SqlRegressionEventRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  dbInstanceId: row.db_instance_id,
  detectedAt: toIsoString(row.detected_at) as string,
  sqlId: row.sql_id,
  metricKey: row.metric_key,
  baselineValue: row.baseline_value,
  currentValue: row.current_value,
  changePercent: row.change_percent,
  severity: row.severity as SqlRegressionEventRecord["severity"],
  recommendation: row.recommendation,
  status: row.status as SqlRegressionEventRecord["status"],
  issueCandidate: parseJsonObject<Record<string, unknown>>(row.issue_candidate, {}),
});

const runInTransaction = async (
  pool: sql.ConnectionPool,
  work: (transaction: sql.Transaction) => Promise<void>,
) => {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await work(transaction);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const insertCollectionRun = async (
  transaction: sql.Transaction,
  row: Record<string, unknown>,
) => {
  await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, row.id)
    .input("tenant_id", sql.UniqueIdentifier, row.tenant_id)
    .input("db_instance_id", sql.UniqueIdentifier, row.db_instance_id)
    .input("started_at", sql.DateTimeOffset, row.started_at)
    .input("finished_at", sql.DateTimeOffset, row.finished_at)
    .input("status", sql.NVarChar(50), row.status)
    .input("error_message", sql.NVarChar(sql.MAX), row.error_message)
    .input("metrics_count", sql.Int, row.metrics_count)
    .input("sessions_count", sql.Int, row.sessions_count)
    .input("locks_count", sql.Int, row.locks_count)
    .input("sql_count", sql.Int, row.sql_count)
    .query(`
      INSERT INTO dbo.collection_run (
        id, tenant_id, db_instance_id, started_at, finished_at, status,
        error_message, metrics_count, sessions_count, locks_count, sql_count
      ) VALUES (
        @id, @tenant_id, @db_instance_id, @started_at, @finished_at, @status,
        @error_message, @metrics_count, @sessions_count, @locks_count, @sql_count
      )
    `);
};

const insertMetricHistory = async (
  transaction: sql.Transaction,
  row: Record<string, unknown>,
) => {
  await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, row.id)
    .input("tenant_id", sql.UniqueIdentifier, row.tenant_id)
    .input("db_instance_id", sql.UniqueIdentifier, row.db_instance_id)
    .input("metric_time", sql.DateTimeOffset, row.metric_time)
    .input("metric_name", sql.NVarChar(200), row.metric_name)
    .input("metric_value", sql.Float, row.metric_value)
    .input("unit", sql.NVarChar(50), row.unit)
    .input("tags", sql.NVarChar(sql.MAX), row.tags)
    .query(`
      INSERT INTO dbo.metric_history (
        id, tenant_id, db_instance_id, metric_time, metric_name, metric_value, unit, tags
      ) VALUES (
        @id, @tenant_id, @db_instance_id, @metric_time, @metric_name, @metric_value, @unit, @tags
      )
    `);
};

const insertSessionSnapshot = async (
  transaction: sql.Transaction,
  row: Record<string, unknown>,
) => {
  await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, row.id)
    .input("tenant_id", sql.UniqueIdentifier, row.tenant_id)
    .input("db_instance_id", sql.UniqueIdentifier, row.db_instance_id)
    .input("snapshot_time", sql.DateTimeOffset, row.snapshot_time)
    .input("session_id", sql.NVarChar(100), row.session_id)
    .input("login_name", sql.NVarChar(200), row.login_name)
    .input("status", sql.NVarChar(100), row.status)
    .input("wait_type", sql.NVarChar(200), row.wait_type)
    .input("wait_ms", sql.Int, row.wait_ms)
    .input("sql_id", sql.NVarChar(200), row.sql_id)
    .input("blocking_session_id", sql.NVarChar(100), row.blocking_session_id)
    .input("command", sql.NVarChar(200), row.command)
    .input("cpu_time_ms", sql.Int, row.cpu_time_ms)
    .input("logical_reads", sql.BigInt, row.logical_reads)
    .input("sql_text_masked", sql.NVarChar(sql.MAX), row.sql_text_masked)
    .input("host_name", sql.NVarChar(200), row.host_name)
    .input("program_name", sql.NVarChar(200), row.program_name)
    .input("database_name", sql.NVarChar(200), row.database_name)
    .query(`
      INSERT INTO dbo.session_snapshot (
        id, tenant_id, db_instance_id, snapshot_time, session_id, login_name, status,
        wait_type, wait_ms, sql_id, blocking_session_id, command, cpu_time_ms,
        logical_reads, sql_text_masked, host_name, program_name, database_name
      ) VALUES (
        @id, @tenant_id, @db_instance_id, @snapshot_time, @session_id, @login_name, @status,
        @wait_type, @wait_ms, @sql_id, @blocking_session_id, @command, @cpu_time_ms,
        @logical_reads, @sql_text_masked, @host_name, @program_name, @database_name
      )
    `);
};

const insertBlockingSnapshot = async (
  transaction: sql.Transaction,
  row: Record<string, unknown>,
) => {
  await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, row.id)
    .input("tenant_id", sql.UniqueIdentifier, row.tenant_id)
    .input("db_instance_id", sql.UniqueIdentifier, row.db_instance_id)
    .input("snapshot_time", sql.DateTimeOffset, row.snapshot_time)
    .input("blocker_session_id", sql.NVarChar(100), row.blocker_session_id)
    .input("blocked_session_id", sql.NVarChar(100), row.blocked_session_id)
    .input("lock_type", sql.NVarChar(100), row.lock_type)
    .input("wait_ms", sql.Int, row.wait_ms)
    .input("object_name", sql.NVarChar(500), row.object_name)
    .query(`
      INSERT INTO dbo.blocking_snapshot (
        id, tenant_id, db_instance_id, snapshot_time,
        blocker_session_id, blocked_session_id, lock_type, wait_ms, object_name
      ) VALUES (
        @id, @tenant_id, @db_instance_id, @snapshot_time,
        @blocker_session_id, @blocked_session_id, @lock_type, @wait_ms, @object_name
      )
    `);
};

const insertSqlPerformance = async (
  transaction: sql.Transaction,
  row: Record<string, unknown>,
) => {
  await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, row.id)
    .input("tenant_id", sql.UniqueIdentifier, row.tenant_id)
    .input("db_instance_id", sql.UniqueIdentifier, row.db_instance_id)
    .input("metric_time", sql.DateTimeOffset, row.metric_time)
    .input("sql_id", sql.NVarChar(200), row.sql_id)
    .input("sql_text_masked", sql.NVarChar(sql.MAX), row.sql_text_masked)
    .input("executions", sql.BigInt, row.executions)
    .input("avg_elapsed_ms", sql.Float, row.avg_elapsed_ms)
    .input("total_cpu_ms", sql.Float, row.total_cpu_ms)
    .input("total_logical_reads", sql.Float, row.total_logical_reads)
    .input("last_execution_time", sql.DateTimeOffset, row.last_execution_time)
    .query(`
      INSERT INTO dbo.sql_performance (
        id, tenant_id, db_instance_id, metric_time, sql_id, sql_text_masked,
        executions, avg_elapsed_ms, total_cpu_ms, total_logical_reads, last_execution_time
      ) VALUES (
        @id, @tenant_id, @db_instance_id, @metric_time, @sql_id, @sql_text_masked,
        @executions, @avg_elapsed_ms, @total_cpu_ms, @total_logical_reads, @last_execution_time
      )
    `);
};

const insertSqlPlanSnapshot = async (
  transaction: sql.Transaction,
  row: Record<string, unknown>,
) => {
  await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, row.id)
    .input("tenant_id", sql.UniqueIdentifier, row.tenant_id)
    .input("db_instance_id", sql.UniqueIdentifier, row.db_instance_id)
    .input("captured_at", sql.DateTimeOffset, row.captured_at)
    .input("sql_id", sql.NVarChar(200), row.sql_id)
    .input("plan_hash", sql.NVarChar(200), row.plan_hash)
    .input("plan_text", sql.NVarChar(sql.MAX), row.plan_text)
    .input("avg_elapsed_ms", sql.Float, row.avg_elapsed_ms)
    .input("total_cpu_ms", sql.Float, row.total_cpu_ms)
    .input("total_logical_reads", sql.Float, row.total_logical_reads)
    .input("executions", sql.BigInt, row.executions)
    .query(`
      INSERT INTO dbo.sql_plan_snapshot (
        id, tenant_id, db_instance_id, captured_at, sql_id, plan_hash, plan_text,
        avg_elapsed_ms, total_cpu_ms, total_logical_reads, executions
      ) VALUES (
        @id, @tenant_id, @db_instance_id, @captured_at, @sql_id, @plan_hash, @plan_text,
        @avg_elapsed_ms, @total_cpu_ms, @total_logical_reads, @executions
      )
    `);
};

const insertDeadlockEvent = async (
  transaction: sql.Transaction,
  row: Record<string, unknown>,
) => {
  await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, row.id)
    .input("tenant_id", sql.UniqueIdentifier, row.tenant_id)
    .input("db_instance_id", sql.UniqueIdentifier, row.db_instance_id)
    .input("occurred_at", sql.DateTimeOffset, row.occurred_at)
    .input("victim_session_id", sql.NVarChar(100), row.victim_session_id)
    .input("graph_xml", sql.NVarChar(sql.MAX), row.graph_xml)
    .query(`
      INSERT INTO dbo.deadlock_event (
        id, tenant_id, db_instance_id, occurred_at, victim_session_id, graph_xml
      ) VALUES (
        @id, @tenant_id, @db_instance_id, @occurred_at, @victim_session_id, @graph_xml
      )
    `);
};

const insertSqlRegressionEvent = async (
  transaction: sql.Transaction,
  row: Record<string, unknown>,
) => {
  await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, row.id)
    .input("tenant_id", sql.UniqueIdentifier, row.tenant_id)
    .input("db_instance_id", sql.UniqueIdentifier, row.db_instance_id)
    .input("detected_at", sql.DateTimeOffset, row.detected_at)
    .input("sql_id", sql.NVarChar(200), row.sql_id)
    .input("metric_key", sql.NVarChar(200), row.metric_key)
    .input("baseline_value", sql.Float, row.baseline_value)
    .input("current_value", sql.Float, row.current_value)
    .input("change_percent", sql.Float, row.change_percent)
    .input("severity", sql.NVarChar(50), row.severity)
    .input("recommendation", sql.NVarChar(sql.MAX), row.recommendation)
    .input("status", sql.NVarChar(50), row.status)
    .input("issue_candidate", sql.NVarChar(sql.MAX), row.issue_candidate)
    .query(`
      INSERT INTO dbo.sql_regression_event (
        id, tenant_id, db_instance_id, detected_at, sql_id, metric_key,
        baseline_value, current_value, change_percent, severity, recommendation, status, issue_candidate
      ) VALUES (
        @id, @tenant_id, @db_instance_id, @detected_at, @sql_id, @metric_key,
        @baseline_value, @current_value, @change_percent, @severity, @recommendation, @status, @issue_candidate
      )
    `);
};

const insertBatched = async (
  pool: sql.ConnectionPool,
  rows: Record<string, unknown>[],
  inserter: (transaction: sql.Transaction, row: Record<string, unknown>) => Promise<void>,
  batchSize = BATCH_SIZE,
) => {
  if (rows.length === 0) {
    return;
  }

  for (const batch of chunk(rows, batchSize)) {
    await runInTransaction(pool, async (transaction) => {
      for (const row of batch) {
        await inserter(transaction, row);
      }
    });
  }
};

export const isMssqlMonitoringStorageEnabled = () => isMssqlServerConfigured();

export const saveCollectorRunToMssql = async (result: CollectorRunResult) => {
  const normalized = normalizeCollectorRun(result);

  await withMssqlOperationalPool(async (pool) => {
    await runInTransaction(pool, async (transaction) => {
      await insertCollectionRun(transaction, {
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
      });
    });

    await insertBatched(
      pool,
      normalized.metricHistory.map((metric) => ({
        id: metric.id,
        tenant_id: metric.tenantId,
        db_instance_id: metric.dbInstanceId,
        metric_time: metric.metricTime,
        metric_name: metric.metricName,
        metric_value: metric.metricValue,
        unit: metric.unit,
        tags: JSON.stringify(metric.tags ?? {}),
      })),
      insertMetricHistory,
    );

    await insertBatched(
      pool,
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
      insertSessionSnapshot,
    );

    await insertBatched(
      pool,
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
      insertBlockingSnapshot,
    );

    await insertBatched(
      pool,
      normalized.sqlPerformance.map((item) => ({
        id: item.id,
        tenant_id: item.tenantId,
        db_instance_id: item.dbInstanceId,
        metric_time: item.metricTime,
        sql_id: item.sqlId,
        sql_text_masked: item.sqlTextMasked,
        executions: item.executions,
        avg_elapsed_ms: item.avgElapsedMs,
        total_cpu_ms: item.totalCpuMs,
        total_logical_reads: item.totalLogicalReads,
        last_execution_time: item.lastExecutionTime,
      })),
      insertSqlPerformance,
    );

    if (normalized.sqlPlanSnapshots.length > 0) {
      try {
        await insertBatched(
          pool,
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
          insertSqlPlanSnapshot,
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

    await insertBatched(
      pool,
      normalized.deadlocks.map((deadlock) => ({
        id: deadlock.id,
        tenant_id: deadlock.tenantId,
        db_instance_id: deadlock.dbInstanceId,
        occurred_at: deadlock.occurredAt,
        victim_session_id: deadlock.victimSessionId,
        graph_xml: deadlock.graphXml,
      })),
      insertDeadlockEvent,
    );
  });

  return normalized.collectionRun;
};

export const saveSessionsCollectorRunToMssql = async (result: CollectorRunResult) => {
  const normalized = normalizeCollectorRun(result);

  await withMssqlOperationalPool(async (pool) => {
    await runInTransaction(pool, async (transaction) => {
      await insertCollectionRun(transaction, {
        id: normalized.collectionRun.id,
        tenant_id: normalized.collectionRun.tenantId,
        db_instance_id: normalized.collectionRun.dbInstanceId,
        started_at: normalized.collectionRun.startedAt,
        finished_at: normalized.collectionRun.finishedAt,
        status: normalized.collectionRun.status,
        error_message: normalized.collectionRun.errorMessage,
        metrics_count: 0,
        sessions_count: normalized.collectionRun.sessionsCount,
        locks_count: 0,
        sql_count: 0,
      });
    });

    if (normalized.sessionSnapshots.length > 0) {
      await insertBatched(
        pool,
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
        insertSessionSnapshot,
      );
    }
  });

  return normalized.collectionRun;
};

export const listCollectionRunsFromMssql = async (
  dbInstanceId?: DbInstanceId,
): Promise<CollectionRunRecord[]> =>
  withMssqlOperationalPool(async (pool) => {
    const request = pool.request().input("limit", sql.Int, 100);

    let query = `
      SELECT TOP (@limit) *
      FROM dbo.collection_run
    `;

    if (dbInstanceId) {
      request.input("db_instance_id", sql.UniqueIdentifier, dbInstanceId);
      query += " WHERE db_instance_id = @db_instance_id";
    }

    query += " ORDER BY finished_at DESC";

    const result = await request.query<CollectionRunRow>(query);
    return result.recordset.map(toCollectionRun);
  });

export const listMetricHistoryFromMssql = async (params: {
  dbInstanceId?: DbInstanceId;
  metricName?: string;
  limit?: number;
  metricTimeGte?: string;
}): Promise<MetricHistoryRecord[]> =>
  withMssqlOperationalPool(async (pool) => {
    const request = pool.request().input("limit", sql.Int, params.limit ?? 200);
    const conditions: string[] = [];

    if (params.dbInstanceId) {
      request.input("db_instance_id", sql.UniqueIdentifier, params.dbInstanceId);
      conditions.push("db_instance_id = @db_instance_id");
    }

    if (params.metricName) {
      request.input("metric_name", sql.NVarChar(200), params.metricName);
      conditions.push("metric_name = @metric_name");
    }

    if (params.metricTimeGte) {
      request.input("metric_time_gte", sql.DateTimeOffset, params.metricTimeGte);
      conditions.push("metric_time >= @metric_time_gte");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await request.query<MetricHistoryRow>(`
      SELECT TOP (@limit) *
      FROM dbo.metric_history
      ${whereClause}
      ORDER BY metric_time DESC
    `);

    return result.recordset.map(toMetricHistory);
  });

export const listSessionSnapshotsFromMssql = async (
  dbInstanceId?: DbInstanceId,
  limit = 200,
): Promise<SessionSnapshotRecord[]> =>
  withMssqlOperationalPool(async (pool) => {
    const request = pool.request().input("limit", sql.Int, limit);
    let query = `
      SELECT TOP (@limit) *
      FROM dbo.session_snapshot
    `;

    if (dbInstanceId) {
      request.input("db_instance_id", sql.UniqueIdentifier, dbInstanceId);
      query += " WHERE db_instance_id = @db_instance_id";
    }

    query += " ORDER BY snapshot_time DESC";

    const result = await request.query<SessionSnapshotRow>(query);
    return result.recordset.map(toSessionSnapshot);
  });

export const listSqlPerformanceFromMssql = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
  sqlId?: string,
): Promise<SqlPerformanceRecord[]> =>
  withMssqlOperationalPool(async (pool) => {
    const request = pool.request().input("limit", sql.Int, limit);
    const conditions: string[] = [];

    if (dbInstanceId) {
      request.input("db_instance_id", sql.UniqueIdentifier, dbInstanceId);
      conditions.push("db_instance_id = @db_instance_id");
    }

    if (sqlId) {
      request.input("sql_id", sql.NVarChar(200), sqlId);
      conditions.push("sql_id = @sql_id");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await request.query<SqlPerformanceRow>(`
      SELECT TOP (@limit) *
      FROM dbo.sql_performance
      ${whereClause}
      ORDER BY metric_time DESC
    `);

    return result.recordset.map(toSqlPerformance);
  });

export const listSqlPlanSnapshotsFromMssql = async (params: {
  dbInstanceId: DbInstanceId;
  sqlId?: string;
  limit?: number;
}): Promise<SqlPlanSnapshotRecord[]> =>
  withMssqlOperationalPool(async (pool) => {
    const request = pool
      .request()
      .input("limit", sql.Int, params.limit ?? 50)
      .input("db_instance_id", sql.UniqueIdentifier, params.dbInstanceId);

    let query = `
      SELECT TOP (@limit) *
      FROM dbo.sql_plan_snapshot
      WHERE db_instance_id = @db_instance_id
    `;

    if (params.sqlId) {
      request.input("sql_id", sql.NVarChar(200), params.sqlId);
      query += " AND sql_id = @sql_id";
    }

    query += " ORDER BY captured_at DESC";

    const result = await request.query<SqlPlanSnapshotRow>(query);
    return result.recordset.map(toSqlPlanSnapshot);
  });

export const listSqlRegressionEventsFromMssql = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<SqlRegressionEventRecord[]> =>
  withMssqlOperationalPool(async (pool) => {
    const request = pool.request().input("limit", sql.Int, limit);
    let query = `
      SELECT TOP (@limit) *
      FROM dbo.sql_regression_event
    `;

    if (dbInstanceId) {
      request.input("db_instance_id", sql.UniqueIdentifier, dbInstanceId);
      query += " WHERE db_instance_id = @db_instance_id";
    }

    query += " ORDER BY detected_at DESC";

    const result = await request.query<SqlRegressionRow>(query);
    return result.recordset.map(toSqlRegression);
  });

export const saveSqlRegressionEventsToMssql = async (
  events: SqlRegressionEventRecord[],
) => {
  await withMssqlOperationalPool(async (pool) => {
    await insertBatched(
      pool,
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
        issue_candidate: JSON.stringify(event.issueCandidate ?? {}),
      })),
      insertSqlRegressionEvent,
    );
  });
};

export const listBlockingSnapshotsFromMssql = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<BlockingSnapshotRecord[]> =>
  withMssqlOperationalPool(async (pool) => {
    const request = pool.request().input("limit", sql.Int, limit);
    let query = `
      SELECT TOP (@limit) *
      FROM dbo.blocking_snapshot
    `;

    if (dbInstanceId) {
      request.input("db_instance_id", sql.UniqueIdentifier, dbInstanceId);
      query += " WHERE db_instance_id = @db_instance_id";
    }

    query += " ORDER BY snapshot_time DESC";

    const result = await request.query<BlockingSnapshotRow>(query);
    return result.recordset.map(toBlockingSnapshot);
  });

export const listDeadlockEventsFromMssql = async (
  dbInstanceId?: DbInstanceId,
  limit = 100,
): Promise<DeadlockRecord[]> =>
  withMssqlOperationalPool(async (pool) => {
    const request = pool.request().input("limit", sql.Int, limit);
    let query = `
      SELECT TOP (@limit) *
      FROM dbo.deadlock_event
    `;

    if (dbInstanceId) {
      request.input("db_instance_id", sql.UniqueIdentifier, dbInstanceId);
      query += " WHERE db_instance_id = @db_instance_id";
    }

    query += " ORDER BY occurred_at DESC";

    const result = await request.query<DeadlockRow>(query);
    return result.recordset.map(toDeadlock);
  });

const SUMMARY_METRIC_LIMIT = 200;
const SUMMARY_METRIC_LOOKBACK_MS = 2 * 60 * 60 * 1_000;

export const getMonitoringSummaryFromMssql = async (
  dbInstanceId: DbInstanceId,
): Promise<MonitoringSummary> => {
  const latestRun = (await listCollectionRunsFromMssql(dbInstanceId))[0] ?? null;
  const recentMetrics = await listMetricHistoryFromMssql({
    dbInstanceId,
    limit: SUMMARY_METRIC_LIMIT,
    metricTimeGte: new Date(Date.now() - SUMMARY_METRIC_LOOKBACK_MS).toISOString(),
  });
  const latestMetrics = pickFullestMetricSnapshot(recentMetrics);

  const latestSessionTime = await withMssqlOperationalPool(async (pool) => {
    const result = await pool
      .request()
      .input("db_instance_id", sql.UniqueIdentifier, dbInstanceId)
      .query<{ snapshot_time: Date | string | null }>(`
        SELECT TOP 1 snapshot_time
        FROM dbo.session_snapshot
        WHERE db_instance_id = @db_instance_id
        ORDER BY snapshot_time DESC
      `);

    return toIsoString(result.recordset[0]?.snapshot_time ?? null);
  });

  let latestSessions: SessionSnapshotRecord[] = [];

  if (latestSessionTime) {
    latestSessions = await withMssqlOperationalPool(async (pool) => {
      const result = await pool
        .request()
        .input("db_instance_id", sql.UniqueIdentifier, dbInstanceId)
        .input("snapshot_time", sql.DateTimeOffset, latestSessionTime)
        .query<SessionSnapshotRow>(`
          SELECT *
          FROM dbo.session_snapshot
          WHERE db_instance_id = @db_instance_id AND snapshot_time = @snapshot_time
        `);

      return result.recordset.map(toSessionSnapshot);
    });
  }

  const [blockingCount, deadlockCount] = await withMssqlOperationalPool(async (pool) => {
    const blocking = await pool
      .request()
      .input("db_instance_id", sql.UniqueIdentifier, dbInstanceId)
      .query<{ count: number }>(`
        SELECT COUNT(1) AS count
        FROM dbo.blocking_snapshot
        WHERE db_instance_id = @db_instance_id
      `);

    const deadlock = await pool
      .request()
      .input("db_instance_id", sql.UniqueIdentifier, dbInstanceId)
      .query<{ count: number }>(`
        SELECT COUNT(1) AS count
        FROM dbo.deadlock_event
        WHERE db_instance_id = @db_instance_id
      `);

    return [blocking.recordset[0]?.count ?? 0, deadlock.recordset[0]?.count ?? 0];
  });

  return {
    dbInstanceId,
    lastRun: latestRun,
    latestMetrics,
    resourceSummary: buildResourceSummary(latestMetrics),
    latestSessions,
    latestSql: await listSqlPerformanceFromMssql(dbInstanceId, 10),
    blockingCount,
    deadlockCount,
  };
};

export const getMonitoringStorageSummaryFromMssql = async () => {
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

  const counts = await withMssqlOperationalPool(async (pool) =>
    Promise.all(
      tables.map(async (table) => {
        const result = await pool.request().query<{ count: number }>(`
          SELECT COUNT(1) AS count FROM dbo.${table}
        `);
        return result.recordset[0]?.count ?? 0;
      }),
    ),
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
    backend: "mssql" as const,
  };
};

export const purgeDbInstanceOperationalDataFromMssql = async (
  dbInstanceId: DbInstanceId,
) => {
  const tables = [
    "sql_regression_event",
    "sql_plan_snapshot",
    "sql_performance",
    "deadlock_event",
    "blocking_snapshot",
    "session_snapshot",
    "metric_history",
    "collection_run",
  ] as const;

  await withMssqlOperationalPool(async (pool) => {
    for (const table of tables) {
      await pool
        .request()
        .input("db_instance_id", sql.UniqueIdentifier, dbInstanceId)
        .query(`DELETE FROM dbo.${table} WHERE db_instance_id = @db_instance_id`);
    }
  });
};
