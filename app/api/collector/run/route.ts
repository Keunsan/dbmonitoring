/** Collector 수동 실행 API입니다. */

import { withApiHandler } from "@/lib/api";
import {
  runCollectorForInstance,
  runCollectorOnce,
  startCollectorScheduler,
} from "@/services/collector";
import { readJsonObject } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 전체 또는 단일 DB 인스턴스 Collector를 즉시 실행합니다.
 */
export const POST = withApiHandler(async ({ request }) => {
  startCollectorScheduler();

  const payload = await readJsonObject(request);
  const dbInstanceId =
    typeof payload.dbInstanceId === "string" && payload.dbInstanceId.trim()
      ? payload.dbInstanceId.trim()
      : null;
  const scope = payload.scope === "sessions" ? "sessions" : "full";

  const results = dbInstanceId
    ? [await runCollectorForInstance(dbInstanceId, { scope })]
    : await runCollectorOnce();

  return {
    data: {
      items: results,
    },
  };
});
