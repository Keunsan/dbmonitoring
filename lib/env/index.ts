/** 환경 변수와 시크릿 설정 상태를 안전하게 다루는 서버 전용 헬퍼입니다. */

export type RuntimeEnvironment = "development" | "test" | "staging" | "production";

export type SecretProvider =
  | "supabase_vault"
  | "db_encrypted"
  | "kms"
  | "internal_secret_manager"
  | "env_local";

export type EnvRequirement = {
  key: string;
  description: string;
  requiredIn: RuntimeEnvironment[];
  secret?: boolean;
};

export type EnvValidationResult = {
  ok: boolean;
  missingKeys: string[];
};

export const ENV_REQUIREMENTS: EnvRequirement[] = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    description: "Supabase 프로젝트 URL",
    requiredIn: ["staging", "production"],
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    description: "브라우저용 Supabase publishable key",
    requiredIn: ["staging", "production"],
    secret: true,
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    description: "서버 전용 Supabase service role key",
    requiredIn: ["staging", "production"],
    secret: true,
  },
  {
    key: "DATABASE_URL",
    description: "서버 전용 PostgreSQL 연결 문자열",
    requiredIn: ["production"],
    secret: true,
  },
  {
    key: "AUTH_SESSION_SECRET",
    description: "세션 서명/암호화용 secret",
    requiredIn: ["staging", "production"],
    secret: true,
  },
];

/**
 * 현재 실행 환경을 반환합니다.
 */
export const getRuntimeEnvironment = (): RuntimeEnvironment => {
  const value = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";

  if (value === "production" || value === "staging" || value === "test") {
    return value;
  }

  return "development";
};

/**
 * 공백 문자열을 미설정 값으로 취급해 환경 변수를 읽습니다.
 */
export const getOptionalEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
};

/**
 * Secret 저장소 설정 값을 반환합니다.
 */
export const getSecretProvider = (): SecretProvider => {
  const value = getOptionalEnv("SECRET_PROVIDER");

  if (
    value === "supabase_vault" ||
    value === "db_encrypted" ||
    value === "kms" ||
    value === "internal_secret_manager" ||
    value === "env_local"
  ) {
    return value;
  }

  return "env_local";
};

/**
 * 현재 실행 환경에서 필수 환경 변수 누락 여부를 검증합니다.
 */
export const validateRequiredEnv = (
  runtime = getRuntimeEnvironment(),
): EnvValidationResult => {
  const missingKeys = ENV_REQUIREMENTS.filter((requirement) =>
    requirement.requiredIn.includes(runtime),
  )
    .map((requirement) => requirement.key)
    .filter((key) => !getOptionalEnv(key));

  return {
    ok: missingKeys.length === 0,
    missingKeys,
  };
};
