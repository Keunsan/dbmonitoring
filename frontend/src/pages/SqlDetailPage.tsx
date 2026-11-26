/** SQL 상세 분석 라우트 래퍼입니다. */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { SqlDetailClient } from "@/components/features/analysis/SqlDetailClient";
import { EmptyState } from "@/components/shared";
import type { ApiResponse } from "@/types/api";
import type { DbInstance } from "@/types/entities";

export const SqlDetailPage = () => {
  const { sqlId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [dbInstances, setDbInstances] = useState<DbInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/db-instances");
      const payload = (await response.json()) as ApiResponse<{
        items: DbInstance[];
      }>;
      setDbInstances(payload.data?.items ?? []);
      setLoading(false);
    };
    void load();
  }, []);

  if (loading) {
    return <EmptyState title="로딩 중" description="DB 인스턴스 목록을 불러오는 중입니다." />;
  }

  return (
    <SqlDetailClient
      dbInstances={dbInstances}
      sqlId={decodeURIComponent(sqlId)}
      initialDbInstanceId={searchParams.get("dbInstanceId") ?? undefined}
    />
  );
};