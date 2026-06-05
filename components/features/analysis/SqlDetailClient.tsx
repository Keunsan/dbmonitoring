"use client";

/** SQL 상세 분석 화면 클라이언트 컴포넌트입니다. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiResponse } from "@/types/api";
import type { DbInstance } from "@/types/entities";

type SqlPerformanceItem = {
  metricTime: string;
  executions: number;
  avgElapsedMs: number;
  totalCpuMs: number;
  totalLogicalReads: number | null;
  lastExecutionTime: string | null;
  sqlTextMasked: string;
};

type SqlDetail = {
  sqlId: string;
  latest: SqlPerformanceItem | null;
  history: SqlPerformanceItem[];
  performanceChange: {
    avgElapsedChangePercent: number | null;
    cpuChangePercent: number | null;
  };
};

type SqlDetailClientProps = {
  dbInstances: DbInstance[];
  sqlId: string;
  initialDbInstanceId?: string;
};

const requestJson = async <T,>(url: string) => {
  const response = await fetch(url);
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "요청 처리 중 오류가 발생했습니다.");
  }

  return payload.data as T;
};

const formatNumber = (value: number) =>
  Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);

/** 성능 이력 테이블 헤더 고정 스타일입니다. */
const STICKY_TABLE_HEADER_CLASS =
  "sticky top-0 z-10 bg-card [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_tr]:border-b [&_tr]:shadow-sm";

/**
 * SQL Text와 성능 이력을 표시합니다.
 */
export const SqlDetailClient = ({
  dbInstances,
  sqlId,
  initialDbInstanceId,
}: SqlDetailClientProps) => {
  const [dbInstanceId, setDbInstanceId] = useState(
    initialDbInstanceId ?? dbInstances[0]?.id ?? "",
  );
  const [detail, setDetail] = useState<SqlDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!dbInstanceId) {
      setDetail(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await requestJson<{ detail: SqlDetail | null }>(
        `/api/analysis/sql/${encodeURIComponent(sqlId)}?dbInstanceId=${encodeURIComponent(dbInstanceId)}`,
      );
      setDetail(payload.detail);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "SQL 상세 데이터를 불러오지 못했습니다.",
      );
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [dbInstanceId, sqlId]);

  useEffect(() => {
    let cancelled = false;

    const loadDetail = async () => {
      if (!dbInstanceId) {
        setDetail(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const payload = await requestJson<{ detail: SqlDetail | null }>(
          `/api/analysis/sql/${encodeURIComponent(sqlId)}?dbInstanceId=${encodeURIComponent(dbInstanceId)}`,
        );

        if (!cancelled) {
          setDetail(payload.detail);
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "SQL 상세 데이터를 불러오지 못했습니다.",
          );
          setDetail(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [dbInstanceId, sqlId]);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="SQL 상세 분석"
        description="SQL Text, CPU/Elapsed/Reads 이력, 실행 횟수를 확인합니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              value={dbInstanceId}
              onChange={(event) => setDbInstanceId(event.target.value)}
            >
              {dbInstances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.instanceName}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => void refresh()}>
              새로고침
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/analysis/top-sql">Top SQL로 돌아가기</Link>
            </Button>
          </div>
        }
      />

      <div className="portal-content-canvas flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-4 md:p-5">
        {error ? (
          <Alert variant="destructive" className="shrink-0">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <Card className="shrink-0">
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              SQL 상세 데이터를 불러오는 중입니다...
            </CardContent>
          </Card>
        ) : null}

        {!loading && !detail ? (
          <EmptyState
            title="SQL 상세 데이터가 없습니다"
            description="수집이 완료된 뒤 다시 확인하거나 다른 DB 인스턴스를 선택해 주세요."
          />
        ) : null}

        {!loading && detail ? (
          <>
            <Card className="shrink-0">
              <CardHeader>
                <CardTitle>{detail.sqlId}</CardTitle>
                <CardDescription>
                  평균 수행 시간 변화:{" "}
                  {detail.performanceChange.avgElapsedChangePercent === null
                    ? "-"
                    : `${formatNumber(detail.performanceChange.avgElapsedChangePercent)}%`}
                  {" / "}
                  CPU 변화:{" "}
                  {detail.performanceChange.cpuChangePercent === null
                    ? "-"
                    : `${formatNumber(detail.performanceChange.cpuChangePercent)}%`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-mono text-sm whitespace-pre-wrap">
                  {detail.latest?.sqlTextMasked ?? "-"}
                </p>
                <div className="grid gap-3 md:grid-cols-4">
                  <MetricBox
                    label="실행 횟수"
                    value={formatNumber(detail.latest?.executions ?? 0)}
                  />
                  <MetricBox
                    label="평균 수행 시간"
                    value={`${formatNumber(detail.latest?.avgElapsedMs ?? 0)}ms`}
                  />
                  <MetricBox
                    label="총 CPU"
                    value={`${formatNumber(detail.latest?.totalCpuMs ?? 0)}ms`}
                  />
                  <MetricBox
                    label="마지막 실행"
                    value={detail.latest?.lastExecutionTime ?? detail.latest?.metricTime ?? "-"}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CardHeader className="shrink-0">
                <CardTitle>성능 이력</CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-hidden pb-3">
                <div className="h-full min-h-0 overflow-auto rounded-md border">
                  <table className="w-full caption-bottom border-collapse text-sm">
                    <TableHeader className={STICKY_TABLE_HEADER_CLASS}>
                      <TableRow>
                        <TableHead>수집 시각</TableHead>
                        <TableHead>실행 횟수</TableHead>
                        <TableHead>평균 수행(ms)</TableHead>
                        <TableHead>CPU(ms)</TableHead>
                        <TableHead>Logical Reads</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...detail.history].reverse().map((item) => (
                        <TableRow key={item.metricTime}>
                          <TableCell>{item.metricTime}</TableCell>
                          <TableCell>{formatNumber(item.executions)}</TableCell>
                          <TableCell>{formatNumber(item.avgElapsedMs)}</TableCell>
                          <TableCell>{formatNumber(item.totalCpuMs)}</TableCell>
                          <TableCell>{formatNumber(item.totalLogicalReads ?? 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
};

const MetricBox = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border p-3">
    <div className="text-muted-foreground text-xs">{label}</div>
    <div className="text-base font-semibold tabular-nums">{value}</div>
  </div>
);
