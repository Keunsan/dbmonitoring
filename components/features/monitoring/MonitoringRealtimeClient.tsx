"use client";

/** 실시간 모니터링 화면에서 Collector 실행과 polling 조회를 제공하는 클라이언트 컴포넌트입니다. */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { DbResourceCard } from "@/components/features/monitoring/DbResourceCard";
import { DbStoragePanels } from "@/components/features/monitoring/DbStoragePanels";
import { MetricInfoTooltip } from "@/components/features/monitoring/MetricInfoTooltip";
import { ResourceMetricGrid } from "@/components/features/monitoring/ResourceMetricGrid";
import { ResourceOverviewCards } from "@/components/features/monitoring/ResourceOverviewCards";
import { ResourceTopLists } from "@/components/features/monitoring/ResourceTopLists";
import { ResourceTrendChart } from "@/components/features/monitoring/ResourceTrendChart";
import { ThroughputSessionCards } from "@/components/features/monitoring/ThroughputSessionCards";
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ResourceSummary } from "@/lib/monitoring/resource-summary";
import { SESSION_TOOLTIP_KEYS } from "@/lib/monitoring/metric-tooltips";
import type { ApiResponse } from "@/types/api";
import type { AlertEvent, DbInstance } from "@/types/entities";

type MetricItem = {
  id: string;
  metricName: string;
  metricValue: number;
  unit: string | null;
  metricTime: string;
  tags?: Record<string, string>;
};

type SessionItem = {
  sessionId: string;
  loginName: string;
  status: string;
  waitType: string | null;
  waitMs: number | null;
  sqlId: string | null;
  blockingSessionId: string | null;
  command: string | null;
  cpuTimeMs: number | null;
  logicalReads: number | null;
  sqlTextMasked: string | null;
  hostName: string | null;
  programName: string | null;
  databaseName: string | null;
};

type SqlItem = {
  sqlId: string;
  sqlTextMasked: string;
  executions: number;
  avgElapsedMs: number;
  totalCpuMs: number;
};

type BlockingItem = {
  blockerSessionId: string;
  blockedSessionId: string;
  lockType: string;
  waitMs: number;
  objectName: string | null;
};

type SummaryItem = {
  instance: DbInstance;
  summary: {
    dbInstanceId: string;
    lastRun: {
      status: "OK" | "FAIL" | "DELAYED";
      finishedAt: string;
      errorMessage: string | null;
    } | null;
    latestMetrics: MetricItem[];
    resourceSummary: ResourceSummary;
    latestSessions: SessionItem[];
    latestSql: SqlItem[];
    blockingCount: number;
    deadlockCount: number;
  };
};

type MonitoringRealtimeClientProps = {
  title: string;
  description: string;
  variant: "dashboard" | "realtime" | "sessions" | "blocking" | "deadlocks" | "waits" | "top-sql" | "alerts";
};

const requestJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "요청 처리 중 오류가 발생했습니다.");
  }

  return payload.data as T;
};

const formatNumber = (value: number) =>
  Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);

/**
 * 최신 수집 요약과 알림을 주기적으로 조회합니다.
 */
export const MonitoringRealtimeClient = ({
  title,
  description,
  variant,
}: MonitoringRealtimeClientProps) => {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const initialCollectStartedRef = useRef(false);

  const activeInstanceId = selectedId ?? items[0]?.instance.id;

  const selected = useMemo(() => {
    if (items.length === 0 || !activeInstanceId) {
      return null;
    }
    return items.find((item) => item.instance.id === activeInstanceId) ?? items[0];
  }, [activeInstanceId, items]);
  const shouldAutoCollect = ["realtime", "sessions", "blocking", "top-sql"].includes(
    variant,
  );

  const refresh = useCallback(async () => {
    const [summaryPayload, alertPayload] = await Promise.all([
      requestJson<{ items: SummaryItem[] }>("/api/monitoring/summary"),
      requestJson<{ items: AlertEvent[] }>("/api/alerts"),
    ]);

    setItems(summaryPayload.items);
    setAlerts(alertPayload.items);
  }, []);

  const runCollectorSilently = useCallback(async () => {
    try {
      await requestJson("/api/collector/run", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await requestJson("/api/alerts/evaluate", { method: "POST" });
      await refresh();
    } catch {
      // 수집이 이미 진행 중이거나 일시 실패해도 기존 스냅샷으로 화면을 유지합니다.
    }
  }, [refresh]);

  const collectAndRefresh = useCallback(async () => {
    await requestJson("/api/collector/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await requestJson("/api/alerts/evaluate", { method: "POST" });
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        await refresh();
        if (!cancelled) {
          setError(null);
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "실시간 데이터를 조회하지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);

          if (shouldAutoCollect && !initialCollectStartedRef.current) {
            initialCollectStartedRef.current = true;
            window.setTimeout(() => {
              void runCollectorSilently();
            }, 0);
          }
        }
      }
    };

    void loadSummary();

    const refreshIntervalId = window.setInterval(() => {
      void loadSummary();
    }, 10_000);

    const collectIntervalId = shouldAutoCollect
      ? window.setInterval(() => {
          void runCollectorSilently();
        }, 30_000)
      : null;

    return () => {
      cancelled = true;
      window.clearInterval(refreshIntervalId);
      if (collectIntervalId) {
        window.clearInterval(collectIntervalId);
      }
    };
  }, [refresh, runCollectorSilently, shouldAutoCollect, variant]);

  const runCollector = async () => {
    setRunning(true);
    setMessage(null);
    setError(null);

    try {
      await collectAndRefresh();
      setMessage("Collector 실행과 임계치 평가가 완료되었습니다.");
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Collector 실행에 실패했습니다.",
      );
    } finally {
      setRunning(false);
    }
  };

  const dashboardStats = useMemo(() => {
    const ok = items.filter((item) => item.summary.lastRun?.status === "OK").length;
    const fail = items.filter((item) => item.summary.lastRun?.status === "FAIL").length;

    return {
      total: items.length,
      ok,
      fail,
      alerts: alerts.filter((alert) => alert.status === "NEW").length,
    };
  }, [alerts, items]);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={() => void runCollector()} disabled={running}>
            {running ? "수집 중" : "실시간 수집 실행"}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {message ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700">
            <AlertDescription className="text-emerald-700">{message}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <EmptyState title="실시간 데이터를 불러오는 중입니다" />
        ) : items.length === 0 ? (
          <EmptyState
            title="등록된 DB 인스턴스가 없습니다"
            description="시스템 관리에서 DB 인스턴스를 등록한 뒤 수집을 실행해주세요."
          />
        ) : (
          <>
            {variant === "dashboard" ? (
              <DashboardResourceView items={items} dashboardStats={dashboardStats} />
            ) : null}
            {variant === "realtime" && selected && activeInstanceId ? (
              <RealtimeResourceView
                item={selected}
                items={items}
                selectedId={activeInstanceId}
                onSelectId={setSelectedId}
              />
            ) : null}
            {variant === "alerts" ? (
              <AlertsTable alerts={alerts} />
            ) : variant === "sessions" ? (
              <SessionsTable sessions={selected?.summary.latestSessions ?? []} />
            ) : variant === "blocking" ? (
              <BlockingTable items={[]} count={selected?.summary.blockingCount ?? 0} />
            ) : variant === "deadlocks" ? (
              <DeadlockCard count={selected?.summary.deadlockCount ?? 0} />
            ) : variant === "top-sql" ? (
              <SqlTable
                sql={selected?.summary.latestSql ?? []}
                dbInstanceId={selected?.instance.id}
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
};

const StatCard = ({ title, value }: { title: string; value: number }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardDescription>{title}</CardDescription>
      <CardTitle className="text-2xl">{formatNumber(value)}</CardTitle>
    </CardHeader>
  </Card>
);

const DashboardResourceView = ({
  items,
  dashboardStats,
}: {
  items: SummaryItem[];
  dashboardStats: { total: number; ok: number; fail: number; alerts: number };
}) => {
  const resourceItems = items.map((item) => ({
    instance: item.instance,
    resourceSummary: item.summary.resourceSummary,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard title="전체 DB" value={dashboardStats.total} />
        <StatCard title="수집 정상" value={dashboardStats.ok} />
        <StatCard title="수집 실패" value={dashboardStats.fail} />
        <StatCard title="미확인 알림" value={dashboardStats.alerts} />
      </div>
      <ResourceTopLists items={resourceItems} />
      <section className="space-y-2">
        <h3 className="text-sm font-medium">DB별 서버 리소스 현황</h3>
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <DbResourceCard
              key={item.instance.id}
              instance={item.instance}
              resourceSummary={item.summary.resourceSummary}
              latestMetrics={item.summary.latestMetrics.map((metric) => ({
                id: metric.id,
                tenantId: item.instance.tenantId,
                dbInstanceId: item.instance.id,
                metricTime: metric.metricTime,
                metricName: metric.metricName,
                metricValue: metric.metricValue,
                unit: metric.unit,
                tags: metric.tags ?? {},
              }))}
              collectStatus={item.summary.lastRun?.status ?? null}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

const RealtimeResourceView = ({
  item,
  items,
  selectedId,
  onSelectId,
}: {
  item: SummaryItem;
  items: SummaryItem[];
  selectedId: string;
  onSelectId: (id: string) => void;
}) => (
  <div className="space-y-4">
    {items.length > 1 ? (
      <div className="max-w-sm">
        <Select value={selectedId} onValueChange={onSelectId}>
          <SelectTrigger>
            <SelectValue placeholder="DB 인스턴스 선택" />
          </SelectTrigger>
          <SelectContent>
            {items.map((entry) => (
              <SelectItem key={entry.instance.id} value={entry.instance.id}>
                {entry.instance.instanceName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null}
    <ResourceOverviewCards
      title={`${item.instance.instanceName} 서버 상태`}
      resource={item.summary.resourceSummary}
    />
    <ThroughputSessionCards resource={item.summary.resourceSummary} />
    <ResourceTrendChart
      key={item.instance.id}
      dbInstanceId={item.instance.id}
      title={`${item.instance.instanceName} · 최근 30포인트`}
    />
    <Card>
      <CardHeader>
        <CardTitle>DB 용량 · 테이블 크기</CardTitle>
        <CardDescription>
          파일그룹·데이터파일 사용률과 상위 테이블 용량입니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DbStoragePanels
          metrics={item.summary.latestMetrics.map((metric) => ({
            id: metric.id,
            tenantId: item.instance.tenantId,
            dbInstanceId: item.instance.id,
            metricTime: metric.metricTime,
            metricName: metric.metricName,
            metricValue: metric.metricValue,
            unit: metric.unit,
            tags: metric.tags ?? {},
          }))}
        />
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>세부 리소스 지표</CardTitle>
        <CardDescription>
          최근 수집 시각:{" "}
          {item.summary.latestMetrics[0]?.metricTime
            ? new Date(item.summary.latestMetrics[0].metricTime).toLocaleString("ko-KR")
            : "-"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResourceMetricGrid
          metrics={item.summary.latestMetrics.map((metric) => ({
            id: metric.id,
            tenantId: item.instance.tenantId,
            dbInstanceId: item.instance.id,
            metricTime: metric.metricTime,
            metricName: metric.metricName,
            metricValue: metric.metricValue,
            unit: metric.unit,
            tags: metric.tags ?? {},
          }))}
          resource={item.summary.resourceSummary}
        />
      </CardContent>
    </Card>
  </div>
);

type SessionSortKey =
  | "sessionId"
  | "loginName"
  | "status"
  | "waitMs"
  | "blockingSessionId"
  | "cpuTimeMs"
  | "logicalReads";

const sessionColumns: Array<{
  key: SessionSortKey;
  label: string;
  tooltipKey: string;
}> = [
  { key: "sessionId", label: "세션 ID", tooltipKey: SESSION_TOOLTIP_KEYS.sessionId },
  { key: "loginName", label: "계정", tooltipKey: SESSION_TOOLTIP_KEYS.loginName },
  { key: "status", label: "상태", tooltipKey: SESSION_TOOLTIP_KEYS.status },
  { key: "waitMs", label: "대기(ms)", tooltipKey: SESSION_TOOLTIP_KEYS.waitMs },
  {
    key: "blockingSessionId",
    label: "Blkby",
    tooltipKey: SESSION_TOOLTIP_KEYS.blockingSessionId,
  },
  { key: "cpuTimeMs", label: "CPU(ms)", tooltipKey: SESSION_TOOLTIP_KEYS.cpuTimeMs },
  {
    key: "logicalReads",
    label: "Reads",
    tooltipKey: SESSION_TOOLTIP_KEYS.logicalReads,
  },
];

const getSessionSortValue = (session: SessionItem, key: SessionSortKey) => {
  const value = session[key];

  if (value === null || value === undefined) {
    return key === "sessionId" || key.endsWith("Ms") || key === "logicalReads" ? -1 : "";
  }

  if (key === "sessionId" || key.endsWith("Ms") || key === "logicalReads") {
    return Number(value);
  }

  return String(value);
};

const SessionsTable = ({ sessions }: { sessions: SessionItem[] }) => {
  const [sortKey, setSortKey] = useState<SessionSortKey>("cpuTimeMs");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const left = getSessionSortValue(a, sortKey);
      const right = getSessionSortValue(b, sortKey);
      const direction = sortDirection === "asc" ? 1 : -1;

      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }

      return String(left).localeCompare(String(right), "ko-KR") * direction;
    });
  }, [sessions, sortDirection, sortKey]);

  const toggleSort = (key: SessionSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("desc");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>실시간 세션</CardTitle>
        <CardDescription>
          시스템 세션은 SQL Server 기준으로 `is_user_process = 1` 및 세션 ID 50 초과만
          수집해 제외합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sortedSessions.length === 0 ? (
          <EmptyState title="수집된 세션이 없습니다" />
        ) : (
          <div className="max-h-[calc(100svh-16rem)] overflow-auto">
            <div className="min-w-[1180px] rounded-lg border">
              <div className="sticky top-0 z-10 grid grid-cols-[90px_150px_110px_120px_90px_100px_100px_180px_minmax(280px,1fr)] border-b bg-muted/95 text-xs font-medium text-muted-foreground backdrop-blur">
                {sessionColumns.map((column) => (
                  <button
                    key={column.key}
                    type="button"
                    className="px-3 py-2 text-left hover:text-foreground"
                    onClick={() => toggleSort(column.key)}
                  >
                    <MetricInfoTooltip tooltipKey={column.tooltipKey}>
                      {column.label}
                    </MetricInfoTooltip>
                    {sortKey === column.key ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                ))}
                <div className="px-3 py-2">
                  <MetricInfoTooltip tooltipKey={SESSION_TOOLTIP_KEYS.programDatabase}>
                    프로그램/DB
                  </MetricInfoTooltip>
                </div>
                <div className="px-3 py-2">
                  <MetricInfoTooltip tooltipKey={SESSION_TOOLTIP_KEYS.sqlText}>
                    실행 SQL Text
                  </MetricInfoTooltip>
                </div>
              </div>
              {sortedSessions.map((session) => (
                <div
                  key={`${session.sessionId}-${session.sqlId}-${session.command ?? ""}`}
                  className="grid grid-cols-[90px_150px_110px_120px_90px_100px_100px_180px_minmax(280px,1fr)] border-b text-sm last:border-b-0"
                >
                  <div className="px-3 py-2 font-medium">{session.sessionId}</div>
                  <div className="px-3 py-2">{session.loginName}</div>
                  <div className="px-3 py-2">{session.status}</div>
                  <div className="px-3 py-2">
                    <div>{session.waitType ?? "-"}</div>
                    <div className="text-muted-foreground text-xs">
                      {session.waitMs ?? 0}ms
                    </div>
                  </div>
                  <div className="px-3 py-2">{session.blockingSessionId ?? "-"}</div>
                  <div className="px-3 py-2">{formatNumber(session.cpuTimeMs ?? 0)}</div>
                  <div className="px-3 py-2">{formatNumber(session.logicalReads ?? 0)}</div>
                  <div className="px-3 py-2">
                    <div className="truncate">{session.programName ?? "-"}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {session.databaseName ?? "-"} / {session.hostName ?? "-"}
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <div className="text-muted-foreground text-xs">
                      {session.command ?? "-"} / {session.sqlId ?? "-"}
                    </div>
                    <div className="line-clamp-2 font-mono text-xs">
                      {session.sqlTextMasked || "-"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const SqlTable = ({
  sql,
  dbInstanceId,
}: {
  sql: SqlItem[];
  dbInstanceId?: string;
}) => (
  <DataTable title="Top SQL" empty="수집된 SQL 성능 데이터가 없습니다.">
    {sql.map((item) => (
      <TableRow key={item.sqlId}>
        <TableCell className="max-w-48 truncate">
          {dbInstanceId ? (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              href={`/analysis/sql/${encodeURIComponent(item.sqlId)}?dbInstanceId=${encodeURIComponent(dbInstanceId)}`}
            >
              {item.sqlId}
            </Link>
          ) : (
            item.sqlId
          )}
        </TableCell>
        <TableCell>{formatNumber(item.executions)}</TableCell>
        <TableCell>{formatNumber(item.avgElapsedMs)}ms</TableCell>
        <TableCell>{formatNumber(item.totalCpuMs)}ms</TableCell>
        <TableCell className="max-w-xl truncate">{item.sqlTextMasked}</TableCell>
      </TableRow>
    ))}
  </DataTable>
);

const BlockingTable = ({
  items,
  count,
}: {
  items: BlockingItem[];
  count: number;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Blocking 현황</CardTitle>
      <CardDescription>현재 수집된 Blocking 건수: {count}건</CardDescription>
    </CardHeader>
    <CardContent>
      {items.length === 0 ? (
        <EmptyState title="현재 Blocking 데이터가 없습니다" />
      ) : null}
    </CardContent>
  </Card>
);

const DeadlockCard = ({ count }: { count: number }) => (
  <Card>
    <CardHeader>
      <CardTitle>Deadlock 현황</CardTitle>
      <CardDescription>최근 수집된 Deadlock 이벤트 수입니다.</CardDescription>
    </CardHeader>
    <CardContent className="text-2xl font-semibold">{count}건</CardContent>
  </Card>
);

const AlertsTable = ({ alerts }: { alerts: AlertEvent[] }) => (
  <DataTable title="실시간 알림" empty="생성된 알림이 없습니다.">
    {alerts.map((alert) => (
      <TableRow key={alert.id}>
        <TableCell>{alert.severity}</TableCell>
        <TableCell>{alert.category}</TableCell>
        <TableCell>{alert.title}</TableCell>
        <TableCell className="max-w-xl truncate">{alert.message}</TableCell>
        <TableCell>{alert.status}</TableCell>
      </TableRow>
    ))}
  </DataTable>
);

const DataTable = ({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="max-h-[calc(100svh-16rem)] overflow-auto rounded-lg border">
        <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead>구분</TableHead>
            <TableHead>값 1</TableHead>
            <TableHead>값 2</TableHead>
            <TableHead>값 3</TableHead>
            <TableHead>상세</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
        </Table>
      </div>
      {children ? null : <EmptyState title={empty} />}
    </CardContent>
  </Card>
);
