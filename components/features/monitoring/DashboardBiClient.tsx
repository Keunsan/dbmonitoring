"use client";

/** BI·차트 중심 통합 현황 대시보드(v1) — 리소스·용량 사용률 비교에 초점을 둡니다. */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, BarChart3, HardDrive, MemoryStick, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { CollectRunButton } from "@/components/features/monitoring/CollectRunButton";
import { CollectionReferenceBar } from "@/components/features/monitoring/CollectionReferenceBar";
import { PageHeader } from "@/components/layout";
import { MetricInfoTooltip } from "@/components/features/monitoring/MetricInfoTooltip";
import { EmptyState } from "@/components/shared";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  extractInstanceStorageCapacity,
  formatStorageGb,
  mbToGb,
} from "@/lib/monitoring/storage-capacity";
import type { ResourceSummary } from "@/lib/monitoring/resource-summary";
import { getResourceHealth } from "@/lib/monitoring/resource-summary";
import { SERVER_METRIC_KEYS } from "@/lib/monitoring/metric-keys";
import { BI_CHART_TOOLTIP_KEYS, type BiChartTooltipKey } from "@/lib/monitoring/metric-tooltips";
import type { MetricHistoryRecord } from "@/services/storage/types";
import type { ApiResponse } from "@/types/api";
import type { DbInstance } from "@/types/entities";
import { cn } from "@/lib/utils";

/** 다중 시리즈 차트에서 구분이 잘 되도록 고정 대비 색상을 사용합니다. */
const CHART_SERIES = {
  cpu: "var(--chart-series-cpu)",
  memory: "var(--chart-series-memory)",
  qps: "var(--chart-series-qps)",
  tps: "var(--chart-series-tps)",
  readLatency: "var(--chart-series-read-latency)",
  writeLatency: "var(--chart-series-write-latency)",
  sessionIdle: "var(--chart-series-session-idle)",
  sessionActive: "var(--chart-series-session-active)",
} as const;

type SummaryItem = {
  instance: DbInstance;
  summary: {
    latestMetrics: MetricHistoryRecord[];
    resourceSummary: ResourceSummary;
    lastRun: {
      status: "OK" | "FAIL" | "DELAYED";
      finishedAt: string;
    } | null;
  };
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

const formatNumber = (value: number, digits = 1) =>
  Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits }).format(value);

/** DB 인스턴스명 기준으로 차트·표 행을 정렬합니다. */
const sortByInstanceName = <T extends { name: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name, "ko"));

/** DB 인스턴스명이 잘 보이도록 X축 라벨 공통 설정입니다. */
const INSTANCE_AXIS_HEIGHT = 80;

const instanceNameXAxisProps = {
  dataKey: "name",
  tickLine: false,
  axisLine: false,
  interval: 0,
  angle: -35,
  textAnchor: "end" as const,
  height: INSTANCE_AXIS_HEIGHT,
  tick: { fontSize: 11 },
};

const BI_CHART_HEIGHT = "h-[280px]";

const resourceBarConfig = {
  cpu: { label: "CPU %", color: CHART_SERIES.cpu },
  memory: { label: "메모리 %", color: CHART_SERIES.memory },
} satisfies ChartConfig;

const ioBarConfig = {
  readLatency: { label: "읽기 지연(ms)", color: CHART_SERIES.readLatency },
  writeLatency: { label: "쓰기 지연(ms)", color: CHART_SERIES.writeLatency },
} satisfies ChartConfig;

const throughputBarConfig = {
  qps: { label: "QPS", color: CHART_SERIES.qps },
  tps: { label: "TPS", color: CHART_SERIES.tps },
} satisfies ChartConfig;

const cpuOnlyBarConfig = {
  cpu: { label: "CPU %", color: CHART_SERIES.cpu },
} satisfies ChartConfig;

const memoryOnlyBarConfig = {
  memory: { label: "메모리 %", color: CHART_SERIES.memory },
} satisfies ChartConfig;

const qpsOnlyBarConfig = {
  qps: { label: "QPS", color: CHART_SERIES.qps },
} satisfies ChartConfig;

const tpsOnlyBarConfig = {
  tps: { label: "TPS", color: CHART_SERIES.tps },
} satisfies ChartConfig;

type DashboardBiVariant = "v1" | "v2";

const DASHBOARD_BI_META: Record<
  DashboardBiVariant,
  { title: string; description: string }
> = {
  v1: {
    title: "통합 현황_v1",
    description:
      "MDF/LDF 사용량(GB), CPU·메모리·I/O·처리량·세션을 차트와 히트맵으로 비교합니다.",
  },
  v2: {
    title: "통합 현황_v2",
    description:
      "CPU·메모리·QPS·TPS·세션·I/O·데이터·로그 파일 크기를 인스턴스별 차트와 히트맵으로 비교합니다.",
  },
};

const sessionStackConfig = {
  idle: { label: "비활성·기타", color: CHART_SERIES.sessionIdle },
  active: { label: "활성 세션", color: CHART_SERIES.sessionActive },
} satisfies ChartConfig;

type HeatmapColumnId =
  | "cpuUsedPercent"
  | "memoryUsedPercent"
  | "diskReadLatencyMs"
  | "mdfDataSizeGb"
  | "batchRequestsPerSec"
  | "transactionsPerSec"
  | "sessionActiveTotal";

const HEATMAP_COLUMNS: Array<{ id: HeatmapColumnId; label: string }> = [
  { id: "cpuUsedPercent", label: "CPU" },
  { id: "memoryUsedPercent", label: "메모리" },
  { id: "diskReadLatencyMs", label: "디스크 읽기" },
  { id: "mdfDataSizeGb", label: "데이터크기" },
  { id: "batchRequestsPerSec", label: "QPS" },
  { id: "transactionsPerSec", label: "TPS" },
  { id: "sessionActiveTotal", label: "활성/전체세션수" },
];

type HeatmapCell = {
  display: string;
  health: ReturnType<typeof getResourceHealth>;
  sortValue: number | null;
};

/** 히트맵 열별 표시·정렬·건강도 값을 계산합니다. */
const getHeatmapCell = (item: SummaryItem, columnId: HeatmapColumnId): HeatmapCell => {
  const { resourceSummary, latestMetrics } = item.summary;

  if (columnId === "mdfDataSizeGb") {
    const capacity = extractInstanceStorageCapacity(latestMetrics, resourceSummary);
    const mdfGb = mbToGb(capacity.mdfUsedMb);
    return {
      display: formatStorageGb(mdfGb),
      health: getResourceHealth("storageUsedPercent", capacity.mdfUsedPercent),
      sortValue: mdfGb,
    };
  }

  if (columnId === "sessionActiveTotal") {
    const active = resourceSummary.sessionActiveCount;
    const total = resourceSummary.sessionTotalCount;
    const display =
      active !== null && total !== null
        ? `${formatNumber(active, 0)}/${formatNumber(total, 0)}`
        : "-";
    return {
      display,
      health: "unknown",
      sortValue: active,
    };
  }

  const value = resourceSummary[columnId];
  let unitSuffix = "";
  if (columnId === "cpuUsedPercent" || columnId === "memoryUsedPercent") {
    unitSuffix = "%";
  } else if (columnId === "diskReadLatencyMs") {
    unitSuffix = "ms";
  }
  const display = value === null ? "-" : `${formatNumber(value)}${unitSuffix}`;

  return {
    display,
    health: getResourceHealth(columnId, value),
    sortValue: value,
  };
};

const heatColorClass = (health: ReturnType<typeof getResourceHealth>) => {
  switch (health) {
    case "warning":
      return "bg-destructive/20 text-red-950 dark:bg-destructive/35 dark:text-destructive-foreground";
    case "caution":
      return "bg-amber-400/35 text-amber-950 dark:bg-amber-500/30 dark:text-amber-100";
    case "normal":
      return "bg-primary/12 text-foreground dark:bg-primary/25";
    default:
      return "bg-muted/40 text-muted-foreground";
  }
};

type HeatmapSortKey = "instanceName" | HeatmapColumnId | "collectStatus";

const COLLECT_STATUS_ORDER: Record<string, number> = {
  OK: 0,
  DELAYED: 1,
  FAIL: 2,
};

const compareNullableNumber = (
  left: number | null,
  right: number | null,
  direction: 1 | -1,
) => {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return (left - right) * direction;
};

const getHeatmapSortValue = (
  item: SummaryItem,
  sortKey: HeatmapSortKey,
): string | number | null => {
  if (sortKey === "instanceName") {
    return item.instance.instanceName;
  }

  if (sortKey === "collectStatus") {
    return item.summary.lastRun?.status ?? null;
  }

  return getHeatmapCell(item, sortKey).sortValue;
};

/** 인스턴스 × 지표 히트맵 테이블입니다. */
const InstanceMetricHeatmap = ({ items }: { items: SummaryItem[] }) => {
  const [sortKey, setSortKey] = useState<HeatmapSortKey>("instanceName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(() => {
    const direction: 1 | -1 = sortDirection === "asc" ? 1 : -1;

    return [...items].sort((a, b) => {
      const left = getHeatmapSortValue(a, sortKey);
      const right = getHeatmapSortValue(b, sortKey);

      if (sortKey === "instanceName") {
        return (
          String(left).localeCompare(String(right), "ko") * direction
        );
      }

      if (sortKey === "collectStatus") {
        const leftOrder =
          left === null ? Number.MAX_SAFE_INTEGER : COLLECT_STATUS_ORDER[String(left)] ?? 99;
        const rightOrder =
          right === null ? Number.MAX_SAFE_INTEGER : COLLECT_STATUS_ORDER[String(right)] ?? 99;
        return (leftOrder - rightOrder) * direction;
      }

      return compareNullableNumber(
        typeof left === "number" ? left : null,
        typeof right === "number" ? right : null,
        direction,
      );
    });
  }, [items, sortDirection, sortKey]);

  const toggleSort = (key: HeatmapSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "instanceName" ? "asc" : "desc");
  };

  const sortIndicator = (key: HeatmapSortKey) =>
    sortKey === key ? (sortDirection === "asc" ? " ▲" : " ▼") : "";

  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader>
        <CardTitle className="text-base">인스턴스 × 지표 히트맵</CardTitle>
        <CardDescription>
          색이 진할수록 주의·경고 수준입니다. 열 제목을 클릭하면 해당 기준으로 정렬합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-2 py-2 text-left font-mono text-xs text-muted-foreground">
                <button
                  type="button"
                  className="cursor-pointer text-left transition-colors hover:text-foreground"
                  onClick={() => toggleSort("instanceName")}
                >
                  DB 인스턴스{sortIndicator("instanceName")}
                </button>
              </th>
              {HEATMAP_COLUMNS.map((column) => (
                <th
                  key={column.id}
                  className="px-2 py-2 text-center font-mono text-xs text-muted-foreground"
                >
                  <button
                    type="button"
                    className="cursor-pointer transition-colors hover:text-foreground"
                    onClick={() => toggleSort(column.id)}
                  >
                    {column.label}
                    {sortIndicator(column.id)}
                  </button>
                </th>
              ))}
              <th className="px-2 py-2 text-center text-xs text-muted-foreground">
                <button
                  type="button"
                  className="cursor-pointer transition-colors hover:text-foreground"
                  onClick={() => toggleSort("collectStatus")}
                >
                  수집{sortIndicator("collectStatus")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((item) => (
              <tr
                key={item.instance.id}
                className="border-b border-border/40 last:border-0"
              >
                <td className="px-2 py-2 font-medium whitespace-nowrap">
                  <div>{item.instance.instanceName}</div>
                  <div className="text-muted-foreground text-xs">
                    {item.instance.dbmsType}
                  </div>
                </td>
                {HEATMAP_COLUMNS.map((column) => {
                  const cell = getHeatmapCell(item, column.id);

                  return (
                    <td key={column.id} className="p-1">
                      <div
                        title={`${column.label}: ${cell.display}`}
                        className={cn(
                          "flex min-h-10 items-center justify-center rounded-md px-1 font-mono text-xs tabular-nums",
                          heatColorClass(cell.health),
                        )}
                      >
                        {cell.display}
                      </div>
                    </td>
                  );
                })}
                <td className="p-1 text-center">
                  {item.summary.lastRun?.status ? (
                    <StatusBadge
                      kind="collect"
                      value={item.summary.lastRun.status}
                      className="mx-auto"
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

type DashboardBiClientProps = {
  variant?: DashboardBiVariant;
};

/**
 * DB 리소스 BI 대시보드를 렌더링합니다. v1·v2는 차트 배치만 다릅니다.
 */
export const DashboardBiClient = ({ variant = "v1" }: DashboardBiClientProps) => {
  const meta = DASHBOARD_BI_META[variant];
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const summaryPayload = await requestJson<{ items: SummaryItem[] }>(
      "/api/monitoring/summary",
    );
    setItems(summaryPayload.items);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await refresh();
        if (!cancelled) {
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "대시보드 데이터를 조회하지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    const intervalId = window.setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const handleManualCollect = useCallback(async () => {
    setError(null);
    await requestJson("/api/collector/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await requestJson("/api/alerts/evaluate", { method: "POST" });
    await refresh();
  }, [refresh]);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.instance.instanceName.localeCompare(b.instance.instanceName, "ko"),
      ),
    [items],
  );

  const mdfUsageData = useMemo(
    () =>
      sortByInstanceName(
        sortedItems
          .map((item) => {
            const capacity = extractInstanceStorageCapacity(
              item.summary.latestMetrics,
              item.summary.resourceSummary,
            );
            const mdfGb = mbToGb(capacity.mdfUsedMb);
            return {
              name: item.instance.instanceName,
              mdfGb,
            };
          })
          .filter((row): row is { name: string; mdfGb: number } => row.mdfGb !== null),
      ),
    [sortedItems],
  );

  const ldfUsageData = useMemo(
    () =>
      sortByInstanceName(
        sortedItems
          .map((item) => {
            const capacity = extractInstanceStorageCapacity(
              item.summary.latestMetrics,
              item.summary.resourceSummary,
            );
            const ldfGb = mbToGb(capacity.ldfUsedMb);
            return {
              name: item.instance.instanceName,
              ldfGb,
            };
          })
          .filter((row): row is { name: string; ldfGb: number } => row.ldfGb !== null),
      ),
    [sortedItems],
  );

  const resourceBarData = useMemo(
    () =>
      sortByInstanceName(
        sortedItems.map((item) => ({
          name: item.instance.instanceName,
          cpu: item.summary.resourceSummary.cpuUsedPercent ?? 0,
          memory: item.summary.resourceSummary.memoryUsedPercent ?? 0,
        })),
      ),
    [sortedItems],
  );

  const ioBarData = useMemo(
    () =>
      sortByInstanceName(
        sortedItems.map((item) => ({
          name: item.instance.instanceName,
          readLatency: item.summary.resourceSummary.diskReadLatencyMs ?? 0,
          writeLatency: item.summary.resourceSummary.diskWriteLatencyMs ?? 0,
        })),
      ),
    [sortedItems],
  );

  const throughputBarData = useMemo(
    () =>
      sortByInstanceName(
        sortedItems.map((item) => ({
          name: item.instance.instanceName,
          qps: item.summary.resourceSummary.batchRequestsPerSec ?? 0,
          tps: item.summary.resourceSummary.transactionsPerSec ?? 0,
        })),
      ),
    [sortedItems],
  );

  const sessionByInstanceData = useMemo(
    () =>
      sortByInstanceName(
        sortedItems.map((item) => {
          const total = item.summary.resourceSummary.sessionTotalCount ?? 0;
          const active = item.summary.resourceSummary.sessionActiveCount ?? 0;
          return {
            name: item.instance.instanceName,
            active,
            idle: Math.max(0, total - active),
          };
        }),
      ),
    [sortedItems],
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={meta.title}
        description={meta.description}
        descriptionBesideTitle
        actions={
          <CollectRunButton
            onCollect={handleManualCollect}
            onFailed={(failedMessage) => setError(failedMessage)}
          />
        }
        actionsMeta={
          <CollectionReferenceBar
            layout="compact"
            loading={loading}
            items={items}
            mode="dashboard"
          />
        }
      />
      <div className="portal-content-canvas min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <EmptyState title="대시보드 데이터를 불러오는 중입니다" />
        ) : items.length === 0 ? (
          <EmptyState
            title="등록된 DB 인스턴스가 없습니다"
            description="시스템 관리에서 DB 인스턴스를 등록한 뒤 수집을 실행해주세요."
          />
        ) : (
          <div className="space-y-4">
            <BiChartGrid
              variant={variant}
              resourceBarData={resourceBarData}
              ioBarData={ioBarData}
              throughputBarData={throughputBarData}
              sessionByInstanceData={sessionByInstanceData}
              mdfUsageData={mdfUsageData}
              ldfUsageData={ldfUsageData}
            />

            <InstanceMetricHeatmap items={items} />
          </div>
        )}
      </div>
    </main>
  );
};

/** 통합 현황_v2 전용 래퍼입니다. */
export const DashboardBiV2Client = () => <DashboardBiClient variant="v2" />;

type BiChartGridProps = {
  variant: DashboardBiVariant;
  resourceBarData: Array<{ name: string; cpu: number; memory: number }>;
  ioBarData: Array<{ name: string; readLatency: number; writeLatency: number }>;
  throughputBarData: Array<{ name: string; qps: number; tps: number }>;
  sessionByInstanceData: Array<{ name: string; active: number; idle: number }>;
  mdfUsageData: Array<{ name: string; mdfGb: number }>;
  ldfUsageData: Array<{ name: string; ldfGb: number }>;
};

/** v1·v2 차트 그리드 배치를 렌더링합니다. */
const BiChartGrid = ({
  variant,
  resourceBarData,
  ioBarData,
  throughputBarData,
  sessionByInstanceData,
  mdfUsageData,
  ldfUsageData,
}: BiChartGridProps) => {
  if (variant === "v2") {
    return (
      <>
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartPanel
            title="CPU 사용률"
            description="인스턴스별 현재 CPU 부하(%)"
            tooltipKey={SERVER_METRIC_KEYS.cpuUsedPercent}
            icon={<Activity className="size-4" />}
          >
            <InstanceMetricBarChart
              data={resourceBarData}
              dataKey="cpu"
              config={cpuOnlyBarConfig}
              yDomain={[0, 100]}
            />
          </ChartPanel>

          <ChartPanel
            title="메모리 사용률"
            description="인스턴스별 현재 메모리 사용률(%)"
            tooltipKey={SERVER_METRIC_KEYS.memoryUsedPercent}
            icon={<MemoryStick className="size-4" />}
          >
            <InstanceMetricBarChart
              data={resourceBarData}
              dataKey="memory"
              config={memoryOnlyBarConfig}
              yDomain={[0, 100]}
            />
          </ChartPanel>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartPanel
            title="QPS"
            description="인스턴스별 초당 배치 요청 수"
            tooltipKey={SERVER_METRIC_KEYS.batchRequestsPerSec}
            icon={<Activity className="size-4" />}
          >
            <InstanceMetricBarChart
              data={throughputBarData}
              dataKey="qps"
              config={qpsOnlyBarConfig}
            />
          </ChartPanel>

          <ChartPanel
            title="TPS"
            description="인스턴스별 초당 트랜잭션 수"
            tooltipKey={SERVER_METRIC_KEYS.transactionsPerSec}
            icon={<Activity className="size-4" />}
          >
            <InstanceMetricBarChart
              data={throughputBarData}
              dataKey="tps"
              config={tpsOnlyBarConfig}
            />
          </ChartPanel>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartPanel
            title="인스턴스별 세션"
            description="DB 인스턴스별 전체 세션 대비 활성 세션(누적 세로 막대)"
            tooltipKey={BI_CHART_TOOLTIP_KEYS.sessionsByInstance}
            icon={<Users className="size-4" />}
          >
            <SessionStackBarChart data={sessionByInstanceData} />
          </ChartPanel>

          <ChartPanel
            title="디스크 I/O 지연"
            description="읽기·쓰기 평균 지연(ms)"
            tooltipKey={BI_CHART_TOOLTIP_KEYS.diskIo}
            icon={<BarChart3 className="size-4" />}
          >
            <ChartContainer config={ioBarConfig} className={cn("w-full", BI_CHART_HEIGHT)}>
              <BarChart
                data={ioBarData}
                margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis {...instanceNameXAxisProps} />
                <YAxis tickLine={false} axisLine={false} width={36} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="readLatency"
                  fill={CHART_SERIES.readLatency}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="writeLatency"
                  fill={CHART_SERIES.writeLatency}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </ChartPanel>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartPanel
            title="데이터파일 크기"
            description="데이터파일(MDF) 실사용 용량(GB) — 인스턴스명 순"
            tooltipKey={BI_CHART_TOOLTIP_KEYS.mdfUsage}
            icon={<HardDrive className="size-4" />}
          >
            <UsageTopBarChart
              data={mdfUsageData}
              dataKey="mdfGb"
              config={{
                mdfGb: { label: "MDF (GB)", color: "var(--chart-1)" },
              }}
              emptyMessage="데이터파일 크기 데이터가 없습니다"
            />
          </ChartPanel>

          <ChartPanel
            title="로그파일 크기"
            description="트랜잭션 로그(LDF) 실사용 용량(GB) — 인스턴스명 순"
            tooltipKey={BI_CHART_TOOLTIP_KEYS.ldfUsage}
            icon={<HardDrive className="size-4" />}
          >
            <UsageTopBarChart
              data={ldfUsageData}
              dataKey="ldfGb"
              config={{
                ldfGb: { label: "LDF (GB)", color: "var(--chart-4)" },
              }}
              emptyMessage="로그파일 크기 데이터가 없습니다"
            />
          </ChartPanel>
        </div>
      </>
    );
  }

  return (
    <>
            <div className="grid gap-3 lg:grid-cols-2">
              <ChartPanel
                title="MDF 사용량"
                description="데이터파일(MDF) 실사용 용량(GB) — 인스턴스명 순"
                tooltipKey={BI_CHART_TOOLTIP_KEYS.mdfUsage}
                icon={<HardDrive className="size-4" />}
              >
                <UsageTopBarChart
                  data={mdfUsageData}
                  dataKey="mdfGb"
                  config={{
                    mdfGb: { label: "MDF (GB)", color: "var(--chart-1)" },
                  }}
                  emptyMessage="MDF 사용량 데이터가 없습니다"
                />
              </ChartPanel>

              <ChartPanel
                title="LDF 사용량"
                description="트랜잭션 로그(LDF) 실사용 용량(GB) — 인스턴스명 순"
                tooltipKey={BI_CHART_TOOLTIP_KEYS.ldfUsage}
                icon={<HardDrive className="size-4" />}
              >
                <UsageTopBarChart
                  data={ldfUsageData}
                  dataKey="ldfGb"
                  config={{
                    ldfGb: { label: "LDF (GB)", color: "var(--chart-4)" },
                  }}
                  emptyMessage="LDF 사용량 데이터가 없습니다"
                />
              </ChartPanel>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <ChartPanel
                title="CPU · 메모리 사용률"
                description="인스턴스별 현재 부하(%)"
                tooltipKey={BI_CHART_TOOLTIP_KEYS.cpuMemory}
                icon={<MemoryStick className="size-4" />}
              >
                <ChartContainer
                  config={resourceBarConfig}
                  className={cn("w-full", BI_CHART_HEIGHT)}
                >
                  <BarChart
                    data={resourceBarData}
                    margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis {...instanceNameXAxisProps} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="cpu" fill={CHART_SERIES.cpu} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="memory" fill={CHART_SERIES.memory} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>

              <ChartPanel
                title="디스크 I/O 지연"
                description="읽기·쓰기 평균 지연(ms)"
                tooltipKey={BI_CHART_TOOLTIP_KEYS.diskIo}
                icon={<BarChart3 className="size-4" />}
              >
                <ChartContainer config={ioBarConfig} className={cn("w-full", BI_CHART_HEIGHT)}>
                  <BarChart
                    data={ioBarData}
                    margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis {...instanceNameXAxisProps} />
                    <YAxis tickLine={false} axisLine={false} width={36} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="readLatency" fill={CHART_SERIES.readLatency} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="writeLatency" fill={CHART_SERIES.writeLatency} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <ChartPanel
                title="QPS · TPS"
                description="초당 배치 요청(QPS)과 트랜잭션(TPS)"
                tooltipKey={BI_CHART_TOOLTIP_KEYS.qpsTps}
                icon={<Activity className="size-4" />}
              >
                <ChartContainer
                  config={throughputBarConfig}
                  className={cn("w-full", BI_CHART_HEIGHT)}
                >
                  <BarChart
                    data={throughputBarData}
                    margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis {...instanceNameXAxisProps} />
                    <YAxis tickLine={false} axisLine={false} width={40} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="qps" fill={CHART_SERIES.qps} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="tps" fill={CHART_SERIES.tps} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>

              <ChartPanel
                title="인스턴스별 세션"
                description="DB 인스턴스별 전체 세션 대비 활성 세션(누적 세로 막대)"
                tooltipKey={BI_CHART_TOOLTIP_KEYS.sessionsByInstance}
                icon={<Users className="size-4" />}
              >
                <SessionStackBarChart data={sessionByInstanceData} />
              </ChartPanel>
            </div>
    </>
  );
};

type InstanceMetricBarChartProps = {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  config: ChartConfig;
  yDomain?: [number, number];
};

/** 인스턴스별 단일 지표 세로 막대 차트입니다. */
const InstanceMetricBarChart = ({
  data,
  dataKey,
  config,
  yDomain,
}: InstanceMetricBarChartProps) => (
  <ChartContainer config={config} className={cn("w-full", BI_CHART_HEIGHT)}>
    <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
      <CartesianGrid vertical={false} />
      <XAxis {...instanceNameXAxisProps} />
      <YAxis
        domain={yDomain}
        tickLine={false}
        axisLine={false}
        width={yDomain ? 32 : 40}
      />
      <ChartTooltip content={<ChartTooltipContent />} />
      <ChartLegend content={<ChartLegendContent />} />
      <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={[4, 4, 0, 0]} />
    </BarChart>
  </ChartContainer>
);

type SessionStackBarChartProps = {
  data: Array<{ name: string; active: number; idle: number }>;
};

/** 인스턴스별 활성·비활성 세션 누적 막대 차트입니다. */
const SessionStackBarChart = ({ data }: SessionStackBarChartProps) => {
  if (data.length === 0) {
    return (
      <p
        className={cn(
          "text-muted-foreground flex items-center justify-center text-sm",
          BI_CHART_HEIGHT,
        )}
      >
        세션 데이터가 없습니다
      </p>
    );
  }

  return (
    <ChartContainer config={sessionStackConfig} className={cn("w-full", BI_CHART_HEIGHT)}>
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis {...instanceNameXAxisProps} />
        <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="idle"
          stackId="sessions"
          fill={CHART_SERIES.sessionIdle}
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="active"
          stackId="sessions"
          fill={CHART_SERIES.sessionActive}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
};

type UsageTopBarChartProps = {
  data: Array<{ name: string; mdfGb?: number; ldfGb?: number }>;
  dataKey: "mdfGb" | "ldfGb";
  config: ChartConfig;
  emptyMessage?: string;
};

/** MDF/LDF 사용량(GB) Top N 세로 막대 차트입니다. */
const UsageTopBarChart = ({
  data,
  dataKey,
  config,
  emptyMessage = "표시할 데이터가 없습니다",
}: UsageTopBarChartProps) => {
  if (data.length === 0) {
    return (
      <p
        className={cn(
          "text-muted-foreground flex items-center justify-center text-sm",
          BI_CHART_HEIGHT,
        )}
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <ChartContainer config={config} className={cn("w-full", BI_CHART_HEIGHT)}>
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis {...instanceNameXAxisProps} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(value) => formatStorageGb(Number(value))}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatStorageGb(Number(value))}
            />
          }
        />
        <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
};

type ChartPanelProps = {
  title: string;
  description: string;
  tooltipKey: BiChartTooltipKey | keyof ResourceSummary | string;
  icon: ReactNode;
  children: ReactNode;
};

/** BI 차트를 감싸는 공통 패널 카드입니다. */
const ChartPanel = ({ title, description, tooltipKey, icon, children }: ChartPanelProps) => (
  <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">
            <MetricInfoTooltip tooltipKey={tooltipKey}>{title}</MetricInfoTooltip>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);
