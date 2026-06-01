"use client";

/** BI·차트 중심 통합 현황 대시보드(v1) — 리소스·용량 사용률 비교에 초점을 둡니다. */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, BarChart3, HardDrive, MemoryStick, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/shared";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
import type { MetricHistoryRecord } from "@/services/storage/types";
import type { ApiResponse } from "@/types/api";
import type { BusinessSystem, DbInstance } from "@/types/entities";
import { cn } from "@/lib/utils";

/** 다중 시리즈 차트에서 구분이 잘 되도록 고정 대비 색상을 사용합니다. */
const CHART_SERIES = {
  cpu: "oklch(0.78 0.17 195)",
  memory: "oklch(0.82 0.17 55)",
  qps: "oklch(0.72 0.2 285)",
  tps: "oklch(0.76 0.19 145)",
  readLatency: "oklch(0.78 0.17 195)",
  writeLatency: "oklch(0.82 0.17 55)",
  sessionIdle: "oklch(0.32 0.025 285)",
  sessionActive: "oklch(0.76 0.19 145)",
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

const truncateLabel = (name: string, max = 14) =>
  name.length > max ? `${name.slice(0, max)}…` : name;

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

const sessionStackConfig = {
  idle: { label: "비활성·기타", color: CHART_SERIES.sessionIdle },
  active: { label: "활성 세션", color: CHART_SERIES.sessionActive },
} satisfies ChartConfig;

const HEATMAP_METRICS: Array<{
  key: keyof ResourceSummary;
  label: string;
  unit: string;
}> = [
  { key: "cpuUsedPercent", label: "CPU", unit: "%" },
  { key: "memoryUsedPercent", label: "메모리", unit: "%" },
  { key: "diskReadLatencyMs", label: "디스크 읽기", unit: "ms" },
  { key: "logUsedPercent", label: "로그", unit: "%" },
  { key: "batchRequestsPerSec", label: "QPS", unit: "" },
  { key: "processesBlocked", label: "Blocked", unit: "" },
  { key: "sessionActiveCount", label: "활성 세션", unit: "" },
];

const heatColorClass = (health: ReturnType<typeof getResourceHealth>) => {
  switch (health) {
    case "warning":
      return "bg-destructive/35 text-destructive-foreground";
    case "caution":
      return "bg-amber-500/30 text-amber-100";
    case "normal":
      return "bg-primary/25 text-foreground";
    default:
      return "bg-muted/40 text-muted-foreground";
  }
};

/**
 * DB 리소스 BI 대시보드(v1)를 렌더링합니다.
 */
export const DashboardBiClient = () => {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [businessSystems, setBusinessSystems] = useState<BusinessSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [summaryPayload, systems] = await Promise.all([
      requestJson<{ items: SummaryItem[] }>("/api/monitoring/summary"),
      requestJson<BusinessSystem[]>("/api/business-systems"),
    ]);
    setItems(summaryPayload.items);
    setBusinessSystems(systems);
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

  const runCollector = async () => {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      await requestJson("/api/collector/run", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await requestJson("/api/alerts/evaluate", { method: "POST" });
      await refresh();
      setMessage("Collector 실행과 임계치 평가가 완료되었습니다.");
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Collector 실행에 실패했습니다.",
      );
    } finally {
      setRunning(false);
    }
  };

  const mdfUsageData = useMemo(
    () =>
      [...items]
        .map((item) => {
          const capacity = extractInstanceStorageCapacity(
            item.summary.latestMetrics,
            item.summary.resourceSummary,
          );
          const mdfGb = mbToGb(capacity.mdfUsedMb);
          return {
            name: truncateLabel(item.instance.instanceName, 10),
            mdfGb,
          };
        })
        .filter((row): row is { name: string; mdfGb: number } => row.mdfGb !== null)
        .sort((a, b) => b.mdfGb - a.mdfGb)
        .slice(0, 10),
    [items],
  );

  const ldfUsageData = useMemo(
    () =>
      [...items]
        .map((item) => {
          const capacity = extractInstanceStorageCapacity(
            item.summary.latestMetrics,
            item.summary.resourceSummary,
          );
          const ldfGb = mbToGb(capacity.ldfUsedMb);
          return {
            name: truncateLabel(item.instance.instanceName, 10),
            ldfGb,
          };
        })
        .filter((row): row is { name: string; ldfGb: number } => row.ldfGb !== null)
        .sort((a, b) => b.ldfGb - a.ldfGb)
        .slice(0, 10),
    [items],
  );

  const resourceBarData = useMemo(
    () =>
      items.map((item) => ({
        name: truncateLabel(item.instance.instanceName),
        cpu: item.summary.resourceSummary.cpuUsedPercent ?? 0,
        memory: item.summary.resourceSummary.memoryUsedPercent ?? 0,
      })),
    [items],
  );

  const ioBarData = useMemo(
    () =>
      items.map((item) => ({
        name: truncateLabel(item.instance.instanceName),
        readLatency: item.summary.resourceSummary.diskReadLatencyMs ?? 0,
        writeLatency: item.summary.resourceSummary.diskWriteLatencyMs ?? 0,
      })),
    [items],
  );

  const throughputBarData = useMemo(
    () =>
      items.map((item) => ({
        name: truncateLabel(item.instance.instanceName),
        qps: item.summary.resourceSummary.batchRequestsPerSec ?? 0,
        tps: item.summary.resourceSummary.transactionsPerSec ?? 0,
      })),
    [items],
  );

  const sessionBySystemData = useMemo(() => {
    const systemNameById = new Map(businessSystems.map((system) => [system.id, system.name]));
    const aggregated = new Map<
      string,
      { name: string; active: number; idle: number }
    >();

    for (const item of items) {
      const systemId = item.instance.businessSystemId;
      const systemName = systemNameById.get(systemId) ?? "미지정 업무";
      const total = item.summary.resourceSummary.sessionTotalCount ?? 0;
      const active = item.summary.resourceSummary.sessionActiveCount ?? 0;
      const current = aggregated.get(systemId) ?? {
        name: systemName,
        active: 0,
        idle: 0,
      };
      current.active += active;
      current.idle += Math.max(0, total - active);
      aggregated.set(systemId, current);
    }

    return [...aggregated.values()]
      .map((entry) => ({
        name: truncateLabel(entry.name, 12),
        active: entry.active,
        idle: entry.idle,
      }))
      .sort((a, b) => b.active + b.idle - (a.active + a.idle));
  }, [businessSystems, items]);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="통합 현황_v1"
        description="MDF/LDF 사용량(GB), CPU·메모리·I/O·처리량·세션을 차트와 히트맵으로 비교합니다."
        actions={
          <Button onClick={() => void runCollector()} disabled={running}>
            {running ? "수집 중" : "실시간 수집 실행"}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {message ? (
          <Alert className="border-primary/30 bg-primary/10 text-foreground">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
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
            <div className="grid gap-3 lg:grid-cols-3">
              <ChartPanel
                title="MDF 사용량 Top"
                description="데이터파일(MDF) 실사용 용량(GB) — 상위 10개 인스턴스"
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
                title="LDF 사용량 Top"
                description="트랜잭션 로그(LDF) 실사용 용량(GB) — 상위 10개 인스턴스"
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

              <ChartPanel
                title="CPU · 메모리 사용률"
                description="인스턴스별 현재 부하(%)"
                icon={<MemoryStick className="size-4" />}
              >
                <ChartContainer config={resourceBarConfig} className="h-[220px] w-full">
                  <BarChart data={resourceBarData} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="cpu" fill={CHART_SERIES.cpu} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="memory" fill={CHART_SERIES.memory} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <ChartPanel
                title="디스크 I/O 지연"
                description="읽기·쓰기 평균 지연(ms)"
                icon={<BarChart3 className="size-4" />}
              >
                <ChartContainer config={ioBarConfig} className="h-[220px] w-full">
                  <BarChart data={ioBarData} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis tickLine={false} axisLine={false} width={36} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="readLatency" fill={CHART_SERIES.readLatency} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="writeLatency" fill={CHART_SERIES.writeLatency} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>

              <ChartPanel
                title="QPS · TPS"
                description="초당 배치 요청(QPS)과 트랜잭션(TPS)"
                icon={<Activity className="size-4" />}
              >
                <ChartContainer config={throughputBarConfig} className="h-[220px] w-full">
                  <BarChart data={throughputBarData} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis tickLine={false} axisLine={false} width={40} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="qps" fill={CHART_SERIES.qps} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="tps" fill={CHART_SERIES.tps} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>

              <ChartPanel
                title="업무 시스템별 세션"
                description="전체 세션 대비 활성 세션(누적 가로 막대)"
                icon={<Users className="size-4" />}
              >
                {sessionBySystemData.length === 0 ? (
                  <p className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
                    세션 데이터가 없습니다
                  </p>
                ) : (
                  <ChartContainer config={sessionStackConfig} className="h-[220px] w-full">
                    <BarChart
                      data={sessionBySystemData}
                      layout="vertical"
                      margin={{ left: 4, right: 12 }}
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        width={88}
                      />
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
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartPanel>
            </div>

            <Card className="border-border/60 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">인스턴스 × 지표 히트맵</CardTitle>
                <CardDescription>
                  색이 진할수록 주의·경고 수준입니다. 셀 위에 마우스를 올리면 상세 값을 확인할 수
                  있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left font-mono text-xs text-muted-foreground">
                        DB 인스턴스
                      </th>
                      {HEATMAP_METRICS.map((metric) => (
                        <th
                          key={metric.key}
                          className="px-2 py-2 text-center font-mono text-xs text-muted-foreground"
                        >
                          {metric.label}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-center text-xs text-muted-foreground">
                        수집
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
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
                        {HEATMAP_METRICS.map((metric) => {
                          const value = item.summary.resourceSummary[metric.key];
                          const health = getResourceHealth(metric.key, value);
                          const display =
                            value === null
                              ? "-"
                              : `${formatNumber(value)}${metric.unit}`;

                          return (
                            <td key={metric.key} className="p-1">
                              <div
                                title={`${metric.label}: ${display}`}
                                className={cn(
                                  "flex min-h-10 items-center justify-center rounded-md px-1 font-mono text-xs tabular-nums",
                                  heatColorClass(health),
                                )}
                              >
                                {display}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-1 text-center">
                          {item.summary.lastRun?.status ? (
                            <StatusBadge
                              kind="collect"
                              value={item.summary.lastRun.status}
                              className="mx-auto border-primary/20 bg-primary/10 text-foreground"
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
          </div>
        )}
      </div>
    </main>
  );
};

type UsageTopBarChartProps = {
  data: Array<{ name: string; mdfGb?: number; ldfGb?: number }>;
  dataKey: "mdfGb" | "ldfGb";
  config: ChartConfig;
  emptyMessage?: string;
};

/** MDF/LDF 사용량(GB) Top N 가로 막대 차트입니다. */
const UsageTopBarChart = ({
  data,
  dataKey,
  config,
  emptyMessage = "표시할 데이터가 없습니다",
}: UsageTopBarChartProps) => {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12 }}>
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatStorageGb(Number(value))}
        />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatStorageGb(Number(value))}
            />
          }
        />
        <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
};

type ChartPanelProps = {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
};

/** BI 차트를 감싸는 공통 패널 카드입니다. */
const ChartPanel = ({ title, description, icon, children }: ChartPanelProps) => (
  <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);
