/** DB 인스턴스별 서버 리소스 요약 카드를 표시합니다. */

import { ResourceOverviewCards } from "@/components/features/monitoring/ResourceOverviewCards";
import { StatusBadge } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ResourceSummary } from "@/lib/monitoring/resource-summary";
import type { MetricHistoryRecord } from "@/services/storage/types";
import type { DbInstance } from "@/types/entities";
type DbResourceCardProps = {
  instance: DbInstance;
  resourceSummary: ResourceSummary;
  latestMetrics: MetricHistoryRecord[];
  collectStatus: "OK" | "FAIL" | "DELAYED" | null;
};

/**
 * 대시보드 DB 목록에서 인스턴스별 리소스 상태를 카드로 렌더링합니다.
 */
export const DbResourceCard = ({
  instance,
  resourceSummary,
  latestMetrics,
  collectStatus,
}: DbResourceCardProps) => (
  <Card className="border border-border shadow-sm">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{instance.instanceName}</CardTitle>
          <CardDescription className="font-mono text-xs">
            {instance.dbmsType} / {instance.databaseName ?? "-"}
          </CardDescription>
        </div>
        {collectStatus ? <StatusBadge kind="collect" value={collectStatus} /> : null}
      </div>
    </CardHeader>
    <CardContent className="bg-card pt-3">
      <ResourceOverviewCards
        resource={resourceSummary}
        latestMetrics={latestMetrics}
        compact
      />
    </CardContent>
  </Card>
);
