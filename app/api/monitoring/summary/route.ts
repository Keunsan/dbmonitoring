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

  // #region agent log
  fetch("http://127.0.0.1:7400/ingest/ce507061-2dfc-43ac-a17f-b1938c31136d", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4719f6" },
    body: JSON.stringify({
      sessionId: "4719f6",
      runId: "pre-fix",
      hypothesisId: "H4",
      location: "monitoring/summary/route.ts:GET",
      message: "summary API start",
      data: { instanceCount: instances.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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

    // #region agent log
    fetch("http://127.0.0.1:7400/ingest/ce507061-2dfc-43ac-a17f-b1938c31136d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4719f6" },
      body: JSON.stringify({
        sessionId: "4719f6",
        runId: "pre-fix",
        hypothesisId: "H4",
        location: "monitoring/summary/route.ts:instance-failed",
        message: "instance summary failed, using empty fallback",
        data: {
          dbInstanceId: instance.id,
          instanceName: instance.instanceName,
          reason:
            result.reason instanceof Error ? result.reason.message : String(result.reason),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return {
      instance,
      summary: createEmptyMonitoringSummary(instance.id),
    };
  });

  const failedCount = results.filter((result) => result.status === "rejected").length;

  // #region agent log
  fetch("http://127.0.0.1:7400/ingest/ce507061-2dfc-43ac-a17f-b1938c31136d", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4719f6" },
    body: JSON.stringify({
      sessionId: "4719f6",
      runId: "pre-fix",
      hypothesisId: "H4",
      location: "monitoring/summary/route.ts:GET:done",
      message: "summary API completed",
      data: { instanceCount: instances.length, failedCount, itemCount: items.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return {
    data: { items },
  };
});
