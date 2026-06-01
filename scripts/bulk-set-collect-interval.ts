/** 모든 DB 인스턴스 수집 주기를 일괄 변경하는 일회성 스크립트입니다. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const TARGET_INTERVAL_SEC = 60;
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

const loadEnvLocal = () => {
  const envPath = resolve(process.cwd(), ".env.local");

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
};

const main = async () => {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
    process.exit(1);
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: before, error: listError } = await client
    .from("db_instance")
    .select("id, instance_name, collect_interval_sec")
    .eq("tenant_id", DEFAULT_TENANT_ID);

  if (listError) {
    console.error("조회 실패:", listError.message);
    process.exit(1);
  }

  const { data, error } = await client
    .from("db_instance")
    .update({
      collect_interval_sec: TARGET_INTERVAL_SEC,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .select("id, instance_name, collect_interval_sec");

  if (error) {
    console.error("업데이트 실패:", error.message);
    process.exit(1);
  }

  console.info(
    `[bulk-set-collect-interval] ${before?.length ?? 0}건 중 ${data?.length ?? 0}건을 ${TARGET_INTERVAL_SEC}초(1분)로 변경했습니다.`,
  );

  for (const row of data ?? []) {
    console.info(`  - ${row.instance_name}: ${row.collect_interval_sec}s`);
  }
};

main().catch((error: unknown) => {
  console.error("[bulk-set-collect-interval] 오류:", error);
  process.exit(1);
});
