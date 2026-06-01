/** 태그가 포함된 metric history에서 화면용 상세 목록을 추출합니다. */

import { SERVER_METRIC_KEYS } from "@/lib/monitoring/metric-keys";
import type { MetricHistoryRecord } from "@/services/storage/types";

export type FilegroupStorageRow = {
  filegroupName: string;
  typeDesc: string;
  sizeMb: number;
  usedMb: number;
  freeMb: number;
  usedPercent: number;
};

export type DataFileStorageRow = {
  fileName: string;
  filegroupName: string;
  typeDesc: string;
  sizeMb: number;
  usedMb: number;
  freeMb: number;
  usedPercent: number;
};

export type TableSizeRow = {
  schemaName: string;
  tableName: string;
  rowCount: number;
  dataMb: number;
  indexMb: number;
  totalMb: number;
};

const latestSnapshot = (metrics: MetricHistoryRecord[]) => {
  const latestTime = metrics.reduce<string | null>((latest, metric) => {
    if (!latest || metric.metricTime > latest) {
      return metric.metricTime;
    }
    return latest;
  }, null);

  if (!latestTime) {
    return [];
  }

  return metrics.filter((metric) => metric.metricTime === latestTime);
};

/**
 * 동일 수집 시각별로 묶어 지표 수가 가장 많은 스냅샷을 선택합니다.
 */
export const pickFullestMetricSnapshot = (
  metrics: MetricHistoryRecord[],
): MetricHistoryRecord[] => {
  if (metrics.length === 0) {
    return [];
  }

  const groups = new Map<string, MetricHistoryRecord[]>();

  for (const metric of metrics) {
    const bucket = groups.get(metric.metricTime) ?? [];
    bucket.push(metric);
    groups.set(metric.metricTime, bucket);
  }

  let fullest: MetricHistoryRecord[] = [];

  for (const group of groups.values()) {
    if (group.length > fullest.length) {
      fullest = group;
    }
  }

  return fullest.length > 0 ? fullest : latestSnapshot(metrics);
};

const getTaggedMetric = (
  metrics: MetricHistoryRecord[],
  metricName: string,
  tagKey: string,
) => {
  const map = new Map<string, number>();

  for (const metric of metrics) {
    if (metric.metricName !== metricName) {
      continue;
    }

    const tagValue = metric.tags[tagKey];
    if (!tagValue) {
      continue;
    }

    map.set(tagValue, metric.metricValue);
  }

  return map;
};

/**
 * 파일그룹별 사용률 목록을 추출합니다.
 */
export const extractFilegroupStorageRows = (
  metrics: MetricHistoryRecord[],
): FilegroupStorageRow[] => {
  const snapshot = latestSnapshot(metrics);
  const sizeMap = getTaggedMetric(snapshot, SERVER_METRIC_KEYS.filegroupSizeMb, "filegroupName");
  const usedMap = getTaggedMetric(snapshot, SERVER_METRIC_KEYS.filegroupUsedMb, "filegroupName");
  const freeMap = getTaggedMetric(snapshot, SERVER_METRIC_KEYS.filegroupFreeMb, "filegroupName");
  const percentMap = getTaggedMetric(
    snapshot,
    SERVER_METRIC_KEYS.filegroupUsedPercent,
    "filegroupName",
  );
  const typeMap = new Map<string, string>();

  for (const metric of snapshot) {
    if (
      metric.metricName === SERVER_METRIC_KEYS.filegroupSizeMb &&
      metric.tags.filegroupName
    ) {
      typeMap.set(metric.tags.filegroupName, metric.tags.typeDesc ?? "ROWS");
    }
  }

  return [...new Set([...sizeMap.keys(), ...usedMap.keys(), ...freeMap.keys(), ...percentMap.keys()])]
    .map((filegroupName) => {
      const sizeMb = sizeMap.get(filegroupName) ?? 0;
      const usedMb = usedMap.get(filegroupName) ?? 0;
      const freeMb = freeMap.get(filegroupName) ?? Math.max(sizeMb - usedMb, 0);
      const usedPercent =
        percentMap.get(filegroupName) ??
        (sizeMb > 0 ? (usedMb / sizeMb) * 100 : 0);

      return {
        filegroupName,
        typeDesc: typeMap.get(filegroupName) ?? "ROWS",
        sizeMb,
        usedMb,
        freeMb,
        usedPercent,
      };
    })
    .sort((a, b) => b.usedPercent - a.usedPercent);
};

/**
 * 데이터 파일별 사용률 목록을 추출합니다.
 */
export const extractDataFileStorageRows = (
  metrics: MetricHistoryRecord[],
): DataFileStorageRow[] => {
  const snapshot = latestSnapshot(metrics);
  const sizeMetrics = snapshot.filter(
    (metric) => metric.metricName === SERVER_METRIC_KEYS.dataFileSizeMb,
  );

  return sizeMetrics
    .map((metric) => {
      const fileName = metric.tags.fileName ?? "unknown";
      const usedMb =
        snapshot.find(
          (entry) =>
            entry.metricName === SERVER_METRIC_KEYS.dataFileUsedMb &&
            entry.tags.fileName === fileName,
        )?.metricValue ?? 0;
      const freeMb =
        snapshot.find(
          (entry) =>
            entry.metricName === SERVER_METRIC_KEYS.dataFileFreeMb &&
            entry.tags.fileName === fileName,
        )?.metricValue ?? Math.max(metric.metricValue - usedMb, 0);
      const usedPercent =
        snapshot.find(
          (entry) =>
            entry.metricName === SERVER_METRIC_KEYS.dataFileUsedPercent &&
            entry.tags.fileName === fileName,
        )?.metricValue ??
        (metric.metricValue > 0 ? (usedMb / metric.metricValue) * 100 : 0);

      return {
        fileName,
        filegroupName: metric.tags.filegroupName ?? "-",
        typeDesc: metric.tags.typeDesc ?? "-",
        sizeMb: metric.metricValue,
        usedMb,
        freeMb,
        usedPercent,
      };
    })
    .sort((a, b) => b.usedPercent - a.usedPercent);
};

/**
 * 테이블별 용량 Top N 목록을 추출합니다.
 */
export const extractTableSizeRows = (
  metrics: MetricHistoryRecord[],
): TableSizeRow[] => {
  const snapshot = latestSnapshot(metrics);
  const dataMap = getTaggedMetric(snapshot, SERVER_METRIC_KEYS.tableDataMb, "tableKey");
  const indexMap = getTaggedMetric(snapshot, SERVER_METRIC_KEYS.tableIndexMb, "tableKey");
  const totalMap = getTaggedMetric(snapshot, SERVER_METRIC_KEYS.tableTotalMb, "tableKey");
  const rowCountMap = getTaggedMetric(snapshot, SERVER_METRIC_KEYS.tableRowCount, "tableKey");

  const tableKeys = new Set([
    ...dataMap.keys(),
    ...indexMap.keys(),
    ...totalMap.keys(),
    ...rowCountMap.keys(),
  ]);

  return [...tableKeys]
    .map((tableKey) => {
      const [schemaName, tableName] = tableKey.split(".");
      const dataMb = dataMap.get(tableKey) ?? 0;
      const indexMb = indexMap.get(tableKey) ?? 0;
      const totalMb = totalMap.get(tableKey) ?? dataMb + indexMb;

      return {
        schemaName: schemaName ?? "dbo",
        tableName: tableName ?? tableKey,
        rowCount: rowCountMap.get(tableKey) ?? 0,
        dataMb,
        indexMb,
        totalMb,
      };
    })
    .sort((a, b) => b.totalMb - a.totalMb)
    .slice(0, 30);
};
