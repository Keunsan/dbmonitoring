/** connection secret AES-256-GCM 암·복호화 유틸입니다. */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

import { getOptionalEnv } from "@/lib/env";

import { connectionSecretError } from "./errors";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const decodeEncryptionKey = (): Buffer => {
  const raw = getOptionalEnv("SECRET_ENCRYPTION_KEY");

  if (!raw) {
    throw connectionSecretError(
      "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
      "SECRET_ENCRYPTION_KEY 환경 변수가 설정되지 않았습니다.",
      503,
    );
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw connectionSecretError(
      "DB_CONNECTION_SECRET_PROVIDER_UNAVAILABLE",
      "SECRET_ENCRYPTION_KEY는 32바이트(base64) 값이어야 합니다.",
      503,
    );
  }

  return key;
};

/**
 * 평문 JSON 문자열을 AES-256-GCM으로 암호화합니다.
 */
export const encryptSecretPayload = (plaintext: string, keyVersion = 1): Buffer => {
  const key = decodeEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    Buffer.from([keyVersion]),
    iv,
    authTag,
    encrypted,
  ]);
};

/**
 * AES-256-GCM 암호문을 평문 JSON 문자열로 복호화합니다.
 */
export const decryptSecretPayload = (payload: Buffer): string => {
  if (payload.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw connectionSecretError(
      "DB_CONNECTION_SECRET_INVALID",
      "저장된 Secret 형식이 올바르지 않습니다.",
      400,
    );
  }

  const keyVersion = payload.readUInt8(0);
  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const authTag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = payload.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);

  if (keyVersion !== 1) {
    throw connectionSecretError(
      "DB_CONNECTION_SECRET_INVALID",
      `지원하지 않는 Secret key_version(${keyVersion}) 입니다.`,
      400,
    );
  }

  const key = decodeEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};
