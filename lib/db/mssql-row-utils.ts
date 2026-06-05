/** MSSQL row 값을 API 타입으로 변환하는 유틸입니다. */

export const toIsoString = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

export const parseJsonObject = <T extends Record<string, unknown>>(
  value: string | null | undefined,
  fallback: T,
): T => {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

export const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};
