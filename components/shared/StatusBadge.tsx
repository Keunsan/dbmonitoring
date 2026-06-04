/** DB·수집 상태를 표시하는 공통 배지 컴포넌트입니다. */

import { Badge } from "@/components/ui/badge";
import type { CollectStatus, DbHealth } from "@/types/domain";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  kind: "health" | "collect" | "connection";
  value: DbHealth | CollectStatus;
  className?: string;
};

const HEALTH_LABELS: Record<DbHealth, string> = {
  NORMAL: "정상",
  CAUTION: "주의",
  WARNING: "경고",
  OUTAGE: "장애",
};

const COLLECT_LABELS: Record<CollectStatus, string> = {
  OK: "수집 정상",
  FAIL: "수집 실패",
  DELAYED: "수집 지연",
};

const CONNECTION_LABELS: Record<CollectStatus, string> = {
  OK: "연결 정상",
  FAIL: "연결 실패",
  DELAYED: "연결 지연",
};

const STATUS_STYLES: Record<DbHealth | CollectStatus, string> = {
  NORMAL:
    "border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-500/55 dark:bg-emerald-500/20 dark:text-emerald-400",
  CAUTION:
    "border-amber-200/90 bg-amber-50 text-amber-800 dark:border-amber-500/55 dark:bg-amber-500/20 dark:text-amber-400",
  WARNING:
    "border-orange-200/90 bg-orange-50 text-orange-800 dark:border-orange-500/55 dark:bg-orange-500/20 dark:text-orange-400",
  OUTAGE:
    "border-red-200/90 bg-red-50 text-red-800 dark:border-red-500/65 dark:bg-red-500/20 dark:text-red-400",
  OK: "border-emerald-200/90 bg-emerald-50 font-medium text-emerald-800 dark:border-emerald-500/55 dark:bg-emerald-500/20 dark:text-emerald-400",
  FAIL: "border-red-200/90 bg-red-50 font-medium text-red-800 dark:border-red-500/65 dark:bg-red-500/20 dark:text-red-400",
  DELAYED:
    "border-amber-200/90 bg-amber-50 font-medium text-amber-800 dark:border-amber-500/55 dark:bg-amber-500/20 dark:text-amber-400",
};

/**
 * 상태 값에 맞는 한글 라벨 배지를 렌더링합니다.
 */
export const StatusBadge = ({ kind, value, className }: StatusBadgeProps) => {
  const label =
    kind === "health"
      ? HEALTH_LABELS[value as DbHealth]
      : kind === "connection"
        ? CONNECTION_LABELS[value as CollectStatus]
        : COLLECT_LABELS[value as CollectStatus];

  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[value], className)}>
      {label}
    </Badge>
  );
};
