/** DB 실시간 현황 화면입니다. */

import { MonitoringRealtimeClient } from "@/components/features/monitoring/MonitoringRealtimeClient";

const RealtimeMonitoringPage = () => (
  <MonitoringRealtimeClient
    title="DB 실시간 현황"
    description="스케줄러가 저장한 최신 스냅샷을 10초마다 조회합니다. 즉시 수집은 상단 버튼을 사용하세요."
    variant="realtime"
  />
);

export default RealtimeMonitoringPage;
