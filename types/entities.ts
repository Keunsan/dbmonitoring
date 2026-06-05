/** T-002 운영·시계열 엔티티 TypeScript 인터페이스입니다. */

import type {
  AlertStatus,
  BusinessSystemId,
  CollectStatus,
  CollectorType,
  DbInstanceId,
  DbmsType,
  DbHealth,
  EnvType,
  ImportanceLevel,
  IssueStatus,
  SeverityLevel,
  TenantId,
} from "./domain";

/** 업무 시스템 마스터 */
export type BusinessSystem = {
  id: string;
  tenantId: TenantId;
  code: string;
  name: string;
  importance: ImportanceLevel;
  ownerDept: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

/** DB 인스턴스 (운영 DB) */
export type DbInstance = {
  id: DbInstanceId;
  tenantId: TenantId;
  dbmsType: DbmsType;
  instanceName: string;
  host: string;
  port: number;
  serviceName: string | null;
  databaseName: string | null;
  businessSystemId: BusinessSystemId;
  importance: ImportanceLevel;
  envType: EnvType;
  collectorType: CollectorType;
  collectorId: string | null;
  collectIntervalSec: number;
  sqlAggregateIntervalSec: number;
  isActive: boolean;
  connectionSecretRef: string;
  /** 목록 표시용 — 접속 Secret에서 조회한 DB 사용자명 */
  connectionUsername?: string | null;
  lastCollectAt: string | null;
  lastCollectStatus: CollectStatus | null;
  lastConnectionTestAt: string | null;
  lastConnectionTestStatus: CollectStatus | null;
  createdAt: string;
  updatedAt: string;
};

/** 알림 이벤트 */
export type AlertEvent = {
  id: string;
  tenantId: TenantId;
  dbInstanceId: DbInstanceId;
  eventTime: string;
  severity: SeverityLevel;
  category: string;
  title: string;
  message: string;
  status: AlertStatus;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

/** 이슈 (1차 스키마만, 워크플로 2차) */
export type Issue = {
  id: string;
  tenantId: TenantId;
  dbInstanceId: DbInstanceId | null;
  alertEventId: string | null;
  title: string;
  status: IssueStatus;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 대시보드용 DB 인스턴스 요약 */
export type DbInstanceSummary = {
  id: DbInstanceId;
  instanceName: string;
  dbmsType: DbmsType;
  health: DbHealth;
  lastCollectAt: string | null;
  lastCollectStatus: CollectStatus | null;
};
