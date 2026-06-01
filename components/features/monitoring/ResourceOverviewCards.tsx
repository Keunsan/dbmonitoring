/** CPU·메모리·디스크·로그·Temp 리소스 요약 카드를 표시합니다. */

import { MetricInfoTooltip } from "@/components/features/monitoring/MetricInfoTooltip";
import { MetricHealthBadge } from "@/components/features/monitoring/MetricHealthBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ResourceSummary } from "@/lib/monitoring/resource-summary";
import {
  computeDbTotalSizeGb,
  formatDbSizeGbOneDecimal,
} from "@/lib/monitoring/storage-capacity";
import type { MetricHistoryRecord } from "@/services/storage/types";

type ResourceOverviewCardsProps = {
  title?: string;
  resource: ResourceSummary;
  compact?: boolean;
  /** 통합 현황 DB 카드용 MDF+LDF 합계 계산에 사용합니다. */
  latestMetrics?: MetricHistoryRecord[];
};

const formatValue = (value: number | null, suffix = "") => {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }
  return `${Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
};

const ResourceCard = ({
  label,
  value,
  unit,
  percent,
  metricKey,
}: {
  label: string;
  value: number | null;
  unit: string;
  percent?: number | null;
  metricKey: keyof ResourceSummary;
}) => (
  <Card>
    <CardHeader className="pb-1.5">
      <div className="flex items-center justify-between gap-2">
        <CardDescription>
          <MetricInfoTooltip tooltipKey={metricKey}>{label}</MetricInfoTooltip>
        </CardDescription>
        <MetricHealthBadge metricKey={metricKey} value={value} />
      </div>
      <CardTitle className="text-xl">
        {formatValue(value, unit)}
      </CardTitle>
    </CardHeader>
    {percent !== undefined && percent !== null ? (
      <CardContent>
        <Progress value={Math.min(100, Math.max(0, percent))} className="h-2" />
      </CardContent>
    ) : null}
  </Card>
);

const SessionStatusCard = ({
  activeCount,
  totalCount,
}: {
  activeCount: number | null;
  totalCount: number | null;
}) => {
  const displayValue =
    activeCount !== null && totalCount !== null
      ? `${formatValue(activeCount, "")} / ${formatValue(totalCount, "")}`
      : "-";

  return (
    <Card>
      <CardHeader className="pb-1.5">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>
            <MetricInfoTooltip tooltipKey="summary.session.user_active_total">
              세션현황
            </MetricInfoTooltip>
          </CardDescription>
          <MetricHealthBadge metricKey="sessionActiveCount" value={activeCount} />
        </div>
        <CardTitle className="text-xl">{displayValue}</CardTitle>
        <p className="text-xs text-muted-foreground">활성 / 전체 (사용자 세션)</p>
      </CardHeader>
    </Card>
  );
};

const DbSizeCard = ({ dbSizeGb }: { dbSizeGb: number | null }) => (
  <Card>
    <CardHeader className="pb-1.5">
      <div className="flex items-center justify-between gap-2">
        <CardDescription>
          <MetricInfoTooltip tooltipKey="summary.db.total_size_gb">DB 크기</MetricInfoTooltip>
        </CardDescription>
      </div>
      <CardTitle className="text-xl">{formatDbSizeGbOneDecimal(dbSizeGb)}</CardTitle>
      <p className="text-xs text-muted-foreground">MDF + LDF 할당 합계</p>
    </CardHeader>
  </Card>
);

/**
 * 서버 리소스 핵심 지표를 카드 그리드로 보여줍니다.
 */
export const ResourceOverviewCards = ({
  title,
  resource,
  compact = false,
  latestMetrics = [],
}: ResourceOverviewCardsProps) => {
  const dbSizeGb = compact ? computeDbTotalSizeGb(latestMetrics, resource) : null;

  return (
    <section className="space-y-2">
      {title ? <h3 className="text-sm font-medium text-muted-foreground">{title}</h3> : null}
      <div
        className={
          compact
            ? "grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
            : "grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
        }
      >
        <ResourceCard
          label="CPU 사용률"
          value={resource.cpuUsedPercent}
          unit="%"
          percent={resource.cpuUsedPercent}
          metricKey="cpuUsedPercent"
        />
        <ResourceCard
          label="메모리 사용률"
          value={resource.memoryUsedPercent}
          unit="%"
          percent={resource.memoryUsedPercent}
          metricKey="memoryUsedPercent"
        />
        <ResourceCard
          label="디스크 읽기 지연"
          value={resource.diskReadLatencyMs}
          unit=" ms"
          metricKey="diskReadLatencyMs"
        />
        {compact ? (
          <>
            <DbSizeCard dbSizeGb={dbSizeGb} />
            <SessionStatusCard
              activeCount={resource.sessionActiveCount}
              totalCount={resource.sessionTotalCount}
            />
          </>
        ) : (
          <>
            <ResourceCard
              label="로그 사용률"
              value={resource.logUsedPercent}
              unit="%"
              percent={resource.logUsedPercent}
              metricKey="logUsedPercent"
            />
            <ResourceCard
              label="TempDB 사용"
              value={resource.tempdbUsedMb}
              unit=" MB"
              metricKey="tempdbUsedMb"
            />
          </>
        )}
      </div>
    </section>
  );
};
