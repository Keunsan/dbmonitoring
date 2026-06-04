"use client";

/** 서버 리소스 지표의 최근 추이를 그룹별 멀티 라인 차트로 표시합니다. */

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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
import { SERVER_METRIC_KEYS } from "@/lib/monitoring/metric-keys";
import type { ApiResponse } from "@/types/api";

type MetricHistoryItem = {
  metricTime: string;
  metricValue: number;
};

type TrendMetricSeries = {
  key: string;
  dataKey: string;
};

type TrendChartGroup = {
  id: string;
  title: string;
  metrics: TrendMetricSeries[];
  config: ChartConfig;
  yDomain?: [number, number];
};

type ResourceTrendChartProps = {
  dbInstanceId: string;
  title?: string;
};

const formatTrendTime = (metricTime: string) =>
  new Date(metricTime).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const cpuMemoryConfig = {
  cpu: { label: "CPU %", color: "var(--chart-1)" },
  memory: { label: "메모리 %", color: "var(--chart-2)" },
} satisfies ChartConfig;

const qpsTpsConfig = {
  qps: { label: "QPS", color: "var(--chart-3)" },
  tps: { label: "TPS", color: "var(--chart-4)" },
} satisfies ChartConfig;

const trendChartGroups: TrendChartGroup[] = [
  {
    id: "cpu-memory",
    title: "CPU · 메모리",
    metrics: [
      { key: SERVER_METRIC_KEYS.cpuUsedPercent, dataKey: "cpu" },
      { key: SERVER_METRIC_KEYS.memoryUsedPercent, dataKey: "memory" },
    ],
    config: cpuMemoryConfig,
    yDomain: [0, 100],
  },
  {
    id: "qps-tps",
    title: "QPS · TPS",
    metrics: [
      { key: SERVER_METRIC_KEYS.batchRequestsPerSec, dataKey: "qps" },
      { key: SERVER_METRIC_KEYS.transactionsPerSec, dataKey: "tps" },
    ],
    config: qpsTpsConfig,
  },
];

const allTrendMetricKeys = trendChartGroups.flatMap((group) =>
  group.metrics.map((metric) => metric.key),
);

const fetchMetricHistory = async (url: string) => {
  const response = await fetch(url);
  const payload = (await response.json()) as ApiResponse<{ items: MetricHistoryItem[] }>;
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "지표 이력을 불러오지 못했습니다.");
  }
  return payload.data?.items ?? [];
};

/** 동일 시각 기준으로 여러 지표 시계열을 하나의 차트 데이터로 병합합니다. */
const buildMergedChartData = (
  seriesMap: Record<string, MetricHistoryItem[]>,
  metrics: TrendMetricSeries[],
) => {
  const timeMap = new Map<string, Record<string, string | number>>();

  for (const { key, dataKey } of metrics) {
    for (const item of seriesMap[key] ?? []) {
      const row = timeMap.get(item.metricTime) ?? {
        time: formatTrendTime(item.metricTime),
      };
      row[dataKey] = item.metricValue;
      timeMap.set(item.metricTime, row);
    }
  }

  return [...timeMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row);
};

/**
 * 선택 DB의 주요 리소스 지표 추이 차트를 렌더링합니다.
 */
export const ResourceTrendChart = ({
  dbInstanceId,
  title = "리소스 추이",
}: ResourceTrendChartProps) => {
  const [seriesMap, setSeriesMap] = useState<Record<string, MetricHistoryItem[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const entries = await Promise.all(
          allTrendMetricKeys.map(async (metricKey) => {
            const items = await fetchMetricHistory(
              `/api/monitoring/metrics?dbInstanceId=${encodeURIComponent(dbInstanceId)}&metricName=${encodeURIComponent(metricKey)}&limit=30`,
            );
            return [metricKey, items] as const;
          }),
        );
        if (!cancelled) {
          setSeriesMap(Object.fromEntries(entries));
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setSeriesMap({});
          setError(
            loadError instanceof Error
              ? loadError.message
              : "추이 데이터를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    setLoading(true);
    setSeriesMap({});
    setError(null);
    void load();
    const intervalId = window.setInterval(() => void load(), 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dbInstanceId]);

  const chartGroups = useMemo(
    () =>
      trendChartGroups.map((group) => ({
        ...group,
        chartData: buildMergedChartData(seriesMap, group.metrics),
      })),
    [seriesMap],
  );

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {chartGroups.map((group) => {
        const chartKey = `${dbInstanceId}-${group.id}-${group.chartData.length}-${group.chartData.at(-1)?.time ?? "empty"}`;

        return (
          <Card key={`${dbInstanceId}-${group.id}`}>
            <CardHeader className="pb-1.5">
              <CardTitle className="text-base">{group.title}</CardTitle>
              <CardDescription>{title}</CardDescription>
            </CardHeader>
            <CardContent>
              {error ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : loading ? (
                <p className="text-muted-foreground text-sm">추이 데이터를 불러오는 중입니다.</p>
              ) : group.chartData.length === 0 ? (
                <p className="text-muted-foreground text-sm">추이 데이터가 없습니다.</p>
              ) : (
                <ChartContainer config={group.config} className="h-[160px] w-full">
                  <LineChart
                    key={chartKey}
                    data={group.chartData}
                    margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="time" tickLine={false} axisLine={false} hide />
                    <YAxis
                      domain={group.yDomain}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {group.metrics.map((metric) => (
                      <Line
                        key={metric.dataKey}
                        type="monotone"
                        dataKey={metric.dataKey}
                        stroke={`var(--color-${metric.dataKey})`}
                        strokeWidth={2.5}
                        dot={{ r: 2, strokeWidth: 1 }}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
