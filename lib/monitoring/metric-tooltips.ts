/** 모니터링 지표 툴팁에 표시할 정의·계산식·해석 문구입니다. */

import { SERVER_METRIC_KEYS } from "@/lib/monitoring/metric-keys";
import type { ResourceSummary } from "@/lib/monitoring/resource-summary";

export type MetricTooltipContent = {
  definition: string;
  formula: string;
  interpretation: string;
};

export const SESSION_TOOLTIP_KEYS = {
  sessionId: "session.column.session_id",
  loginName: "session.column.login_name",
  status: "session.column.status",
  waitMs: "session.column.wait_ms",
  blockingSessionId: "session.column.blocking_session_id",
  cpuTimeMs: "session.column.cpu_time_ms",
  logicalReads: "session.column.logical_reads",
  programDatabase: "session.column.program_database",
  sqlText: "session.column.sql_text",
} as const;

export type SessionTooltipKey =
  (typeof SESSION_TOOLTIP_KEYS)[keyof typeof SESSION_TOOLTIP_KEYS];

/** 대시보드 Top N 카드 제목 툴팁 키입니다. */
export const TOP_LIST_TOOLTIP_KEYS = {
  cpu: "dashboard.top_list.cpu",
  memory: "dashboard.top_list.memory",
  diskLatency: "dashboard.top_list.disk_latency",
  log: "dashboard.top_list.log",
} as const;

export type TopListTooltipKey =
  (typeof TOP_LIST_TOOLTIP_KEYS)[keyof typeof TOP_LIST_TOOLTIP_KEYS];

/** 통합 현황_v1 BI 차트 제목 툴팁 키입니다. */
export const BI_CHART_TOOLTIP_KEYS = {
  mdfUsage: "dashboard.bi.mdf_usage",
  ldfUsage: "dashboard.bi.ldf_usage",
  cpuMemory: "dashboard.bi.cpu_memory",
  diskIo: "dashboard.bi.disk_io",
  qpsTps: "dashboard.bi.qps_tps",
  sessionsByInstance: "dashboard.bi.sessions_by_instance",
} as const;

export type BiChartTooltipKey =
  (typeof BI_CHART_TOOLTIP_KEYS)[keyof typeof BI_CHART_TOOLTIP_KEYS];

export const resourceMetricNameBySummaryKey: Partial<
  Record<keyof ResourceSummary, string>
> = {
  cpuUsedPercent: SERVER_METRIC_KEYS.cpuUsedPercent,
  memoryUsedPercent: SERVER_METRIC_KEYS.memoryUsedPercent,
  memoryAvailableMb: SERVER_METRIC_KEYS.memoryAvailableMb,
  pageLifeExpectancy: SERVER_METRIC_KEYS.pageLifeExpectancy,
  memoryGrantsPending: SERVER_METRIC_KEYS.memoryGrantsPending,
  diskReadIops: SERVER_METRIC_KEYS.diskReadIops,
  diskWriteIops: SERVER_METRIC_KEYS.diskWriteIops,
  diskReadLatencyMs: SERVER_METRIC_KEYS.diskReadLatencyMs,
  diskWriteLatencyMs: SERVER_METRIC_KEYS.diskWriteLatencyMs,
  storageUsedPercent: "summary.storage.used_percent",
  logUsedPercent: SERVER_METRIC_KEYS.logUsedPercent,
  tempdbUsedMb: SERVER_METRIC_KEYS.tempdbUsedMb,
  batchRequestsPerSec: SERVER_METRIC_KEYS.batchRequestsPerSec,
  transactionsPerSec: SERVER_METRIC_KEYS.transactionsPerSec,
  userConnections: SERVER_METRIC_KEYS.userConnections,
  processesBlocked: SERVER_METRIC_KEYS.processesBlocked,
  sessionTotalCount: SERVER_METRIC_KEYS.sessionTotalCount,
  sessionActiveCount: SERVER_METRIC_KEYS.sessionActiveCount,
  sessionIdleCount: SERVER_METRIC_KEYS.sessionIdleCount,
  sessionRunningSqlCount: SERVER_METRIC_KEYS.sessionRunningSqlCount,
};

export const metricTooltipContent: Record<string, MetricTooltipContent> = {
  [SERVER_METRIC_KEYS.cpuUsedPercent]: {
    definition: "DB 서버 또는 Azure SQL 데이터베이스가 사용 중인 CPU 비율입니다.",
    formula:
      "MSSQL은 성능 카운터/링버퍼 값을 사용하고, Azure SQL은 avg_cpu_percent를 사용합니다.",
    interpretation:
      "85% 이상이면 부하 증가를 의심하고, 95% 이상이 지속되면 쿼리·인덱스·스케일 조정을 검토합니다.",
  },
  [SERVER_METRIC_KEYS.memoryUsedPercent]: {
    definition: "DB 엔진 또는 Azure SQL 데이터베이스의 메모리 사용률입니다.",
    formula:
      "MSSQL은 (전체 메모리 - 가용 메모리) / 전체 메모리 * 100, Azure SQL은 avg_memory_usage_percent입니다.",
    interpretation:
      "높은 값 자체보다 장시간 고정되거나 PLE 하락, 대기 증가와 함께 나타나는지를 같이 봅니다.",
  },
  [SERVER_METRIC_KEYS.memoryAvailableMb]: {
    definition: "운영체제 관점에서 즉시 사용할 수 있는 메모리 용량입니다.",
    formula: "sys.dm_os_sys_memory.available_physical_memory_kb / 1024입니다.",
    interpretation:
      "가용 메모리가 계속 줄고 CPU·IO 대기도 함께 늘면 메모리 압박 가능성이 있습니다.",
  },
  [SERVER_METRIC_KEYS.memoryTotalMb]: {
    definition: "DB 서버의 전체 물리 메모리 용량입니다.",
    formula: "sys.dm_os_sys_memory.total_physical_memory_kb / 1024입니다.",
    interpretation: "용량 기준값으로 사용하며 단독 장애 판단 지표는 아닙니다.",
  },
  [SERVER_METRIC_KEYS.pageLifeExpectancy]: {
    definition: "데이터 페이지가 버퍼 캐시에 머무르는 평균 시간입니다.",
    formula: "SQL Server Buffer Manager의 Page life expectancy 카운터 값입니다.",
    interpretation:
      "낮은 값이 지속되면 버퍼 캐시 압박이나 비효율적인 대량 읽기를 의심합니다.",
  },
  [SERVER_METRIC_KEYS.memoryGrantsPending]: {
    definition: "메모리 grant를 기다리는 쿼리 수입니다.",
    formula: "SQL Server Memory Manager의 Memory Grants Pending 카운터 값입니다.",
    interpretation:
      "0보다 큰 값이 지속되면 정렬·해시 작업 메모리 부족 또는 큰 쿼리 경합을 확인합니다.",
  },
  [SERVER_METRIC_KEYS.diskReadIops]: {
    definition: "데이터베이스 파일에서 발생한 읽기 I/O 누적 횟수입니다.",
    formula: "sys.dm_io_virtual_file_stats의 num_of_reads 합계입니다.",
    interpretation:
      "현재 구현은 누적값입니다. 증감 추이를 함께 봐야 실제 읽기 부하를 판단할 수 있습니다.",
  },
  [SERVER_METRIC_KEYS.diskWriteIops]: {
    definition: "데이터베이스 파일에서 발생한 쓰기 I/O 누적 횟수입니다.",
    formula: "sys.dm_io_virtual_file_stats의 num_of_writes 합계입니다.",
    interpretation:
      "현재 구현은 누적값입니다. 로그 쓰기·체크포인트와 함께 증가 패턴을 확인합니다.",
  },
  [SERVER_METRIC_KEYS.diskReadLatencyMs]: {
    definition: "읽기 I/O 1회당 평균 대기 시간입니다.",
    formula: "io_stall_read_ms / num_of_reads입니다.",
    interpretation:
      "20ms 이상이면 주의, 50ms 이상이 지속되면 스토리지 병목 가능성이 큽니다.",
  },
  [SERVER_METRIC_KEYS.diskWriteLatencyMs]: {
    definition: "쓰기 I/O 1회당 평균 대기 시간입니다.",
    formula: "io_stall_write_ms / num_of_writes입니다.",
    interpretation:
      "로그 쓰기 지연과 함께 높으면 트랜잭션 응답 지연으로 이어질 수 있습니다.",
  },
  [SERVER_METRIC_KEYS.azureDataIoUsedPercent]: {
    definition: "Azure SQL 서비스 계층 한도 대비 Data IO 사용률입니다.",
    formula: "sys.dm_db_resource_stats.avg_data_io_percent입니다.",
    interpretation:
      "높게 유지되면 스토리지 읽기/쓰기 한계에 가까워진 상태로 쿼리 튜닝이나 tier 조정을 검토합니다.",
  },
  [SERVER_METRIC_KEYS.azureLogWriteUsedPercent]: {
    definition: "Azure SQL 서비스 계층 한도 대비 로그 쓰기 사용률입니다.",
    formula: "sys.dm_db_resource_stats.avg_log_write_percent입니다.",
    interpretation:
      "높게 유지되면 대량 DML, 인덱스 작업, 트랜잭션 로그 병목 가능성을 확인합니다.",
  },
  [SERVER_METRIC_KEYS.storageDataUsedMb]: {
    definition: "데이터 파일에서 실제 사용 중인 공간입니다.",
    formula: "FILEPROPERTY(name, 'SpaceUsed') * 8 / 1024입니다.",
    interpretation:
      "파일 크기 대비 사용량이 계속 증가하면 증설 계획과 정리 대상을 함께 확인합니다.",
  },
  [SERVER_METRIC_KEYS.storageDataSizeMb]: {
    definition: "데이터 파일에 할당된 전체 크기입니다.",
    formula: "sys.database_files.size * 8 / 1024입니다.",
    interpretation: "할당 크기이며 실제 사용량과 다를 수 있습니다.",
  },
  "summary.storage.used_percent": {
    definition: "데이터 파일 할당량 대비 실제 데이터 사용 비율입니다.",
    formula: "데이터 사용량 / 데이터 파일 크기 * 100입니다.",
    interpretation:
      "90% 이상이면 자동 증가 설정과 디스크 여유 공간을 확인하는 것이 좋습니다.",
  },
  [SERVER_METRIC_KEYS.logUsedPercent]: {
    definition: "트랜잭션 로그 파일의 사용률입니다.",
    formula: "DBCC SQLPERF(LOGSPACE) 또는 로그 파일 사용량 / 로그 크기 * 100입니다.",
    interpretation:
      "높게 유지되면 장기 트랜잭션, 백업/복구 모델, 로그 증가 설정을 확인합니다.",
  },
  [SERVER_METRIC_KEYS.logUsedMb]: {
    definition: "트랜잭션 로그에서 사용 중인 용량입니다.",
    formula: "로그 파일 크기 * 로그 사용률 / 100입니다.",
    interpretation:
      "급증하면 대량 변경 작업이나 오래 열린 트랜잭션을 우선 확인합니다.",
  },
  [SERVER_METRIC_KEYS.tempdbUsedMb]: {
    definition: "TempDB에서 사용 중인 공간입니다.",
    formula: "TempDB 파일의 SpaceUsed 페이지 수 * 8 / 1024입니다.",
    interpretation:
      "급증하면 정렬, 해시, 임시 테이블, 버전 스토어 사용량을 확인합니다.",
  },
  [SERVER_METRIC_KEYS.batchRequestsPerSec]: {
    definition: "초당 처리된 SQL batch 요청 수입니다. 화면에서는 QPS에 해당하는 처리량 지표로 봅니다.",
    formula: "(Batch Requests/sec 현재값 - 이전값) / 샘플 간격(초)입니다.",
    interpretation:
      "서비스 요청량을 보는 지표입니다. 값 증가가 CPU·IO 상승과 함께 나타나는지 확인합니다.",
  },
  [SERVER_METRIC_KEYS.transactionsPerSec]: {
    definition: "초당 처리된 트랜잭션 수입니다.",
    formula: "(Transactions/sec 현재값 - 이전값) / 샘플 간격(초)입니다.",
    interpretation:
      "쓰기 작업이나 명시적 트랜잭션 부하를 보는 지표입니다. 0이면 샘플 구간에 트랜잭션 변화가 없었다는 뜻입니다.",
  },
  [SERVER_METRIC_KEYS.logFlushesPerSec]: {
    definition: "초당 로그 flush 횟수입니다.",
    formula: "(Log Flushes/sec 현재값 - 이전값) / 샘플 간격(초)입니다.",
    interpretation:
      "트랜잭션 로그 쓰기 빈도를 나타내며 TPS, 로그 쓰기 사용률과 함께 해석합니다.",
  },
  [SERVER_METRIC_KEYS.userConnections]: {
    definition: "현재 DB 엔진에 연결된 사용자 connection 수입니다.",
    formula: "SQL Server General Statistics의 User Connections 카운터입니다.",
    interpretation:
      "급증하면 connection pool 설정, 비정상 연결 누수, 배치 작업 여부를 확인합니다.",
  },
  [SERVER_METRIC_KEYS.processesBlocked]: {
    definition: "현재 차단 상태인 프로세스 수입니다.",
    formula: "SQL Server General Statistics의 Processes blocked 카운터입니다.",
    interpretation:
      "0보다 큰 값이 지속되면 blocking chain과 장기 트랜잭션을 확인해야 합니다.",
  },
  [SERVER_METRIC_KEYS.sessionTotalCount]: {
    definition: "수집 시점의 사용자 세션 전체 개수입니다.",
    formula: "sys.dm_exec_sessions에서 사용자 세션을 집계합니다.",
    interpretation:
      "평소 기준보다 급증하면 접속 폭주, connection pool 누수, 배치 작업을 확인합니다.",
  },
  [SERVER_METRIC_KEYS.sessionActiveCount]: {
    definition: "작업 중이거나 대기 중인 활성 세션 수입니다.",
    formula: "사용자 세션 중 sleeping이 아닌 세션 수입니다.",
    interpretation:
      "높은 값이 지속되면 현재 처리 중인 요청이 많거나 대기 경합이 있다는 신호입니다.",
  },
  [SERVER_METRIC_KEYS.sessionIdleCount]: {
    definition: "연결은 유지하지만 현재 작업하지 않는 세션 수입니다.",
    formula: "사용자 세션 중 status가 sleeping인 세션 수입니다.",
    interpretation:
      "과도하면 connection pool 크기, 미반납 연결, 유휴 timeout 설정을 확인합니다.",
  },
  [SERVER_METRIC_KEYS.sessionRunningSqlCount]: {
    definition: "현재 SQL 요청이 실행 중인 세션 수입니다.",
    formula: "sys.dm_exec_requests에 존재하는 사용자 세션 수입니다.",
    interpretation:
      "활성 세션 중 실제 실행 중인 SQL 규모를 보여주며 CPU·IO 부하와 함께 봅니다.",
  },
  [SESSION_TOOLTIP_KEYS.sessionId]: {
    definition: "DB 엔진이 각 연결에 부여한 세션 식별자입니다.",
    formula: "sys.dm_exec_sessions.session_id 값입니다.",
    interpretation: "문제 세션을 kill, trace, blocking 분석할 때 기준 키로 사용합니다.",
  },
  [SESSION_TOOLTIP_KEYS.loginName]: {
    definition: "세션을 생성한 로그인 계정입니다.",
    formula: "sys.dm_exec_sessions.login_name 값입니다.",
    interpretation:
      "특정 계정에 부하가 집중되면 해당 애플리케이션 또는 작업 계정을 확인합니다.",
  },
  [SESSION_TOOLTIP_KEYS.status]: {
    definition: "세션의 현재 상태입니다.",
    formula: "sys.dm_exec_sessions.status 값입니다.",
    interpretation:
      "running/runnable/suspended는 활동 중, sleeping은 유휴 연결로 해석합니다.",
  },
  [SESSION_TOOLTIP_KEYS.waitMs]: {
    definition: "요청이 특정 wait type에서 대기한 시간입니다.",
    formula: "sys.dm_exec_requests.wait_type과 wait_time을 표시합니다.",
    interpretation:
      "대기 시간이 길면 wait type별로 CPU, 잠금, IO, 네트워크 병목을 분리해 봅니다.",
  },
  [SESSION_TOOLTIP_KEYS.blockingSessionId]: {
    definition: "현재 세션을 막고 있는 세션 ID입니다.",
    formula: "sys.dm_exec_requests.blocking_session_id 값입니다.",
    interpretation:
      "값이 있으면 blocking chain의 원인 세션을 찾아 트랜잭션과 SQL을 확인합니다.",
  },
  [SESSION_TOOLTIP_KEYS.cpuTimeMs]: {
    definition: "현재 요청이 사용한 CPU 시간입니다.",
    formula: "sys.dm_exec_requests.cpu_time 값입니다.",
    interpretation:
      "값이 큰 세션은 CPU 비용이 높은 쿼리일 가능성이 있어 실행 계획을 확인합니다.",
  },
  [SESSION_TOOLTIP_KEYS.logicalReads]: {
    definition: "현재 요청이 읽은 논리 페이지 수입니다.",
    formula: "sys.dm_exec_requests.logical_reads 값입니다.",
    interpretation:
      "높은 값은 많은 데이터를 스캔했음을 의미하며 인덱스와 조건절을 확인합니다.",
  },
  [SESSION_TOOLTIP_KEYS.programDatabase]: {
    definition: "세션을 만든 프로그램과 접속 DB/호스트 정보입니다.",
    formula: "program_name, database_id, host_name을 조합해 표시합니다.",
    interpretation:
      "문제 세션이 어떤 애플리케이션 서버나 배치에서 왔는지 추적할 때 사용합니다.",
  },
  [SESSION_TOOLTIP_KEYS.sqlText]: {
    definition: "현재 실행 중이거나 마지막으로 확인된 SQL 텍스트입니다.",
    formula: "요청의 sql_handle에서 SQL 텍스트를 읽고 민감정보를 마스킹합니다.",
    interpretation:
      "문제 SQL을 식별하는 단서입니다. 파라미터, 실행 계획, wait와 함께 확인합니다.",
  },
  "summary.db.total_size_gb": {
    definition: "데이터베이스 MDF·LDF 파일 할당 크기의 합계입니다.",
    formula: "sys.database_files 기준 ROWS·LOG 타입 파일 size 합계를 GB로 환산합니다.",
    interpretation:
      "DB 전체 디스크 점유 규모를 파악할 때 사용합니다. 사용률과 함께 용량 증설 계획을 검토합니다.",
  },
  "summary.session.user_active_total": {
    definition: "시스템 계정 세션을 제외한 사용자 세션의 활성·전체 수입니다.",
    formula:
      "is_user_process = 1, session_id > 50 조건의 running 세션 수 / 전체 세션 수입니다.",
    interpretation:
      "동시 접속 부하를 볼 때 사용합니다. 활성 세션이 전체 대비 급증하면 장시간 실행 SQL을 확인합니다.",
  },
  "dashboard.top_list.cpu": {
    definition:
      "등록된 DB 인스턴스 중 현재 CPU 사용률이 가장 높은 순서대로 상위 5개를 표시합니다.",
    formula:
      "각 인스턴스 최신 수집값의 CPU 사용률(%)을 비교해 내림차순 정렬한 뒤 상위 5개를 선택합니다.",
    interpretation:
      "목록 상단일수록 CPU 부하가 큰 DB입니다. 85% 이상이 지속되면 쿼리·인덱스·스케일 조정을 검토합니다.",
  },
  "dashboard.top_list.memory": {
    definition:
      "등록된 DB 인스턴스 중 현재 메모리 사용률이 가장 높은 순서대로 상위 5개를 표시합니다.",
    formula:
      "각 인스턴스 최신 수집값의 메모리 사용률(%)을 비교해 내림차순 정렬한 뒤 상위 5개를 선택합니다.",
    interpretation:
      "목록 상단일수록 메모리 압박 가능성이 큽니다. PLE 하락·대기 증가와 함께 나타나는지 확인합니다.",
  },
  "dashboard.top_list.disk_latency": {
    definition:
      "등록된 DB 인스턴스 중 디스크 읽기 지연이 가장 큰 순서대로 상위 5개를 표시합니다.",
    formula:
      "각 인스턴스의 disk_read_latency_ms(읽기 I/O 1회 평균 대기)를 비교해 내림차순 정렬합니다.",
    interpretation:
      "목록 상단일수록 스토리지 읽기 병목 가능성이 큽니다. 20ms 이상 주의, 50ms 이상 지속 시 점검이 필요합니다.",
  },
  "dashboard.top_list.log": {
    definition:
      "등록된 DB 인스턴스 중 트랜잭션 로그 사용률이 가장 높은 순서대로 상위 5개를 표시합니다.",
    formula:
      "각 인스턴스 최신 수집값의 log_used_percent(%)를 비교해 내림차순 정렬한 뒤 상위 5개를 선택합니다.",
    interpretation:
      "목록 상단일수록 로그 파일 압박이 큽니다. 장기 트랜잭션, 백업 정책, 로그 증가 설정을 확인합니다.",
  },
  [BI_CHART_TOOLTIP_KEYS.mdfUsage]: {
    definition:
      "DB 인스턴스별 데이터 파일(MDF) 실사용 용량(GB)을 세로 막대 차트로 비교합니다.",
    formula:
      "수집된 metric_history·용량 스냅샷에서 MDF 사용 MB를 GB로 환산해 표시합니다. X축은 인스턴스명 순입니다.",
    interpretation:
      "막대가 클수록 데이터 파일 점유가 큽니다. 급증 시 테이블 증가·인덱스·증설 계획을 함께 확인합니다.",
  },
  [BI_CHART_TOOLTIP_KEYS.ldfUsage]: {
    definition:
      "DB 인스턴스별 트랜잭션 로그(LDF) 실사용 용량(GB)을 세로 막대 차트로 비교합니다.",
    formula:
      "수집된 로그 파일 사용 MB를 GB로 환산해 표시합니다. X축은 인스턴스명 순입니다.",
    interpretation:
      "막대가 크면 로그 파일 압박이 큽니다. 대량 DML·장기 트랜잭션·백업 정책을 점검합니다.",
  },
  [BI_CHART_TOOLTIP_KEYS.cpuMemory]: {
    definition:
      "인스턴스별 현재 CPU·메모리 사용률(%)을 나란히 비교하는 차트입니다.",
    formula:
      "최신 resource_summary의 cpu_used_percent, memory_used_percent 값을 인스턴스명 순으로 표시합니다.",
    interpretation:
      "CPU·메모리가 동시에 높으면 메모리 압박과 쿼리 부하를 함께 의심합니다. 85% 이상 지속 시 튜닝·스케일을 검토합니다.",
  },
  [BI_CHART_TOOLTIP_KEYS.diskIo]: {
    definition:
      "인스턴스별 디스크 읽기·쓰기 평균 지연(ms)을 비교하는 차트입니다.",
    formula:
      "disk_read_latency_ms, disk_write_latency_ms(읽기·쓰기 I/O 1회 평균 대기)를 인스턴스명 순으로 표시합니다.",
    interpretation:
      "읽기 지연 20ms 이상·50ms 이상 지속 시 스토리지 병목을, 쓰기 지연 상승 시 로그·체크포인트 부하를 확인합니다.",
  },
  [BI_CHART_TOOLTIP_KEYS.qpsTps]: {
    definition:
      "인스턴스별 초당 배치 요청(QPS)과 트랜잭션(TPS) 처리량을 비교하는 차트입니다.",
    formula:
      "batch_requests_per_sec(QPS), transactions_per_sec(TPS)를 샘플 간격으로 환산한 최신값을 표시합니다.",
    interpretation:
      "QPS는 요청량, TPS는 트랜잭션·쓰기 부하 지표입니다. 급증 시 CPU·IO·세션 지표와 함께 원인을 추적합니다.",
  },
  [BI_CHART_TOOLTIP_KEYS.sessionsByInstance]: {
    definition:
      "DB 인스턴스별 전체 세션 수 대비 활성·비활성 세션을 누적 세로 막대로 비교합니다.",
    formula:
      "session_total_count, session_active_count에서 활성·(전체-활성) 세션을 인스턴스명 순으로 표시합니다.",
    interpretation:
      "활성(밝은색) 비중이 크면 현재 처리·대기 중인 세션이 많습니다. 접속 폭주·장기 실행 SQL 여부를 확인합니다.",
  },
};

export const getMetricTooltipContent = (
  key: keyof ResourceSummary | string,
): MetricTooltipContent | null => {
  const metricName =
    typeof key === "string" && key in resourceMetricNameBySummaryKey
      ? resourceMetricNameBySummaryKey[key as keyof ResourceSummary]
      : key;

  return metricName ? (metricTooltipContent[metricName] ?? null) : null;
};
