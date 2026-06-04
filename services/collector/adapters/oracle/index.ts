/** Oracle Agentless 수집 어댑터 (1차: V$ 뷰 기반)입니다. */

import oracledb from "oracledb";

import { withOracleConnection } from "@/lib/db/oracle-connection";
import { SERVER_METRIC_KEYS } from "@/lib/monitoring/metric-keys";
import { getDbConnectionFailureMessage } from "@/lib/secrets/errors";
import type {
  AvailabilityPayload,
  BlockingPayload,
  CollectorAdapter,
  CollectorContext,
  ConnectionTestResult,
  MetricPayload,
  SessionPayload,
  SqlPerformancePayload,
  SqlPlanPayload,
} from "@/services/collector/types";

type SysMetricRow = {
  METRIC_NAME: string;
  VALUE: number;
};

type SysStatRow = {
  NAME: string;
  VALUE: number;
};

type SessionAggRow = {
  TOTAL_SESSIONS: number;
  ACTIVE_SESSIONS: number;
  IDLE_SESSIONS: number;
  RUNNING_SQL_SESSIONS: number;
};

type SessionRow = {
  SID: number;
  SERIAL_NUM: number;
  LOGIN_NAME: string;
  STATUS: string;
  WAIT_TYPE: string | null;
  WAIT_MS: number | null;
  SQL_ID: string | null;
  BLOCKING_SESSION_ID: string | null;
  COMMAND: number | null;
  CPU_TIME_MS: number | null;
  LOGICAL_READS: number | null;
  SQL_TEXT_MASKED: string | null;
  HOST_NAME: string | null;
  PROGRAM_NAME: string | null;
};

type BlockingRow = {
  BLOCKER_SESSION_ID: number;
  BLOCKED_SESSION_ID: number;
  LOCK_TYPE: string;
  WAIT_MS: number;
  OBJECT_NAME: string | null;
};

type SqlPerformanceRow = {
  SQL_ID: string;
  SQL_TEXT_MASKED: string | null;
  EXECUTIONS: number;
  AVG_ELAPSED_MS: number;
  TOTAL_CPU_MS: number;
  TOTAL_LOGICAL_READS: number;
  LAST_EXECUTION_TIME: Date | string | null;
};

type SqlPlanSummaryRow = {
  SQL_ID: string;
  PLAN_HASH: string;
  EXECUTIONS: number;
  AVG_ELAPSED_MS: number;
  TOTAL_CPU_MS: number;
  TOTAL_LOGICAL_READS: number;
};

type SqlPlanLineRow = {
  OPERATION: string | null;
  OPTIONS: string | null;
  DEPTH: number;
  ID: number;
};

type TablespaceRow = {
  TABLESPACE_NAME: string;
  USED_MB: number;
  SIZE_MB: number;
};

const now = () => new Date().toISOString();

const maskSqlText = (sqlText: string | null | undefined) =>
  (sqlText ?? "")
    .replace(/'([^']|'')*'/g, "'?'")
    .replace(/\b\d+(\.\d+)?\b/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4_000);

const toIsoString = (value: Date | string | null) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

const buildPlanText = (lines: SqlPlanLineRow[]) =>
  lines
    .sort((left, right) => left.ID - right.ID)
    .map((line) => {
      const indent = "  ".repeat(Math.max(line.DEPTH, 0));
      const operation = line.OPERATION ?? "";
      const options = line.OPTIONS ? ` ${line.OPTIONS}` : "";
      return `${indent}${operation}${options}`.trim();
    })
    .join("\n")
    .slice(0, 8_000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * v$sysstat 누적값을 1초 간격으로 샘플링해 초당 처리량을 계산합니다.
 */
const sampleSysStatRate = async (
  executeQueryFn: <T>(connection: oracledb.Connection, sqlText: string) => Promise<T[]>,
  connection: oracledb.Connection,
  statName: string,
): Promise<number | null> => {
  const readValue = async () => {
    const rows = await executeQueryFn<{ VALUE: number }>(
      connection,
      `SELECT value FROM v$sysstat WHERE name = '${statName}'`,
    );

    return rows[0]?.VALUE ?? null;
  };

  const startedAtMs = Date.now();
  const startValue = await readValue();

  if (startValue === null) {
    return null;
  }

  await sleep(1_000);
  const elapsedSeconds = Math.max((Date.now() - startedAtMs) / 1_000, 0.001);
  const endValue = await readValue();

  if (endValue === null) {
    return null;
  }

  const rate = (endValue - startValue) / elapsedSeconds;

  return Number.isFinite(rate) && rate >= 0 ? rate : null;
};

/**
 * Oracle Collector 어댑터 인스턴스를 생성합니다.
 */
export const createOracleCollectorAdapter = (
  context: CollectorContext,
): CollectorAdapter => {
  const withConnection = async <T>(
    work: (connection: oracledb.Connection) => Promise<T>,
  ) => withOracleConnection(context, work);

  const executeQuery = async <T>(
    connection: oracledb.Connection,
    sqlText: string,
  ) => {
    const result = await connection.execute<T>(sqlText, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return (result.rows ?? []) as T[];
  };

  return {
    connect: async (): Promise<ConnectionTestResult> => {
      const startedAt = performance.now();

      try {
        await withConnection(async (connection) => {
          await connection.execute("SELECT 1 AS ok FROM dual");
        });

        return {
          success: true,
          message: "Oracle 연결 확인에 성공했습니다.",
          latencyMs: Math.round(performance.now() - startedAt),
        };
      } catch (error) {
        return {
          success: false,
          message: getDbConnectionFailureMessage(error),
          latencyMs: Math.round(performance.now() - startedAt),
        };
      }
    },
    collectAvailability: async (): Promise<AvailabilityPayload> => {
      const startedAt = performance.now();
      const collectTime = now();

      try {
        const row = await withConnection(async (connection) => {
          const rows = await executeQuery<{
            SERVER_NAME: string;
            DATABASE_NAME: string;
            SERVER_TIME: Date;
            VERSION: string;
          }>(
            connection,
            `SELECT
              SYS_CONTEXT('USERENV', 'SERVER_HOST') AS server_name,
              SYS_CONTEXT('USERENV', 'DB_NAME') AS database_name,
              SYSTIMESTAMP AS server_time,
              BANNER AS version
             FROM v$version
             WHERE ROWNUM = 1`,
          );

          return rows[0] ?? null;
        });

        return {
          collectTime,
          isReachable: true,
          healthMessage: "Oracle 연결 가능",
          latencyMs: Math.round(performance.now() - startedAt),
          serverName: row?.SERVER_NAME ?? null,
          databaseName: row?.DATABASE_NAME ?? context.databaseName,
          version: row?.VERSION ?? null,
        };
      } catch (error) {
        return {
          collectTime,
          isReachable: false,
          healthMessage: getDbConnectionFailureMessage(error),
          latencyMs: Math.round(performance.now() - startedAt),
          databaseName: context.databaseName,
        };
      }
    },
    collectMetrics: async (): Promise<MetricPayload[]> => {
      const collectTime = now();

      return withConnection(async (connection) => {
        const metrics: MetricPayload[] = [];

        const push = (
          metricName: string,
          metricValue: number,
          unit: string,
          tags: Record<string, string> = {},
        ) => {
          if (!Number.isFinite(metricValue)) {
            return;
          }

          metrics.push({
            collectTime,
            metricName,
            metricValue,
            unit,
            tags,
          });
        };

        const safeQuery = async <T>(label: string, query: () => Promise<T>) => {
          try {
            return await query();
          } catch (error) {
            if (process.env.NODE_ENV === "development") {
              console.warn(`[ORACLE_COLLECT_METRIC_SKIP] ${label}`, error);
            }

            return null;
          }
        };

        const sysMetricRows = await safeQuery("sysmetric", async () =>
          executeQuery<SysMetricRow>(
            connection,
            `SELECT metric_name, value
             FROM v$sysmetric
             WHERE group_id = (SELECT MAX(group_id) FROM v$sysmetric)
               AND metric_name IN (
                 'Host CPU Utilization (%)',
                 'Host Memory Usage (%)',
                 'User Transaction Per Sec',
                 'Physical Read Total Bytes Per Sec',
                 'Physical Write Total Bytes Per Sec',
                 'Redo Generated Per Sec',
                 'Average Active Sessions',
                 'Average Synchronous Single-Block Read Latency'
               )`,
          ),
        );

        if (sysMetricRows) {
          for (const row of sysMetricRows) {
            if (row.METRIC_NAME === "Host CPU Utilization (%)") {
              push(
                SERVER_METRIC_KEYS.cpuUsedPercent,
                row.VALUE,
                "percent",
                { source: "v$sysmetric" },
              );
            }

            if (row.METRIC_NAME === "Host Memory Usage (%)") {
              push(
                SERVER_METRIC_KEYS.memoryUsedPercent,
                row.VALUE,
                "percent",
                { source: "v$sysmetric" },
              );
            }

            if (row.METRIC_NAME === "Average Synchronous Single-Block Read Latency") {
              push(
                SERVER_METRIC_KEYS.diskReadLatencyMs,
                row.VALUE * 10,
                "ms",
                { source: "v$sysmetric" },
              );
            }

            if (row.METRIC_NAME === "User Transaction Per Sec") {
              push(
                SERVER_METRIC_KEYS.transactionsPerSec,
                row.VALUE,
                "per_second",
                { source: "v$sysmetric" },
              );
            }

            if (row.METRIC_NAME === "Physical Read Total Bytes Per Sec") {
              push(
                SERVER_METRIC_KEYS.diskReadThroughputKbSec,
                row.VALUE / 1024,
                "kb_per_second",
                { source: "v$sysmetric" },
              );
            }

            if (row.METRIC_NAME === "Physical Write Total Bytes Per Sec") {
              push(
                SERVER_METRIC_KEYS.diskWriteThroughputKbSec,
                row.VALUE / 1024,
                "kb_per_second",
                { source: "v$sysmetric" },
              );
            }

            if (row.METRIC_NAME === "Average Active Sessions") {
              push(
                SERVER_METRIC_KEYS.sessionActiveCount,
                row.VALUE,
                "count",
                { source: "v$sysmetric", metric: "average_active_sessions" },
              );
            }
          }
        }

        const sgaRow = await safeQuery("sga", async () => {
          const rows = await executeQuery<{ SGA_MB: number }>(
            connection,
            `SELECT ROUND(SUM(value) / 1024 / 1024, 2) AS sga_mb FROM v$sga`,
          );

          return rows[0] ?? null;
        });

        const pgaRow = await safeQuery("pga", async () => {
          const rows = await executeQuery<{ PGA_MB: number }>(
            connection,
            `SELECT ROUND(value / 1024 / 1024, 2) AS pga_mb
             FROM v$pgastat
             WHERE name = 'total PGA allocated'`,
          );

          return rows[0] ?? null;
        });

        if (sgaRow?.SGA_MB) {
          const totalMb = sgaRow.SGA_MB + (pgaRow?.PGA_MB ?? 0);
          push(SERVER_METRIC_KEYS.memoryTotalMb, totalMb, "mb", {
            source: pgaRow?.PGA_MB ? "v$sga+v$pgastat" : "v$sga",
            scope: pgaRow?.PGA_MB ? "sga_plus_pga" : "sga",
          });
        }

        const hasMemoryUsedPercent = metrics.some(
          (metric) => metric.metricName === SERVER_METRIC_KEYS.memoryUsedPercent,
        );

        if (!hasMemoryUsedPercent && sgaRow?.SGA_MB) {
          const memoryUsageRow = await safeQuery("memory_usage_ratio", async () => {
            const rows = await executeQuery<{ MEMORY_USED_PERCENT: number }>(
              connection,
              `SELECT ROUND(
                 (sga.sga_bytes + NVL(pga.pga_bytes, 0))
                 / NULLIF(os.physical_bytes, 0) * 100,
                 2
               ) AS memory_used_percent
               FROM (
                 SELECT SUM(value) AS sga_bytes FROM v$sga
               ) sga,
               (
                 SELECT value AS pga_bytes
                 FROM v$pgastat
                 WHERE name = 'total PGA allocated'
               ) pga,
               (
                 SELECT value AS physical_bytes
                 FROM v$osstat
                 WHERE stat_name = 'PHYSICAL_MEMORY_BYTES'
               ) os`,
            );

            return rows[0] ?? null;
          });

          if (memoryUsageRow?.MEMORY_USED_PERCENT !== undefined) {
            push(
              SERVER_METRIC_KEYS.memoryUsedPercent,
              memoryUsageRow.MEMORY_USED_PERCENT,
              "percent",
              { source: "v$sga+v$osstat" },
            );
          }
        }

        const hasDiskReadLatency = metrics.some(
          (metric) => metric.metricName === SERVER_METRIC_KEYS.diskReadLatencyMs,
        );

        if (!hasDiskReadLatency) {
          const diskLatencyRow = await safeQuery("disk_read_latency", async () => {
            const rows = await executeQuery<{ AVG_MS: number }>(
              connection,
              `SELECT average_wait * 10 AS avg_ms
               FROM v$system_event
               WHERE event = 'db file sequential read'
                 AND total_waits > 0`,
            );

            return rows[0] ?? null;
          });

          if (diskLatencyRow?.AVG_MS !== undefined) {
            push(
              SERVER_METRIC_KEYS.diskReadLatencyMs,
              diskLatencyRow.AVG_MS,
              "ms",
              { source: "v$system_event" },
            );
          }
        }

        const executeRate = await safeQuery("execute_count_rate", () =>
          sampleSysStatRate(executeQuery, connection, "execute count"),
        );

        if (executeRate !== null) {
          push(
            SERVER_METRIC_KEYS.batchRequestsPerSec,
            executeRate,
            "per_second",
            { source: "v$sysstat_delta" },
          );
        }

        const sysStatRows = await safeQuery("sysstat", async () =>
          executeQuery<SysStatRow>(
            connection,
            `SELECT name, value
             FROM v$sysstat
             WHERE name IN (
               'session logical reads',
               'physical reads',
               'execute count',
               'user commits',
               'logons current'
             )`,
          ),
        );

        if (sysStatRows) {
          const statMap = new Map(
            sysStatRows.map((row) => [row.NAME, row.VALUE]),
          );
          const logonsCurrent = statMap.get("logons current");

          if (logonsCurrent !== undefined) {
            push(SERVER_METRIC_KEYS.userConnections, logonsCurrent, "count", {
              source: "v$sysstat",
            });
          }
        }

        const sessionAggRow = await safeQuery("session_aggregate", async () => {
          const rows = await executeQuery<SessionAggRow>(
            connection,
            `SELECT
               COUNT(*) AS total_sessions,
               SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_sessions,
               SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) AS idle_sessions,
               SUM(
                 CASE
                   WHEN status = 'ACTIVE' AND sql_id IS NOT NULL THEN 1
                   ELSE 0
                 END
               ) AS running_sql_sessions
             FROM v$session
             WHERE type = 'USER'
               AND username IS NOT NULL`,
          );

          return rows[0] ?? null;
        });

        if (sessionAggRow) {
          push(
            SERVER_METRIC_KEYS.sessionTotalCount,
            sessionAggRow.TOTAL_SESSIONS,
            "count",
            { source: "v$session" },
          );

          if (
            !metrics.some(
              (metric) => metric.metricName === SERVER_METRIC_KEYS.sessionActiveCount,
            )
          ) {
            push(
              SERVER_METRIC_KEYS.sessionActiveCount,
              sessionAggRow.ACTIVE_SESSIONS,
              "count",
              { source: "v$session" },
            );
          }

          push(
            SERVER_METRIC_KEYS.sessionIdleCount,
            sessionAggRow.IDLE_SESSIONS,
            "count",
            { source: "v$session" },
          );
          push(
            SERVER_METRIC_KEYS.sessionRunningSqlCount,
            sessionAggRow.RUNNING_SQL_SESSIONS,
            "count",
            { source: "v$session" },
          );
        }

        const blockedCountRow = await safeQuery("blocked_sessions", async () => {
          const rows = await executeQuery<{ BLOCKED_COUNT: number }>(
            connection,
            `SELECT COUNT(*) AS blocked_count
             FROM v$session
             WHERE blocking_session IS NOT NULL
               AND blocking_session > 0
               AND type = 'USER'`,
          );

          return rows[0] ?? null;
        });

        if (blockedCountRow) {
          push(
            SERVER_METRIC_KEYS.processesBlocked,
            blockedCountRow.BLOCKED_COUNT,
            "count",
            { source: "v$session" },
          );
        }

        const tablespaceRows = await safeQuery("tablespace_usage", async () =>
          executeQuery<TablespaceRow>(
            connection,
            `SELECT
               tablespace_name,
               ROUND(used_space / 1024 / 1024, 2) AS used_mb,
               ROUND(tablespace_size / 1024 / 1024, 2) AS size_mb
             FROM dba_tablespace_usage_metrics`,
          ),
        );

        if (tablespaceRows) {
          for (const row of tablespaceRows) {
            const usedPercent =
              row.SIZE_MB > 0 ? (row.USED_MB / row.SIZE_MB) * 100 : 0;
            const freeMb = Math.max(row.SIZE_MB - row.USED_MB, 0);
            const tags = {
              tablespaceName: row.TABLESPACE_NAME,
              source: "dba_tablespace_usage_metrics",
            };

            push(SERVER_METRIC_KEYS.filegroupSizeMb, row.SIZE_MB, "mb", tags);
            push(SERVER_METRIC_KEYS.filegroupUsedMb, row.USED_MB, "mb", tags);
            push(SERVER_METRIC_KEYS.filegroupFreeMb, freeMb, "mb", tags);
            push(
              SERVER_METRIC_KEYS.filegroupUsedPercent,
              usedPercent,
              "percent",
              tags,
            );
          }

          if (
            !metrics.some(
              (metric) => metric.metricName === SERVER_METRIC_KEYS.logUsedPercent,
            )
          ) {
            const logPercents = tablespaceRows
              .filter(
                (row) =>
                  row.TABLESPACE_NAME === "SYSTEM" ||
                  row.TABLESPACE_NAME === "SYSAUX" ||
                  row.TABLESPACE_NAME.includes("UNDO"),
              )
              .map((row) =>
                row.SIZE_MB > 0 ? (row.USED_MB / row.SIZE_MB) * 100 : 0,
              );

            if (logPercents.length > 0) {
              push(
                SERVER_METRIC_KEYS.logUsedPercent,
                Math.max(...logPercents),
                "percent",
                { source: "dba_tablespace_usage_metrics", scope: "system_tablespaces" },
              );
            } else {
              const fraRow = await safeQuery("recovery_file_dest", async () => {
                const fraRows = await executeQuery<{ LOG_USED_PERCENT: number }>(
                  connection,
                  `SELECT ROUND(100 * space_used / NULLIF(space_limit, 0), 2) AS log_used_percent
                   FROM v$recovery_file_dest
                   WHERE space_limit > 0`,
                );

                return fraRows[0] ?? null;
              });

              if (fraRow?.LOG_USED_PERCENT !== undefined) {
                push(
                  SERVER_METRIC_KEYS.logUsedPercent,
                  fraRow.LOG_USED_PERCENT,
                  "percent",
                  { source: "v$recovery_file_dest" },
                );
              }
            }
          }
        }

        return metrics;
      });
    },
    collectSessions: async (): Promise<SessionPayload[]> => {
      const collectTime = now();

      const rows = await withConnection(async (connection) =>
        executeQuery<SessionRow>(
          connection,
          `SELECT *
           FROM (
             SELECT
               s.sid AS sid,
               s.serial# AS serial_num,
               NVL(s.username, s.osuser) AS login_name,
               s.status,
               s.event AS wait_type,
               TRUNC(s.seconds_in_wait * 1000) AS wait_ms,
               s.sql_id,
               CASE
                 WHEN s.blocking_session > 0 THEN TO_CHAR(s.blocking_session)
               END AS blocking_session_id,
               s.command,
               TRUNC(NVL(cpu.value, 0) / 1000) AS cpu_time_ms,
               TRUNC(NVL(logical_reads.value, 0)) AS logical_reads,
               (
                 SELECT sql_text
                 FROM v$sql
                 WHERE sql_id = s.sql_id
                   AND ROWNUM = 1
               ) AS sql_text_masked,
               s.machine AS host_name,
               s.program AS program_name
             FROM v$session s
             LEFT JOIN v$sesstat cpu
               ON cpu.sid = s.sid
              AND cpu.statistic# = (
                SELECT statistic#
                FROM v$statname
                WHERE name = 'CPU used by this session'
              )
             LEFT JOIN v$sesstat logical_reads
               ON logical_reads.sid = s.sid
              AND logical_reads.statistic# = (
                SELECT statistic#
                FROM v$statname
                WHERE name = 'session logical reads'
              )
             WHERE s.type = 'USER'
               AND s.username IS NOT NULL
             ORDER BY NVL(cpu.value, 0) DESC, s.sid
           )
           WHERE ROWNUM <= 50`,
        ),
      );

      return rows.map((row) => ({
        collectTime,
        sessionId: `${row.SID},${row.SERIAL_NUM}`,
        loginName: row.LOGIN_NAME,
        status: row.STATUS,
        waitType: row.WAIT_TYPE,
        waitMs: row.WAIT_MS !== null ? Math.trunc(row.WAIT_MS) : null,
        sqlId: row.SQL_ID,
        blockingSessionId: row.BLOCKING_SESSION_ID,
        command: row.COMMAND !== null ? String(row.COMMAND) : null,
        cpuTimeMs: row.CPU_TIME_MS !== null ? Math.trunc(row.CPU_TIME_MS) : null,
        logicalReads:
          row.LOGICAL_READS !== null ? Math.trunc(row.LOGICAL_READS) : null,
        sqlTextMasked: maskSqlText(row.SQL_TEXT_MASKED),
        hostName: row.HOST_NAME,
        programName: row.PROGRAM_NAME,
        databaseName: context.databaseName,
      }));
    },
    collectLocks: async (): Promise<BlockingPayload[]> => {
      const collectTime = now();

      const rows = await withConnection(async (connection) =>
        executeQuery<BlockingRow>(
          connection,
          `SELECT *
           FROM (
             SELECT
               s.blocking_session AS blocker_session_id,
               s.sid AS blocked_session_id,
               NVL(s.event, 'enq') AS lock_type,
               TRUNC(s.seconds_in_wait * 1000) AS wait_ms,
               CAST(NULL AS VARCHAR2(128)) AS object_name
             FROM v$session s
             WHERE s.blocking_session IS NOT NULL
               AND s.blocking_session > 0
               AND s.type = 'USER'
             ORDER BY s.seconds_in_wait DESC
           )
           WHERE ROWNUM <= 50`,
        ),
      );

      return rows.map((row) => ({
        collectTime,
        blockerSessionId: String(row.BLOCKER_SESSION_ID),
        blockedSessionId: String(row.BLOCKED_SESSION_ID),
        lockType: row.LOCK_TYPE,
        waitMs: Math.trunc(row.WAIT_MS),
        objectName: row.OBJECT_NAME,
      }));
    },
    collectDeadlocks: async () => [],
    collectSql: async (): Promise<SqlPerformancePayload[]> => {
      const collectTime = now();

      const rows = await withConnection(async (connection) =>
        executeQuery<SqlPerformanceRow>(
          connection,
          `SELECT *
           FROM (
             SELECT
               sql_id,
               sql_text AS sql_text_masked,
               executions,
               CASE
                 WHEN executions > 0 THEN elapsed_time / executions / 1000
                 ELSE 0
               END AS avg_elapsed_ms,
               cpu_time / 1000 AS total_cpu_ms,
               buffer_gets AS total_logical_reads,
               last_active_time AS last_execution_time
             FROM v$sqlarea
             WHERE executions > 0
               AND sql_text NOT LIKE 'BEGIN %'
               AND sql_id IS NOT NULL
             ORDER BY elapsed_time DESC
           )
           WHERE ROWNUM <= 20`,
        ),
      );

      return rows.map((row) => ({
        collectTime,
        sqlId: row.SQL_ID,
        sqlTextMasked: maskSqlText(row.SQL_TEXT_MASKED),
        executions: Number(row.EXECUTIONS) || 0,
        avgElapsedMs: Number(row.AVG_ELAPSED_MS) || 0,
        totalCpuMs: Number(row.TOTAL_CPU_MS) || 0,
        totalLogicalReads: Number(row.TOTAL_LOGICAL_READS) || 0,
        lastExecutionTime: toIsoString(row.LAST_EXECUTION_TIME),
      }));
    },
    collectSqlPlans: async (): Promise<SqlPlanPayload[]> => {
      const collectTime = now();

      return withConnection(async (connection) => {
        const summaries = await executeQuery<SqlPlanSummaryRow>(
          connection,
          `SELECT *
           FROM (
             SELECT
               sql_id,
               TO_CHAR(plan_hash_value) AS plan_hash,
               executions,
               CASE
                 WHEN executions > 0 THEN elapsed_time / executions / 1000
                 ELSE 0
               END AS avg_elapsed_ms,
               cpu_time / 1000 AS total_cpu_ms,
               buffer_gets AS total_logical_reads
             FROM v$sql
             WHERE executions > 0
               AND sql_id IS NOT NULL
             ORDER BY elapsed_time DESC
           )
           WHERE ROWNUM <= 10`,
        );

        const plans: SqlPlanPayload[] = [];

        for (const summary of summaries) {
          const result = await connection.execute<SqlPlanLineRow>(
            `SELECT operation, options, depth, id
             FROM v$sql_plan
             WHERE sql_id = :sqlId
               AND plan_hash_value = :planHash
             ORDER BY id`,
            {
              sqlId: summary.SQL_ID,
              planHash: Number(summary.PLAN_HASH),
            },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );

          const planLines = (result.rows ?? []) as SqlPlanLineRow[];

          plans.push({
            collectTime,
            sqlId: summary.SQL_ID,
            planHash: summary.PLAN_HASH,
            planText: buildPlanText(planLines),
            executions: Number(summary.EXECUTIONS) || 0,
            avgElapsedMs: Number(summary.AVG_ELAPSED_MS) || 0,
            totalCpuMs: Number(summary.TOTAL_CPU_MS) || 0,
            totalLogicalReads: Number(summary.TOTAL_LOGICAL_READS) || 0,
          });
        }

        return plans;
      });
    },
  };
};
