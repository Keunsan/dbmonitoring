/** DB 인스턴스별 MDF/LDF 용량 합계를 metric 스냅샷에서 추출합니다. */

import {
  extractDataFileStorageRows,
  extractFilegroupStorageRows,
} from "@/lib/monitoring/metric-details";
import { SERVER_METRIC_KEYS } from "@/lib/monitoring/metric-keys";
import type { ResourceSummary } from "@/lib/monitoring/resource-summary";
import type { MetricHistoryRecord } from "@/services/storage/types";

export type InstanceStorageCapacity = {
  mdfSizeMb: number | null;
  mdfUsedMb: number | null;
  ldfSizeMb: number | null;
  ldfUsedMb: number | null;
  mdfUsedPercent: number | null;
  ldfUsedPercent: number | null;
};

const getLatestMetricValue = (
  metrics: MetricHistoryRecord[],
  metricName: string,
): number | null => {
  const matched = metrics.filter((metric) => metric.metricName === metricName);
  if (matched.length === 0) {
    return null;
  }
  const latest = matched.reduce((current, metric) =>
    metric.metricTime > current.metricTime ? metric : current,
  );
  return latest.metricValue;
};

const isLogFile = (typeDesc: string) =>
  typeDesc.toUpperCase().includes("LOG");

const sumStorageByType = (
  rows: Array<{ typeDesc: string; sizeMb: number; usedMb: number }>,
) => {
  let mdfSizeMb = 0;
  let mdfUsedMb = 0;
  let ldfSizeMb = 0;
  let ldfUsedMb = 0;

  for (const row of rows) {
    if (isLogFile(row.typeDesc)) {
      ldfSizeMb += row.sizeMb;
      ldfUsedMb += row.usedMb;
    } else {
      mdfSizeMb += row.sizeMb;
      mdfUsedMb += row.usedMb;
    }
  }

  return { mdfSizeMb, mdfUsedMb, ldfSizeMb, ldfUsedMb };
};

const toCapacityFromSums = (
  sums: ReturnType<typeof sumStorageByType>,
  resourceSummary: ResourceSummary,
): InstanceStorageCapacity => {
  const { mdfSizeMb, mdfUsedMb, ldfSizeMb, ldfUsedMb } = sums;

  return {
    mdfSizeMb: mdfSizeMb > 0 ? mdfSizeMb : null,
    mdfUsedMb: mdfUsedMb > 0 ? mdfUsedMb : null,
    ldfSizeMb: ldfSizeMb > 0 ? ldfSizeMb : null,
    ldfUsedMb: ldfUsedMb > 0 ? ldfUsedMb : null,
    mdfUsedPercent:
      mdfSizeMb > 0 ? (mdfUsedMb / mdfSizeMb) * 100 : resourceSummary.storageUsedPercent,
    ldfUsedPercent:
      ldfSizeMb > 0 ? (ldfUsedMb / ldfSizeMb) * 100 : resourceSummary.logUsedPercent,
  };
};

const totalAllocatedMb = (capacity: InstanceStorageCapacity) =>
  (capacity.mdfSizeMb ?? 0) + (capacity.ldfSizeMb ?? 0);

const mergeLogSizeFromMetrics = (
  capacity: InstanceStorageCapacity,
  metrics: MetricHistoryRecord[],
  resourceSummary: ResourceSummary,
): InstanceStorageCapacity => {
  const logUsedMb =
    getLatestMetricValue(metrics, SERVER_METRIC_KEYS.logUsedMb) ?? capacity.ldfUsedMb;
  const ldfUsedPercent = resourceSummary.logUsedPercent;

  const ldfSizeMb =
    capacity.ldfSizeMb ??
    (logUsedMb !== null && ldfUsedPercent !== null && ldfUsedPercent > 0
      ? (logUsedMb / ldfUsedPercent) * 100
      : null);

  return {
    ...capacity,
    ldfSizeMb,
    ldfUsedMb: logUsedMb,
    ldfUsedPercent:
      ldfSizeMb && ldfSizeMb > 0 && logUsedMb !== null
        ? (logUsedMb / ldfSizeMb) * 100
        : capacity.ldfUsedPercent,
  };
};

/**
 * 데이터파일 태그 또는 집계 지표에서 MDF/LDF 합계를 계산합니다.
 */
export const extractInstanceStorageCapacity = (
  metrics: MetricHistoryRecord[],
  resourceSummary: ResourceSummary,
): InstanceStorageCapacity => {
  const dataFiles = extractDataFileStorageRows(metrics).filter((file) => file.sizeMb > 0);
  const filegroups = extractFilegroupStorageRows(metrics);

  if (dataFiles.length > 0) {
    const fromDataFiles = mergeLogSizeFromMetrics(
      toCapacityFromSums(sumStorageByType(dataFiles), resourceSummary),
      metrics,
      resourceSummary,
    );

    if (totalAllocatedMb(fromDataFiles) > 0) {
      return fromDataFiles;
    }
  }

  if (filegroups.length > 0) {
    return mergeLogSizeFromMetrics(
      toCapacityFromSums(sumStorageByType(filegroups), resourceSummary),
      metrics,
      resourceSummary,
    );
  }

  const mdfSizeMb =
    getLatestMetricValue(metrics, SERVER_METRIC_KEYS.storageDataSizeMb) ??
    null;
  const mdfUsedMb =
    getLatestMetricValue(metrics, SERVER_METRIC_KEYS.storageDataUsedMb) ??
    null;
  const ldfUsedMb =
    getLatestMetricValue(metrics, SERVER_METRIC_KEYS.logUsedMb) ?? null;
  const ldfUsedPercent = resourceSummary.logUsedPercent;

  const ldfSizeMb =
    ldfUsedMb !== null && ldfUsedPercent !== null && ldfUsedPercent > 0
      ? (ldfUsedMb / ldfUsedPercent) * 100
      : null;

  return {
    mdfSizeMb,
    mdfUsedMb,
    ldfSizeMb,
    ldfUsedMb,
    mdfUsedPercent: resourceSummary.storageUsedPercent,
    ldfUsedPercent,
  };
};

/**
 * MB 값을 GB 숫자로 변환합니다.
 */
export const mbToGb = (mb: number | null): number | null => {
  if (mb === null || mb <= 0 || Number.isNaN(mb)) {
    return null;
  }
  return mb / 1024;
};

/**
 * GB 값을 차트·툴팁 표시용 문자열로 포맷합니다.
 */
export const formatStorageGb = (gb: number | null) => {
  if (gb === null || Number.isNaN(gb)) {
    return "-";
  }
  return `${Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(gb)} GB`;
};

/**
 * MDF·LDF 할당 합계(MB)를 GB로 변환합니다.
 */
export const computeDbTotalSizeGb = (
  metrics: MetricHistoryRecord[],
  resourceSummary: ResourceSummary,
): number | null => {
  const capacity = extractInstanceStorageCapacity(metrics, resourceSummary);
  let totalMb = totalAllocatedMb(capacity);

  if (totalMb <= 0) {
    const dataSizeMb = getLatestMetricValue(metrics, SERVER_METRIC_KEYS.storageDataSizeMb);
    const logUsedMb = getLatestMetricValue(metrics, SERVER_METRIC_KEYS.logUsedMb);
    const logUsedPercent = resourceSummary.logUsedPercent;
    const logSizeMb =
      logUsedMb !== null && logUsedPercent !== null && logUsedPercent > 0
        ? (logUsedMb / logUsedPercent) * 100
        : 0;

    totalMb = (dataSizeMb ?? 0) + logSizeMb;
  }

  if (totalMb <= 0) {
    return null;
  }
  return mbToGb(totalMb);
};

/**
 * 대시보드 DB 크기 표시용 GB 문자열(소수점 1자리)입니다.
 */
export const formatDbSizeGbOneDecimal = (gb: number | null) => {
  if (gb === null || Number.isNaN(gb)) {
    return "-";
  }
  return `${Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(gb)} GB`;
};

/**
 * 스토리지 용량(MB)을 화면 표시용 문자열로 포맷합니다.
 */
export const formatStorageMb = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }
  if (value >= 1024) {
    return `${Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value / 1024)} GB`;
  }
  return `${Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)} MB`;
};
