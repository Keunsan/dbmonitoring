/** Supabase/PostgreSQL 및 MSSQL 클라이언트 진입점입니다. */

import { getOptionalEnv, validateRequiredEnv } from "@/lib/env";

export { getSupabaseServerClient, isSupabaseServerConfigured } from "./supabase-server";
export {
  buildMssqlOperationalPoolConfig,
  getMssqlOperationalPool,
  isMssqlServerConfigured,
  withMssqlOperationalPool,
} from "./mssql-server";
export { buildMssqlPoolConfig, buildOracleConnectString } from "./connection-config";
export { withMssqlConnection } from "./mssql-connection";
export { withOracleConnection } from "./oracle-connection";

export type DbClientStatus = "not_configured" | "ready" | "error";

/**
 * 운영 DB 연결 환경 변수 설정 상태를 반환합니다.
 */
export const getDbClientStatus = (): DbClientStatus => {
  const hasMssqlConfig =
    !!getOptionalEnv("MSSQL_HOST") &&
    !!getOptionalEnv("MSSQL_DATABASE") &&
    !!getOptionalEnv("MSSQL_USER") &&
    !!getOptionalEnv("MSSQL_PASSWORD");
  const hasSupabaseConfig =
    !!getOptionalEnv("NEXT_PUBLIC_SUPABASE_URL") &&
    !!getOptionalEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const hasDatabaseUrl = !!getOptionalEnv("DATABASE_URL");

  if (!hasMssqlConfig && !hasSupabaseConfig && !hasDatabaseUrl) {
    return "not_configured";
  }

  if (hasMssqlConfig) {
    return "ready";
  }

  return validateRequiredEnv().ok ? "ready" : "error";
};
