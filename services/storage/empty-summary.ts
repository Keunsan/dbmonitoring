/** 수집 요약 조회 실패 시 화면용 빈 MonitoringSummary를 생성합니다. */

import { buildResourceSummary } from "@/lib/monitoring/resource-summary";
import type { DbInstanceId } from "@/types/domain";

import type { MonitoringSummary } from "./types";

/**
 * 지표·세션 데이터 없이 대시보드가 렌더링 가능한 빈 요약을 반환합니다.
 */
export const createEmptyMonitoringSummary = (
  dbInstanceId: DbInstanceId,
): MonitoringSummary => ({
  dbInstanceId,
  lastRun: null,
  latestMetrics: [],
  resourceSummary: buildResourceSummary([]),
  latestSessions: [],
  latestSql: [],
  blockingCount: 0,
  deadlockCount: 0,
});
