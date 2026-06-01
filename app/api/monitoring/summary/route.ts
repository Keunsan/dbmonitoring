/** 실시간 모니터링 요약 조회 API입니다. */

import { listDbInstances } from "@/lib/inventory/store";
import { withApiHandler } from "@/lib/api";
import { createEmptyMonitoringSummary } from "@/services/storage/empty-summary";
import { getMonitoringSummary } from "@/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DB 인스턴스별 최신 수집 요약을 반환합니다.
 */
export const GET = withApiHandler(async () => {
  const instances = await listDbInstances();

  const results = await Promise.allSettled(
    instances.map(async (instance) => ({
      instance,
      summary: await getMonitoringSummary(instance.id),
    })),
  );

  const items = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    const instance = instances[index];

    console.warn("[MONITORING_SUMMARY_INSTANCE_FAILED]", {
      dbInstanceId: instance.id,
      instanceName: instance.instanceName,
      reason:
        result.reason instanceof Error ? result.reason.message : String(result.reason),
    });

    return {
      instance,
      summary: createEmptyMonitoringSummary(instance.id),
    };
  });

  return {
    data: { items },
  };
});
