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
import { cn } from "@/lib/utils";
import type { MetricHistoryRecord } from "@/services/storage/types";
import type { DbInstance } from "@/types/entities";
import type { DbmsType } from "@/types/domain";

/** DBMS 유형별 좌측 강조 색으로 인스턴스 카드를 구분합니다. */
const dbmsAccentClass: Record<DbmsType, string> = {
  MSSQL: "border-l-sky-500",
  ORACLE: "border-l-amber-500",
  AZURE_SQL: "border-l-violet-500",
};

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
  <Card
    className={cn(
      "border border-border bg-card shadow-md",
      "border-l-4",
      dbmsAccentClass[instance.dbmsType],
      collectStatus === "FAIL" &&
        "border-destructive/50 ring-1 ring-destructive/25",
    )}
  >
    <CardHeader
      data-dbms={instance.dbmsType}
      className="instance-card-header border-b-0 pb-3"
    >
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
