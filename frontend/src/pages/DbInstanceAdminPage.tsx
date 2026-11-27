/** Vite admin 라우트 — 인스턴스 관리 데이터를 API로 부트스트랩합니다. */
import { useEffect, useState } from "react";

import { DbInstanceManagementClient } from "@/components/features/admin/DbInstanceManagementClient";
import { EmptyState } from "@/components/shared";
import type { ApiResponse } from "@/types/api";
import type { BusinessSystem, DbInstance } from "@/types/entities";

export const DbInstanceAdminPage = () => {
  const [businessSystems, setBusinessSystems] = useState<BusinessSystem[]>([]);
  const [dbInstances, setDbInstances] = useState<DbInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [bizRes, instRes] = await Promise.all([
          fetch("/api/business-systems"),
          fetch("/api/db-instances"),
        ]);
        const bizPayload = (await bizRes.json()) as ApiResponse<{ items: BusinessSystem[] }>;
        const instPayload = (await instRes.json()) as ApiResponse<{ items: DbInstance[] }>;
        if (!bizRes.ok || bizPayload.error || !instRes.ok || instPayload.error) {
          throw new Error(
            bizPayload.error?.message ??
              instPayload.error?.message ??
              "관리 화면 데이터를 불러오지 못했습니다.",
          );
        }
        setBusinessSystems(bizPayload.data?.items ?? []);
        setDbInstances(instPayload.data?.items ?? []);
        setError(null);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "관리 화면 데이터를 불러오지 못했습니다.",
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return (
      <EmptyState title="로딩 중" description="업무 시스템·DB 인스턴스 목록을 불러오는 중입니다." />
    );
  }

  if (error) {
    return <EmptyState title="조회 실패" description={error} />;
  }

  return (
    <DbInstanceManagementClient
      initialBusinessSystems={businessSystems}
      initialDbInstances={dbInstances}
    />
  );
};