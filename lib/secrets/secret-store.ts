/** Secret Provider별 connection secret 저장·조회·삭제 facade입니다. */

import { getSecretProvider } from "@/lib/env";
import type { DbmsType } from "@/types/domain";

import {
  deleteDbEncryptedConnectionSecret,
  fetchDbEncryptedConnectionSecret,
  upsertDbEncryptedConnectionSecret,
} from "./db-encrypted-store";
import { connectionSecretError } from "./errors";
import type { ConnectionCredential } from "./types";
import {
  deleteConnectionSecret as deleteSupabaseConnectionSecret,
  fetchVaultConnectionSecret,
  upsertConnectionSecret as upsertSupabaseConnectionSecret,
} from "./vault-store";

/**
 * Provider에 맞는 저장소에서 connection secret JSON을 조회합니다.
 */
export const fetchConnectionSecret = async (
  secretName: string,
  expectedDbmsType?: DbmsType,
): Promise<ConnectionCredential> => {
  const provider = getSecretProvider();

  if (provider === "db_encrypted") {
    return fetchDbEncryptedConnectionSecret(secretName, expectedDbmsType);
  }

  if (provider === "supabase_vault") {
    return fetchVaultConnectionSecret(secretName, expectedDbmsType);
  }

  throw connectionSecretError(
    "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
    `vault ref를 사용하려면 SECRET_PROVIDER를 db_encrypted 또는 supabase_vault로 설정해주세요. (현재: ${provider})`,
    503,
    undefined,
    { provider },
  );
};

/**
 * Provider에 맞는 저장소에 connection secret을 저장하거나 갱신합니다.
 */
export const upsertConnectionSecret = async (
  secretName: string,
  credential: ConnectionCredential,
  description?: string,
) => {
  const provider = getSecretProvider();

  if (provider === "db_encrypted") {
    return upsertDbEncryptedConnectionSecret(secretName, credential, description);
  }

  if (provider === "supabase_vault") {
    return upsertSupabaseConnectionSecret(secretName, credential, description);
  }

  throw connectionSecretError(
    "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
    `Secret 저장을 위해 SECRET_PROVIDER를 db_encrypted 또는 supabase_vault로 설정해주세요. (현재: ${provider})`,
    503,
    undefined,
    { provider },
  );
};

/**
 * Provider에 맞는 저장소에서 connection secret을 삭제합니다.
 */
export const deleteConnectionSecret = async (secretName: string): Promise<boolean> => {
  const provider = getSecretProvider();

  if (provider === "db_encrypted") {
    return deleteDbEncryptedConnectionSecret(secretName);
  }

  if (provider === "supabase_vault") {
    return deleteSupabaseConnectionSecret(secretName);
  }

  throw connectionSecretError(
    "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
    `Secret 삭제를 위해 SECRET_PROVIDER를 db_encrypted 또는 supabase_vault로 설정해주세요. (현재: ${provider})`,
    503,
    undefined,
    { provider },
  );
};
