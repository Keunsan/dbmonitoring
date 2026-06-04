/** 대시보드용 CPU·메모리·디스크·로그 사용률 Top N 목록을 표시합니다. */

import { MetricInfoTooltip } from "@/components/features/monitoring/MetricInfoTooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  TOP_LIST_TOOLTIP_KEYS,
  type TopListTooltipKey,
} from "@/lib/monitoring/metric-tooltips";
import type { ResourceSummary } from "@/lib/monitoring/resource-summary";
import type { DbInstance } from "@/types/entities";

export type ResourceSummaryItem = {
  instance: DbInstance;
  resourceSummary: ResourceSummary;
};

type TopListProps = {
  title: string;
  description: string;
  tooltipKey: TopListTooltipKey;
  items: ResourceSummaryItem[];
  pickValue: (resource: ResourceSummary) => number | null;
  unit?: string;
  higherIsWorse?: boolean;
};

const formatValue = (value: number | null, unit = "%") => {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }
  return `${Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)}${unit}`;
};

const TopList = ({
  title,
  description,
  tooltipKey,
  items,
  pickValue,
  unit = "%",
  higherIsWorse = true,
}: TopListProps) => {
  const ranked = items
    .map((item) => ({
      ...item,
      value: pickValue(item.resourceSummary),
    }))
    .filter((item) => item.value !== null)
    .sort((a, b) => {
      const av = a.value ?? 0;
      const bv = b.value ?? 0;
      return higherIsWorse ? bv - av : av - bv;
    })
    .slice(0, 5);

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="monitoring-panel-header rounded-t-xl pb-1.5">
        <CardTitle className="text-base">
          <MetricInfoTooltip tooltipKey={tooltipKey}>{title}</MetricInfoTooltip>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {ranked.length === 0 ? (
          <p className="text-muted-foreground text-sm">표시할 데이터가 없습니다.</p>
        ) : (
          ranked.map((item) => (
            <div key={item.instance.id} className="space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.instance.instanceName}</span>
                <span className="text-muted-foreground">
                  {formatValue(item.value, unit)}
                </span>
              </div>
              {unit === "%" && item.value !== null ? (
                <Progress value={Math.min(100, item.value)} className="h-1.5" />
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

type ResourceTopListsProps = {
  items: ResourceSummaryItem[];
};

/**
 * 전체 DB 서버의 리소스 사용률 Top 목록을 4열 그리드로 보여줍니다.
 */
export const ResourceTopLists = ({ items }: ResourceTopListsProps) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <TopList
      title="CPU Top"
      description="CPU 사용률이 높은 DB"
      tooltipKey={TOP_LIST_TOOLTIP_KEYS.cpu}
      items={items}
      pickValue={(r) => r.cpuUsedPercent}
    />
    <TopList
      title="Memory Top"
      description="메모리 사용률이 높은 DB"
      tooltipKey={TOP_LIST_TOOLTIP_KEYS.memory}
      items={items}
      pickValue={(r) => r.memoryUsedPercent}
    />
    <TopList
      title="Disk Latency Top"
      description="디스크 읽기 지연이 큰 DB"
      tooltipKey={TOP_LIST_TOOLTIP_KEYS.diskLatency}
      items={items}
      pickValue={(r) => r.diskReadLatencyMs}
      unit=" ms"
    />
    <TopList
      title="Log 사용률 Top"
      description="트랜잭션 로그 사용률이 높은 DB"
      tooltipKey={TOP_LIST_TOOLTIP_KEYS.log}
      items={items}
      pickValue={(r) => r.logUsedPercent}
    />
  </div>
);
