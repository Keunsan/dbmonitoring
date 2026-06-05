"use client";

/** 실시간 모니터링 화면에서 Collector 실행과 polling 조회를 제공하는 클라이언트 컴포넌트입니다. */

import Link from "next/link";
import { Copy } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { CollectRunButton } from "@/components/features/monitoring/CollectRunButton";
import { CollectionReferenceBar } from "@/components/features/monitoring/CollectionReferenceBar";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CollectorRunResult,
  SessionPayload,
} from "@/services/collector/types";
import type { ResourceSummary } from "@/lib/monitoring/resource-summary";
import { SESSION_TOOLTIP_KEYS } from "@/lib/monitoring/metric-tooltips";
import type { ApiResponse } from "@/types/api";
import type { AlertEvent, DbInstance } from "@/types/entities";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

/** Collector 세션 payload를 화면 테이블 모델로 변환합니다. */
const mapSessionPayloads = (sessions: SessionPayload[]): SessionItem[] =>
  sessions.map((session) => ({
    sessionId: session.sessionId,
    loginName: session.loginName,
    status: session.status,
    waitType: session.waitType,
    waitMs: session.waitMs,
    sqlId: session.sqlId,
    blockingSessionId: session.blockingSessionId ?? null,
    command: session.command ?? null,
    cpuTimeMs: session.cpuTimeMs ?? null,
    logicalReads: session.logicalReads ?? null,
    sqlTextMasked: session.sqlTextMasked ?? null,
    hostName: session.hostName ?? null,
    programName: session.programName ?? null,
    databaseName: session.databaseName ?? null,
  }));

const COLLECTION_REFERENCE_VARIANTS = new Set<
  MonitoringRealtimeClientProps["variant"]
>(["dashboard", "realtime", "sessions", "blocking", "deadlocks"]);

/** 클립보드에 텍스트를 복사하고 짧은 완료 안내를 표시합니다. */
const copyTextToClipboard = async (text: string, label: string) => {
  if (!text.trim()) {
    toast.error(`${label} 내용이 없어 복사할 수 없습니다.`);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    toast.success("복사되었습니다.", { duration: 2000 });
  } catch {
    toast.error("복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
  }
};

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const activeInstanceId = selectedId ?? items[0]?.instance.id;

  const selected = useMemo(() => {
    if (items.length === 0 || !activeInstanceId) {
      return null;
    }
    return items.find((item) => item.instance.id === activeInstanceId) ?? items[0];
  }, [activeInstanceId, items]);

  const refresh = useCallback(async () => {
    if (variant === "sessions" && activeInstanceId) {
      const summaryPayload = await requestJson<{ items: SummaryItem[] }>(
        `/api/monitoring/summary?dbInstanceId=${encodeURIComponent(activeInstanceId)}`,
      );
      const updated = summaryPayload.items[0];

      if (!updated) {
        return;
      }

      setItems((previous) => {
        if (previous.length === 0) {
          return [updated];
        }

        return previous.map((item) =>
          item.instance.id === activeInstanceId ? updated : item,
        );
      });

      return;
    }

    const [summaryPayload, alertPayload] = await Promise.all([
      requestJson<{ items: SummaryItem[] }>("/api/monitoring/summary"),
      requestJson<{ items: AlertEvent[] }>("/api/alerts"),
    ]);

    setItems(summaryPayload.items);
    setAlerts(alertPayload.items);
  }, [activeInstanceId, variant]);

  const collectAndRefresh = useCallback(async () => {
    if (variant === "sessions" && activeInstanceId) {
      const runPayload = await requestJson<{ items: CollectorRunResult[] }>(
        "/api/collector/run",
        {
          method: "POST",
          body: JSON.stringify({
            dbInstanceId: activeInstanceId,
            scope: "sessions",
          }),
        },
      );

      const run = runPayload.items[0];

      if (!run || run.status === "FAIL") {
        throw new Error(run?.errorMessage ?? "세션 수집에 실패했습니다.");
      }

      setItems((previous) =>
        previous.map((item) =>
          item.instance.id === activeInstanceId
            ? {
                ...item,
                summary: {
                  ...item.summary,
                  latestSessions: mapSessionPayloads(run.sessions),
                  lastRun: {
                    status: run.status,
                    finishedAt: run.finishedAt,
                    errorMessage: run.errorMessage,
                  },
                },
              }
            : item,
        ),
      );

      return;
    }

    const collectSingleInstance = variant === "realtime" && activeInstanceId;

    await requestJson("/api/collector/run", {
      method: "POST",
      body: JSON.stringify(
        collectSingleInstance ? { dbInstanceId: activeInstanceId } : {},
      ),
    });
    await requestJson("/api/alerts/evaluate", { method: "POST" });
    await refresh();
  }, [activeInstanceId, refresh, variant]);

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
        }
      }
    };

    void loadSummary();

    const refreshIntervalId = window.setInterval(() => {
      void loadSummary();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshIntervalId);
    };
  }, [refresh, variant]);

  const handleManualCollect = useCallback(async () => {
    setError(null);
    await collectAndRefresh();
  }, [collectAndRefresh]);

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

  const showCollectionReference = COLLECTION_REFERENCE_VARIANTS.has(variant);
  const collectionReferenceMode = variant === "dashboard" ? "dashboard" : "instance";

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={title}
        description={description}
        descriptionBesideTitle={
          variant === "dashboard" ||
          variant === "realtime" ||
          variant === "sessions" ||
          variant === "blocking" ||
          variant === "deadlocks"
        }
        actions={
          <>
            {(variant === "realtime" || variant === "sessions") &&
            items.length > 0 &&
            activeInstanceId ? (
              <DbInstanceSelect
                items={items}
                selectedId={activeInstanceId}
                onSelectId={setSelectedId}
              />
            ) : null}
            <CollectRunButton
              size="sm"
              onCollect={handleManualCollect}
              onFailed={(failedMessage) => setError(failedMessage)}
            />
          </>
        }
        actionsMeta={
          showCollectionReference ? (
            <CollectionReferenceBar
              layout="compact"
              loading={loading}
              items={items}
              mode={collectionReferenceMode}
              selected={selected}
            />
          ) : null
        }
      />
      <div
        className={cn(
          "portal-content-canvas min-h-0 flex-1 p-4 md:p-5",
          variant === "sessions"
            ? "flex flex-col overflow-hidden"
            : "space-y-3 overflow-y-auto",
        )}
      >
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
            {variant === "realtime" && selected ? (
              <RealtimeResourceView item={selected} />
            ) : null}
            {variant === "alerts" ? (
              <AlertsTable alerts={alerts} />
            ) : variant === "sessions" && selected && activeInstanceId ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <SessionsTable
                  key={activeInstanceId}
                  sessions={selected.summary.latestSessions ?? []}
                />
              </div>
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

const StatCard = ({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: number;
  tone?: "default" | "ok" | "fail";
}) => (
  <Card className="border border-border shadow-sm">
    <CardHeader className="pb-2">
      <CardDescription>{title}</CardDescription>
      <CardTitle
        className={cn(
          "text-2xl",
          tone === "ok" && "text-emerald-700 dark:text-emerald-400",
          tone === "fail" && "text-red-600 dark:text-red-400",
        )}
      >
        {formatNumber(value)}
      </CardTitle>
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
        <StatCard title="수집 정상" value={dashboardStats.ok} tone="ok" />
        <StatCard title="수집 실패" value={dashboardStats.fail} tone="fail" />
        <StatCard title="미확인 알림" value={dashboardStats.alerts} />
      </div>
      <ResourceTopLists items={resourceItems} />
      <section className="space-y-2">
        <h3 className="text-sm font-medium">DB별 서버 리소스 현황</h3>
        <div className="grid gap-4 xl:grid-cols-2">
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

/** DB 실시간 현황·세션 화면에서 인스턴스를 선택합니다. */
const DbInstanceSelect = ({
  items,
  selectedId,
  onSelectId,
}: {
  items: SummaryItem[];
  selectedId: string;
  onSelectId: (id: string) => void;
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center">
      <Select value={selectedId} onValueChange={onSelectId}>
        <SelectTrigger className="h-8 w-[7.5rem] min-w-0 px-2 text-xs">
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
  );
};

const RealtimeResourceView = ({ item }: { item: SummaryItem }) => (
  <div className="space-y-4">
    <ResourceOverviewCards resource={item.summary.resourceSummary} />
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

/** 뷰포트 너비에 맞추며 SQL 열이 남은 공간을 차지합니다. minmax(0,…)로 가로 스크롤을 방지합니다. */
const SESSION_TABLE_GRID_CLASS =
  "grid w-full grid-cols-[minmax(0,4.5rem)_minmax(0,6.25rem)_minmax(0,4.5rem)_minmax(0,5.5rem)_minmax(0,3.5rem)_minmax(0,4.5rem)_minmax(0,4.5rem)_minmax(0,7.5rem)_minmax(0,1fr)]";

/** 그리드 셀 내용이 열 너비를 넘지 않도록 합니다. */
const sessionTableCellClass = "min-w-0 overflow-hidden px-2 py-1.5 text-xs";

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
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 pb-2">
          <CardDescription className="text-xs">
            시스템 세션은 SQL Server 기준으로 `is_user_process = 1` 및 세션 ID 50 초과만
            수집해 제외합니다. 행을 클릭하면 세션 상세와 SQL 전문을 확인·복사할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {sortedSessions.length === 0 ? (
            <EmptyState title="수집된 세션이 없습니다" />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
              <div
                className={cn(
                  "shrink-0 border-b bg-secondary/80 text-xs font-medium text-muted-foreground",
                  SESSION_TABLE_GRID_CLASS,
                )}
                role="rowgroup"
              >
                {sessionColumns.map((column) => (
                  <button
                    key={column.key}
                    type="button"
                    className={cn(sessionTableCellClass, "text-left hover:text-foreground")}
                    onClick={() => toggleSort(column.key)}
                  >
                    <span className="block truncate">
                      <MetricInfoTooltip tooltipKey={column.tooltipKey}>
                        {column.label}
                      </MetricInfoTooltip>
                      {sortKey === column.key ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                    </span>
                  </button>
                ))}
                <div className={sessionTableCellClass}>
                  <MetricInfoTooltip tooltipKey={SESSION_TOOLTIP_KEYS.programDatabase}>
                    프로그램/DB
                  </MetricInfoTooltip>
                </div>
                <div className={sessionTableCellClass}>
                  <MetricInfoTooltip tooltipKey={SESSION_TOOLTIP_KEYS.sqlText}>
                    실행 SQL Text
                  </MetricInfoTooltip>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                {sortedSessions.map((session) => (
                  <button
                    key={`${session.sessionId}-${session.sqlId}-${session.command ?? ""}`}
                    type="button"
                    title="클릭하여 세션 상세 및 SQL 전문 보기"
                    aria-label={`세션 ${session.sessionId} 상세 보기`}
                    className={cn(
                      "w-full min-w-0 cursor-pointer border-b text-left text-xs transition-colors last:border-b-0 hover:bg-primary/12 active:bg-primary/18 focus-visible:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30",
                      SESSION_TABLE_GRID_CLASS,
                    )}
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className={cn(sessionTableCellClass, "font-medium")}>
                      {session.sessionId}
                    </div>
                    <div className={cn(sessionTableCellClass, "truncate")} title={session.loginName}>
                      {session.loginName}
                    </div>
                    <div className={cn(sessionTableCellClass, "truncate")}>{session.status}</div>
                    <div className={sessionTableCellClass}>
                      <div className="truncate" title={session.waitType ?? undefined}>
                        {session.waitType ?? "-"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {session.waitMs ?? 0}ms
                      </div>
                    </div>
                    <div className={cn(sessionTableCellClass, "truncate")}>
                      {session.blockingSessionId ?? "-"}
                    </div>
                    <div className={cn(sessionTableCellClass, "tabular-nums")}>
                      {formatNumber(session.cpuTimeMs ?? 0)}
                    </div>
                    <div className={cn(sessionTableCellClass, "tabular-nums")}>
                      {formatNumber(session.logicalReads ?? 0)}
                    </div>
                    <div className={sessionTableCellClass}>
                      <div className="truncate" title={session.programName ?? undefined}>
                        {session.programName ?? "-"}
                      </div>
                      <div
                        className="text-muted-foreground truncate text-xs"
                        title={`${session.databaseName ?? "-"} / ${session.hostName ?? "-"}`}
                      >
                        {session.databaseName ?? "-"} / {session.hostName ?? "-"}
                      </div>
                    </div>
                    <div className={sessionTableCellClass}>
                      <div
                        className="truncate text-muted-foreground text-xs"
                        title={`${session.command ?? "-"} / ${session.sqlId ?? "-"}`}
                      >
                        {session.command ?? "-"} / {session.sqlId ?? "-"}
                      </div>
                      <div
                        className="line-clamp-2 break-all font-mono text-xs"
                        title={session.sqlTextMasked ?? undefined}
                      >
                        {session.sqlTextMasked || "-"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SessionDetailSheet
        session={selectedSession}
        open={selectedSession !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSession(null);
          }
        }}
      />
    </div>
  );
};

type SessionDetailSheetProps = {
  session: SessionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** 세션 상세와 SQL 전문 복사를 제공하는 시트입니다. */
const SessionDetailSheet = ({ session, open, onOpenChange }: SessionDetailSheetProps) => {
  const sqlText = session?.sqlTextMasked?.trim() ?? "";
  const sessionSummaryText = session
    ? [
        `세션 ID: ${session.sessionId}`,
        `계정: ${session.loginName}`,
        `상태: ${session.status}`,
        `대기 유형: ${session.waitType ?? "-"}`,
        `대기(ms): ${session.waitMs ?? "-"}`,
        `Blocking: ${session.blockingSessionId ?? "-"}`,
        `CPU(ms): ${session.cpuTimeMs ?? "-"}`,
        `Logical Reads: ${session.logicalReads ?? "-"}`,
        `Command: ${session.command ?? "-"}`,
        `SQL ID: ${session.sqlId ?? "-"}`,
        `프로그램: ${session.programName ?? "-"}`,
        `데이터베이스: ${session.databaseName ?? "-"}`,
        `호스트: ${session.hostName ?? "-"}`,
        "",
        "--- SQL Text ---",
        sqlText || "(없음)",
      ].join("\n")
    : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-3xl">
        {session ? (
          <>
            <SheetHeader className="border-b border-border/60 pb-4">
              <SheetTitle>세션 상세 · {session.sessionId}</SheetTitle>
              <SheetDescription>
                실행 SQL 전문과 수집 필드 원문을 확인하고 복사할 수 있습니다.
              </SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <SessionDetailField label="세션 ID" value={session.sessionId} />
                <SessionDetailField label="계정" value={session.loginName} />
                <SessionDetailField label="상태" value={session.status} />
                <SessionDetailField label="대기 유형" value={session.waitType} />
                <SessionDetailField
                  label="대기(ms)"
                  value={session.waitMs !== null ? String(session.waitMs) : null}
                />
                <SessionDetailField label="Blocking 세션" value={session.blockingSessionId} />
                <SessionDetailField
                  label="CPU(ms)"
                  value={session.cpuTimeMs !== null ? String(session.cpuTimeMs) : null}
                />
                <SessionDetailField
                  label="Logical Reads"
                  value={session.logicalReads !== null ? String(session.logicalReads) : null}
                />
                <SessionDetailField label="Command" value={session.command} />
                <SessionDetailField label="SQL ID" value={session.sqlId} mono />
                <SessionDetailField
                  label="프로그램"
                  value={session.programName}
                  className="sm:col-span-2"
                />
                <SessionDetailField label="데이터베이스" value={session.databaseName} />
                <SessionDetailField label="호스트" value={session.hostName} />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">실행 SQL Text</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copyTextToClipboard(sqlText, "SQL Text")}
                      disabled={!sqlText}
                    >
                      <Copy className="size-3.5" />
                      SQL 복사
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void copyTextToClipboard(sessionSummaryText, "세션 상세")
                      }
                    >
                      <Copy className="size-3.5" />
                      전체 복사
                    </Button>
                  </div>
                </div>
                <pre className="max-h-[min(50vh,480px)] overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                  {sqlText || "(수집된 SQL Text가 없습니다)"}
                </pre>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

type SessionDetailFieldProps = {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  className?: string;
};

/** 세션 상세 필드 한 줄을 표시합니다. */
const SessionDetailField = ({
  label,
  value,
  mono = false,
  className,
}: SessionDetailFieldProps) => (
  <div className={cn("space-y-1", className)}>
    <p className="text-muted-foreground text-xs">{label}</p>
    <p
      className={cn(
        "break-all text-sm",
        mono && "font-mono text-xs",
        !value && "text-muted-foreground",
      )}
    >
      {value?.trim() ? value : "-"}
    </p>
  </div>
);

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
