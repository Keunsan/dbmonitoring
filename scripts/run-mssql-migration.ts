/** MSSQL migration SQL 파일을 DPM DB에 적용합니다. */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import sql from "mssql";

const loadEnvLocal = () => {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex <= 0) {
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

      const inlineCommentIndex = value.search(/\s+#/);

      if (inlineCommentIndex >= 0) {
        value = value.slice(0, inlineCommentIndex).trim();
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    console.warn("[MSSQL_MIGRATION] .env.local 파일을 읽지 못했습니다. 환경 변수를 직접 설정해주세요.");
  }
};

const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (!value || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
};

const splitSqlBatches = (content: string) =>
  content
    .split(/^\s*GO\s*$/gim)
    .map((batch) => batch.trim())
    .filter((batch) => batch.length > 0);

const loadCaCertificate = (): string | undefined => {
  const configuredPath = process.env.MSSQL_CA_CERT_PATH;
  const candidatePaths = [
    configuredPath,
    join(process.cwd(), "certs", "corp-ca.pem"),
  ].filter(Boolean) as string[];

  for (const path of candidatePaths) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      continue;
    }
  }

  return undefined;
};

const runMigration = async () => {
  loadEnvLocal();

  const host = process.env.MSSQL_HOST;
  const database = process.env.MSSQL_DATABASE;
  const user = process.env.MSSQL_USER;
  const password = process.env.MSSQL_PASSWORD;

  if (!host || !database || !user || !password) {
    throw new Error("MSSQL_HOST, MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD 환경 변수가 필요합니다.");
  }

  const trustServerCertificate = parseBooleanEnv(
    process.env.MSSQL_TRUST_SERVER_CERTIFICATE,
    false,
  );
  const ca = trustServerCertificate ? undefined : loadCaCertificate();

  const pool = await new sql.ConnectionPool({
    server: host,
    port: Number(process.env.MSSQL_PORT ?? "1433"),
    database,
    user,
    password,
    options: {
      encrypt: parseBooleanEnv(process.env.MSSQL_ENCRYPT, true),
      trustServerCertificate,
      ...(ca ? { cryptoCredentialsDetails: { ca } } : {}),
    },
  }).connect();

  const migrationsDir = join(process.cwd(), "migrations", "mssql");
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  console.log(`[MSSQL_MIGRATION] ${files.length}개 migration 파일 적용 시작 (${host}/${database})`);

  try {
    for (const file of files) {
      const filePath = join(migrationsDir, file);
      const content = readFileSync(filePath, "utf8");
      const batches = splitSqlBatches(content);

      console.log(`[MSSQL_MIGRATION] ${file} (${batches.length} batches)`);

      for (const [index, batch] of batches.entries()) {
        await pool.request().batch(batch);
        console.log(`  - batch ${index + 1}/${batches.length} OK`);
      }
    }

    console.log("[MSSQL_MIGRATION] 완료");
  } finally {
    await pool.close();
  }
};

runMigration().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error("[MSSQL_MIGRATION] 실패:", message);

  if (message.includes("self-signed certificate")) {
    console.error(
      "[MSSQL_MIGRATION] TLS 안내: 서버 인증서가 사내 CA(certs/corp-ca.pem)로 검증되지 않습니다. " +
        "자체 서명 인증서를 사용하는 SQL Server라면 .env.local에서 MSSQL_TRUST_SERVER_CERTIFICATE=true 로 설정해주세요.",
    );
  }

  process.exit(1);
});
