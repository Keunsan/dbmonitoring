/** connection_secret_ref를 credential로 해석하는 Resolver입니다. */

import { getSecretProvider } from "@/lib/env";
import { formatSecretRefForLog } from "@/lib/security/mask";
import type { DbmsType } from "@/types/domain";

import { resolveEnvConnectionSecret } from "./env-provider";
import { connectionSecretError } from "./errors";
import { parseConnectionSecretRef } from "./refs";
import { fetchConnectionSecret } from "./secret-store";
import type { ResolvedConnectionSecret } from "./types";

/**
 * connection_secret_ref를 해석해 DB 접속 credential을 반환합니다.
 */
export const resolveConnectionSecret = async (
  connectionSecretRef: string,
  expectedDbmsType?: DbmsType,
): Promise<ResolvedConnectionSecret> => {
  const parsed = parseConnectionSecretRef(connectionSecretRef);
  const provider = getSecretProvider();

  if (parsed.kind === "env") {
    if (provider === "supabase_vault" || provider === "db_encrypted") {
      console.warn(
        "[CONNECTION_SECRET_ENV_FALLBACK]",
        formatSecretRefForLog(parsed.raw),
      );
    }

    return {
      ref: parsed,
      credential: resolveEnvConnectionSecret(parsed.envName, expectedDbmsType),
    };
  }

  if (provider !== "supabase_vault" && provider !== "db_encrypted") {
    throw connectionSecretError(
      "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
      `vault ref를 사용하려면 SECRET_PROVIDER를 db_encrypted 또는 supabase_vault로 설정해주세요. (현재: ${provider})`,
      503,
      undefined,
      { ref: parsed.raw, provider },
    );
  }

  return {
    ref: parsed,
    credential: await fetchConnectionSecret(parsed.vaultName, expectedDbmsType),
  };
};
