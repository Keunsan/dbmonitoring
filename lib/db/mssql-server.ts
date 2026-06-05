/** 앱 운영 DB(MSSQL) ConnectionPool 관리입니다. */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import sql from "mssql";

import { ApiRouteError } from "@/lib/api";
import { getOptionalEnv } from "@/lib/env";

let cachedPool: sql.ConnectionPool | null | undefined;

const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
};

const loadCaCertificate = (): string | undefined => {
  const configuredPath = getOptionalEnv("MSSQL_CA_CERT_PATH");
  const candidatePaths = [
    configuredPath,
    join(process.cwd(), "certs", "corp-ca.pem"),
  ].filter(Boolean) as string[];

  for (const path of candidatePaths) {
    if (existsSync(path)) {
      return readFileSync(path, "utf8");
    }
  }

  return undefined;
};

/**
 * MSSQL 운영 DB 환경 변수 설정 여부를 반환합니다.
 */
export const isMssqlServerConfigured = (): boolean =>
  !!getOptionalEnv("MSSQL_HOST") &&
  !!getOptionalEnv("MSSQL_DATABASE") &&
  !!getOptionalEnv("MSSQL_USER") &&
  !!getOptionalEnv("MSSQL_PASSWORD");

/**
 * .env.local MSSQL_* 변수로 운영 DB ConnectionPool 설정을 생성합니다.
 */
export const buildMssqlOperationalPoolConfig = (): sql.config => {
  const trustServerCertificate = parseBooleanEnv(
    getOptionalEnv("MSSQL_TRUST_SERVER_CERTIFICATE"),
    false,
  );
  const ca = trustServerCertificate ? undefined : loadCaCertificate();

  return {
    server: getOptionalEnv("MSSQL_HOST") as string,
    port: Number(getOptionalEnv("MSSQL_PORT") ?? "1433"),
    database: getOptionalEnv("MSSQL_DATABASE") as string,
    user: getOptionalEnv("MSSQL_USER") as string,
    password: getOptionalEnv("MSSQL_PASSWORD") as string,
    options: {
      encrypt: parseBooleanEnv(getOptionalEnv("MSSQL_ENCRYPT"), true),
      trustServerCertificate,
      ...(ca ? { ca } : {}),
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  };
};

/**
 * 운영 DB ConnectionPool을 반환합니다.
 */
export const getMssqlOperationalPool = async (): Promise<sql.ConnectionPool> => {
  if (!isMssqlServerConfigured()) {
    throw new ApiRouteError({
      code: "MSSQL_NOT_CONFIGURED",
      message: "MSSQL 운영 DB 연결 설정이 필요합니다.",
      status: 503,
    });
  }

  if (cachedPool?.connected) {
    return cachedPool;
  }

  if (cachedPool && !cachedPool.connected) {
    await cachedPool.connect();
    return cachedPool;
  }

  const pool = new sql.ConnectionPool(buildMssqlOperationalPoolConfig());
  await pool.connect();
  cachedPool = pool;
  return pool;
};

/**
 * 운영 DB ConnectionPool에서 작업을 수행합니다.
 */
export const withMssqlOperationalPool = async <T>(
  work: (pool: sql.ConnectionPool) => Promise<T>,
): Promise<T> => {
  const pool = await getMssqlOperationalPool();

  try {
    return await work(pool);
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw error;
    }

    throw error;
  }
};
