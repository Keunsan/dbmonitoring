/** Vite 포털 라우터 진입점입니다. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { PortalLayout } from "./pages/PortalLayout";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { PortalSidebarProvider } from "@/components/layout/PortalSidebarProvider";
import { Toaster } from "@/components/ui/sonner";

import { MonitoringRealtimeClient } from "@/components/features/monitoring/MonitoringRealtimeClient";
import { DashboardBiClient } from "@/components/features/monitoring/DashboardBiClient";
import { SqlDetailPage } from "./pages/SqlDetailPage";
import { PlanChangeClient } from "@/components/features/analysis/PlanChangeClient";
import { RegressionInsightClient } from "@/components/features/analysis/RegressionInsightClient";
import { DbInstanceManagementClient } from "@/components/features/admin/DbInstanceManagementClient";
import { ThresholdPolicyManagementClient } from "@/components/features/admin/ThresholdPolicyManagementClient";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 60_000,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <PortalSidebarProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <PortalLayout>
                  <MonitoringRealtimeClient
                    title="통합 현황"
                    description="전체 DB 수집 상태와 주요 지표를 60초마다 갱신합니다."
                    variant="dashboard"
                  />
                </PortalLayout>
              }
            />
            <Route
              path="/dashboard/v1"
              element={
                <PortalLayout>
                  <DashboardBiClient variant="v1" />
                </PortalLayout>
              }
            />
            <Route
              path="/dashboard/v2"
              element={
                <PortalLayout>
                  <DashboardBiClient variant="v2" />
                </PortalLayout>
              }
            />
            <Route
              path="/monitoring/realtime"
              element={
                <PortalLayout>
                  <MonitoringRealtimeClient
                    title="DB 실시간 현황"
                    description="60초마다 최신 스냅샷을 조회합니다."
                    variant="realtime"
                  />
                </PortalLayout>
              }
            />
            <Route
              path="/monitoring/sessions"
              element={
                <PortalLayout>
                  <MonitoringRealtimeClient
                    title="실시간 세션"
                    description="세션 스냅샷을 60초마다 조회합니다."
                    variant="sessions"
                  />
                </PortalLayout>
              }
            />
            <Route
              path="/monitoring/blocking"
              element={
                <PortalLayout>
                  <MonitoringRealtimeClient
                    title="락 및 Blocking"
                    description="Blocking 스냅샷을 60초마다 조회합니다."
                    variant="blocking"
                  />
                </PortalLayout>
              }
            />
            <Route
              path="/monitoring/deadlocks"
              element={
                <PortalLayout>
                  <MonitoringRealtimeClient
                    title="교착상태"
                    description="Deadlock 이벤트를 60초마다 조회합니다."
                    variant="deadlocks"
                  />
                </PortalLayout>
              }
            />
            <Route
              path="/monitoring/waits"
              element={
                <PortalLayout>
                  <MonitoringRealtimeClient
                    title="Wait 현황"
                    description="Wait 지표를 60초마다 조회합니다."
                    variant="waits"
                  />
                </PortalLayout>
              }
            />
            <Route
              path="/analysis/top-sql"
              element={
                <PortalLayout>
                  <MonitoringRealtimeClient
                    title="Top SQL 분석"
                    description="SQL 성능 집계를 60초마다 조회합니다."
                    variant="top-sql"
                  />
                </PortalLayout>
              }
            />
            <Route
              path="/analysis/sql/:sqlId"
              element={
                <PortalLayout>
                  <SqlDetailPage />
                </PortalLayout>
              }
            />
            <Route
              path="/analysis/plan-changes"
              element={
                <PortalLayout>
                  <PlanChangeClient />
                </PortalLayout>
              }
            />
            <Route
              path="/analysis/regressions"
              element={
                <PortalLayout>
                  <RegressionInsightClient />
                </PortalLayout>
              }
            />
            <Route
              path="/alerts/live"
              element={
                <PortalLayout>
                  <MonitoringRealtimeClient
                    title="실시간 알림"
                    description="임계치 평가로 생성된 알림을 확인합니다."
                    variant="alerts"
                  />
                </PortalLayout>
              }
            />
            <Route
              path="/alerts/history"
              element={
                <PortalLayout>
                  <MonitoringRealtimeClient
                    title="알림 이력"
                    description="처리된 알림 이력을 조회합니다."
                    variant="alerts"
                  />
                </PortalLayout>
              }
            />
            <Route
              path="/admin/db-instances"
              element={
                <PortalLayout>
                  <DbInstanceManagementClient />
                </PortalLayout>
              }
            />
            <Route
              path="/admin/threshold-policies"
              element={
                <PortalLayout>
                  <ThresholdPolicyManagementClient />
                </PortalLayout>
              }
            />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </PortalSidebarProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;