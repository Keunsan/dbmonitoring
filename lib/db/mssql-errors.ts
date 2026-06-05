/** MSSQL 드라이버 오류를 앱 오류 코드로 매핑합니다. */

type MssqlErrorLike = {
  number?: number;
  code?: string;
  message?: string;
};

export const getMssqlErrorNumber = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const record = error as MssqlErrorLike;

  if (typeof record.number === "number") {
    return record.number;
  }

  if (record.code === "EREQUEST" && typeof record.message === "string") {
    const match = record.message.match(/Violation of (\w+) constraint/i);
    if (match) {
      return match[1]?.toLowerCase().includes("unique") ? 2627 : 547;
    }
  }

  return undefined;
};

export const isMssqlUniqueViolation = (error: unknown) => getMssqlErrorNumber(error) === 2627;

export const isMssqlForeignKeyViolation = (error: unknown) => getMssqlErrorNumber(error) === 547;
