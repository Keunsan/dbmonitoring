/** Vite admin 라우트 — 임계치 정책 화면 데이터를 API로 부트스트랩합니다. */
import { useEffect, useState } from "react";

import { ThresholdPolicyManagementClient } from "@/components/features/admin/ThresholdPolicyManagementClient";
import { EmptyState } from "@/components/shared";
import type { ApiResponse } from "@/types/api";
import type { BusinessSystem, DbInstance } from "@/types/entities";

type ThresholdPolicy = {
  id: string;
  scopeType: string;
  scopeId: string | null;
  metricKey: string;
  warningThreshold: number;
  criticalThreshold: number;
  comparison: string;
  durationSec: number;
  description: string;
  isActive: boolean;
};

export const ThresholdAdminPage = () => {
  const [businessSystems, setBusinessSystems] = useState<BusinessSystem[]>([]);
  const [dbInstances, setDbInstances] = useState<DbInstance[]>([]);
  const [policies, setPolicies] = useState<ThresholdPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [bizRes, instRes, policyRes] = await Promise.all([
          fetch("/api/business-systems"),
          fetch("/api/db-instances"),
          fetch("/api/threshold-policies"),
        ]);
        const bizPayload = (await bizRes.json()) as ApiResponse<{ items: BusinessSystem[] }>;
        const instPayload = (await instRes.json()) as ApiResponse<{ items: DbInstance[] }>;
        const policyPayload = (await policyRes.json()) as ApiResponse<{ items: ThresholdPolicy[] }>;
        if (!bizRes.ok || bizPayload.error || !instRes.ok || instPayload.error || !policyRes.ok) {
          throw new Error(
            bizPayload.error?.message ??
              instPayload.error?.message ??
              policyPayload.error?.message ??
              "임계치 정책 데이터를 불러오지 못했습니다.",
          );
        }
        setBusinessSystems(bizPayload.data?.items ?? []);
        setDbInstances(instPayload.data?.items ?? []);
        setPolicies(policyPayload.data?.items ?? []);
        setError(null);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "임계치 정책 데이터를 불러오지 못했습니다.",
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return <EmptyState title="로딩 중" description="임계치 정책 데이터를 불러오는 중입니다." />;
  }

  if (error) {
    return <EmptyState title="조회 실패" description={error} />;
  }

  return (
    <ThresholdPolicyManagementClient
      businessSystems={businessSystems}
      dbInstances={dbInstances}
      initialPolicies={policies}
    />
  );
};