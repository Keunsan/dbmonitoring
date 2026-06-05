/** MSSQL connection_secret 테이블에 credential을 암호화 저장·조회·삭제합니다. */

import sql from "mssql";

import { isMssqlServerConfigured, withMssqlOperationalPool } from "@/lib/db/mssql-server";
import { formatSecretRefForLog, maskSensitiveRecord } from "@/lib/security/mask";
import type { DbmsType } from "@/types/domain";

import { decryptSecretPayload, encryptSecretPayload } from "./crypto";
import { connectionSecretError } from "./errors";
import { parseConnectionCredential } from "./validate";
import type { ConnectionCredential } from "./types";

/**
 * DB 암호화 Secret Provider 사용 가능 여부를 반환합니다.
 */
export const isDbEncryptedSecretProviderAvailable = (): boolean =>
  isMssqlServerConfigured() && !!process.env.SECRET_ENCRYPTION_KEY?.trim();

/**
 * MSSQL connection_secret에서 credential JSON을 조회합니다.
 */
export const fetchDbEncryptedConnectionSecret = async (
  secretName: string,
  expectedDbmsType?: DbmsType,
): Promise<ConnectionCredential> => {
  if (!isDbEncryptedSecretProviderAvailable()) {
    throw connectionSecretError(
      "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
      "DB 암호화 Secret Provider가 설정되지 않았습니다. MSSQL_* 및 SECRET_ENCRYPTION_KEY를 확인해주세요.",
      503,
    );
  }

  try {
    const row = await withMssqlOperationalPool(async (pool) => {
      const result = await pool
        .request()
        .input("secret_name", sql.NVarChar(256), secretName)
        .query<{ encrypted_payload: Buffer }>(`
          SELECT encrypted_payload
          FROM dbo.connection_secret
          WHERE secret_name = @secret_name
        `);

      return result.recordset[0] ?? null;
    });

    if (!row) {
      throw connectionSecretError(
        "DB_CONNECTION_SECRET_NOT_FOUND",
        "등록된 접속 Secret을 찾을 수 없습니다. 관리 화면에서 Secret을 등록해주세요.",
        404,
        undefined,
        { secretName },
      );
    }

    const plaintext = decryptSecretPayload(row.encrypted_payload);
    return parseConnectionCredential(JSON.parse(plaintext), expectedDbmsType);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string" &&
      (error as { code: string }).code.startsWith("DB_CONNECTION_SECRET_")
    ) {
      throw error;
    }

    console.error(
      "[DB_ENCRYPTED_SECRET_FETCH_FAILED]",
      maskSensitiveRecord({
        secretRef: formatSecretRefForLog(`vault:${secretName}`),
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    throw connectionSecretError(
      "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
      "접속 Secret을 조회하지 못했습니다. DB 연결과 암호화 키를 확인해주세요.",
      503,
      error,
    );
  }
};

/**
 * MSSQL connection_secret에 credential을 저장하거나 갱신합니다.
 */
export const upsertDbEncryptedConnectionSecret = async (
  secretName: string,
  credential: ConnectionCredential,
  description?: string,
) => {
  if (!isDbEncryptedSecretProviderAvailable()) {
    throw connectionSecretError(
      "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
      "DB 암호화 Secret Provider가 설정되지 않았습니다.",
      503,
    );
  }

  const encryptedPayload = encryptSecretPayload(JSON.stringify(credential));

  try {
    await withMssqlOperationalPool(async (pool) => {
      await pool
        .request()
        .input("secret_name", sql.NVarChar(256), secretName)
        .input("encrypted_payload", sql.VarBinary(sql.MAX), encryptedPayload)
        .input("description", sql.NVarChar(500), description ?? `DB connection credential for ${secretName}`)
        .query(`
          MERGE dbo.connection_secret AS target
          USING (SELECT @secret_name AS secret_name) AS source
          ON target.secret_name = source.secret_name
          WHEN MATCHED THEN
            UPDATE SET
              encrypted_payload = @encrypted_payload,
              key_version = 1,
              description = @description,
              updated_at = SYSDATETIMEOFFSET()
          WHEN NOT MATCHED THEN
            INSERT (secret_name, encrypted_payload, key_version, description)
            VALUES (@secret_name, @encrypted_payload, 1, @description);
        `);
    });
  } catch (error) {
    console.error(
      "[DB_ENCRYPTED_SECRET_UPSERT_FAILED]",
      maskSensitiveRecord({
        secretRef: formatSecretRefForLog(`vault:${secretName}`),
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    throw connectionSecretError(
      "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
      "접속 Secret을 저장하지 못했습니다. DB migration 적용 여부를 확인해주세요.",
      503,
      error,
    );
  }
};

/**
 * MSSQL connection_secret에서 credential을 삭제합니다.
 */
export const deleteDbEncryptedConnectionSecret = async (
  secretName: string,
): Promise<boolean> => {
  if (!isDbEncryptedSecretProviderAvailable()) {
    throw connectionSecretError(
      "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
      "DB 암호화 Secret Provider가 설정되지 않았습니다.",
      503,
    );
  }

  try {
    const result = await withMssqlOperationalPool(async (pool) => {
      const response = await pool
        .request()
        .input("secret_name", sql.NVarChar(256), secretName)
        .query(`
          DELETE FROM dbo.connection_secret
          OUTPUT DELETED.secret_name
          WHERE secret_name = @secret_name
        `);

      return response.recordset.length > 0;
    });

    return result;
  } catch (error) {
    console.error(
      "[DB_ENCRYPTED_SECRET_DELETE_FAILED]",
      maskSensitiveRecord({
        secretRef: formatSecretRefForLog(`vault:${secretName}`),
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    throw connectionSecretError(
      "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
      "접속 Secret을 삭제하지 못했습니다.",
      503,
      error,
    );
  }
};
