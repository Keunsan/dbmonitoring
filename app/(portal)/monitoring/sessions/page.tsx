/** 실시간 세션 모니터링 화면입니다. */

import { MonitoringRealtimeClient } from "@/components/features/monitoring/MonitoringRealtimeClient";

const SessionsMonitoringPage = () => (
  <MonitoringRealtimeClient
    title="실시간 세션"
    description="스케줄러가 저장한 최신 스냅샷을 10초마다 조회합니다. 즉시 수집은 상단 버튼을 사용하세요."
    variant="sessions"
  />
);

export default SessionsMonitoringPage;
