# Session Handoff

Last updated: 2026-05-28 KST

이 문서는 같은 Cursor 계정으로 여러 PC에서 작업을 이어가기 위한 인수인계 문서입니다. Cursor 채팅이 PC 간 자동 동기화된다고 가정하지 말고, GitHub의 코드 상태와 이 문서를 기준으로 이어갑니다.

## 저장소

- GitHub: https://github.com/Keunsan/dbmonitoring.git
- 브랜치: `main`

처음 받을 때:

```bash
git clone https://github.com/Keunsan/dbmonitoring.git
```

이미 클론한 PC에서는 `git pull`만 하면 됩니다.

## 다른 PC에서 이어가기

1. 저장소를 최신 상태로 맞춥니다 (`git clone` 또는 `git pull`).
2. Cursor에서 저장소를 열고 `docs/session-handoff.md`를 확인합니다.
3. 새 채팅에서 아래 문장을 사용합니다.

```text
docs/session-handoff.md 문서를 기준으로 현재 작업을 이어서 진행해줘.
먼저 git status를 확인하고, 이 문서와 실제 repo 상태가 다른 부분이 있으면 알려줘.
그 다음 현재 목표, 남은 작업, 다음에 수정해야 할 파일을 요약해줘.
```

## 현재 프로젝트 상태

- Framework: Next.js `16.2.6`, React `19.2.4`
- Styling/UI: Tailwind CSS `4`, Shadcn/ui
- Lint: ESLint `9` + `eslint-config-next` `16.2.6` (Next/TS 규칙 기반)
- **T-001~T-008 완료**, **T-011~T-023 완료**, **T-025~T-036 내부 테스트용 MVP 완료**
- MSSQL 수집기는 QPS/TPS, 세션 집계, DB 파일/파일그룹, 테이블 크기 지표까지 확장됨
- Azure SQL 수집기는 더 이상 단순 스텁이 아니며 MSSQL 호환 DMV + `sys.dm_db_resource_stats` 기반 주요 리소스 지표를 수집함
- Phase 2 인증/RBAC, Supabase 영구 저장 전환, 메신저 실제 발송 연동은 보류
- 폴더 구조: [T-005_folder-structure.md](./T-005_folder-structure.md)
- 공통 UI 레이아웃: [T-006_common-ui-layout.md](./T-006_common-ui-layout.md)
- API 응답 규약: [T-007_api-contract.md](./T-007_api-contract.md)
- 환경 변수·시크릿: [T-008_environment-secrets.md](./T-008_environment-secrets.md)
- 업무 시스템 마스터: [T-011_business-system-master.md](./T-011_business-system-master.md)
- DB 인스턴스 관리: [T-012_db-instance-management.md](./T-012_db-instance-management.md)
- 수집 설정: [T-013_collection-settings.md](./T-013_collection-settings.md)
- Collector 어댑터: [T-014_collector-adapter-interface.md](./T-014_collector-adapter-interface.md)
- MSSQL Collector: [T-015_mssql-agentless-collector.md](./T-015_mssql-agentless-collector.md)
- Collector 실행 엔진: [T-016_collector-scheduler-engine.md](./T-016_collector-scheduler-engine.md)
- Oracle 스텁/Azure SQL 수집기: [T-017_oracle-collector-stub.md](./T-017_oracle-collector-stub.md), [T-018_azure-sql-collector-stub.md](./T-018_azure-sql-collector-stub.md)
- 운영 DB/시계열/정규화: [T-019_operational-schema-migration.md](./T-019_operational-schema-migration.md), [T-020_metric-history-storage.md](./T-020_metric-history-storage.md), [T-021_session-sql-lock-normalization.md](./T-021_session-sql-lock-normalization.md)
- Health API: `GET /api/health` — `{ data, error, meta }` + `requestId` 형식
- Collector API: `POST /api/collector/run`, `GET /api/collector/status`
- Monitoring API: `GET /api/monitoring/{runs,metrics,sessions,sql}`
- Alert/Policy API: `GET/POST /api/threshold-policies`, `POST /api/alerts/evaluate`, `GET /api/alerts`
- Phase 7 화면: `/dashboard`, `/monitoring/*`, `/analysis/top-sql`, `/alerts/*`, `/admin/threshold-policies`
- 포털 AppShell: `components/layout/*`, `/dashboard`, `/admin/db-instances`

## 최근 완료한 주요 작업

### MSSQL 모니터링 확장

- `services/collector/adapters/mssql/index.ts`
  - `Batch Requests/sec`, `Transactions/sec`, `Log Flushes/sec`는 누적 카운터 원값이 아니라 1초 샘플링 delta로 계산
  - 세션 총계/활성/슬리핑/차단 세션 집계 추가
  - 데이터 파일, 파일그룹 사용률, 테이블별 크기/row count 수집 추가
  - SQL 메모리 프로세스 지표는 유효한 숫자일 때만 `server.memory.used_percent`로 저장
- `lib/monitoring/metric-keys.ts`, `lib/monitoring/resource-summary.ts`, `lib/monitoring/metric-details.ts`
  - 신규 지표 키와 요약/상세 추출 로직 추가
- `components/features/monitoring/ThroughputSessionCards.tsx`, `DbStoragePanels.tsx`, `MonitoringRealtimeClient.tsx`
  - TPS/QPS/로그 flush, 세션, 파일/파일그룹/테이블 사용량 표시 추가

### Azure SQL 수집기 확장

- `services/collector/adapters/azure-sql/index.ts`
  - 기존 스텁 대신 MSSQL 호환 어댑터를 재사용해 세션/락/SQL/일부 DMV 지표 수집
  - `sys.dm_db_resource_stats`에서 CPU, 메모리, Data IO, Log Write, 스토리지 사용량 수집
  - Azure SQL에서는 `dm_db_resource_stats`의 CPU/메모리/IO/스토리지 값을 우선하도록 병합 로직 수정
  - `server.memory.used_percent`가 MSSQL 호환 경로에서 빈 값으로 먼저 들어와 Azure 메모리 사용률을 막던 문제 수정
- `lib/monitoring/metric-keys.ts`
  - `server.azure.data_io.used_percent`, `server.azure.log_write.used_percent` 추가
- 관련 문서 갱신
  - [T-018_azure-sql-collector-stub.md](./T-018_azure-sql-collector-stub.md)
  - [development-plan.md](./development-plan.md)
  - [T-003_architecture.md](./T-003_architecture.md)
  - [T-014_collector-adapter-interface.md](./T-014_collector-adapter-interface.md)
  - [T-012_db-instance-management.md](./T-012_db-instance-management.md)

### 화면/레이아웃 개선

- `components/layout/AppShell.tsx`
  - 포털 전체 높이를 viewport 안에 고정하고 내부 콘텐츠가 스크롤되도록 조정
- `components/features/monitoring/MonitoringRealtimeClient.tsx`
  - 실시간/세션/SQL 목록이 페이지 전체를 밀지 않고 컴포넌트 내부에서 스크롤되도록 변경
- `components/features/admin/DbInstanceManagementClient.tsx`
  - DB 인스턴스 관리 하단 업무 시스템/DB 인스턴스 목록이 보이도록 내부 스크롤 적용
- `components/layout/PageHeader.tsx`, `components/ui/card.tsx`, `components/ui/table.tsx`
  - 포털 전반의 여백과 카드/테이블 밀도를 줄임

### 알림/대시보드 확인

- 대시보드의 `미확인 알림`은 `/api/alerts` 응답 중 `status === "NEW"`인 알림 개수임
- 알림 이벤트는 인메모리, **평가 입력 데이터**(지표/세션/SQL/Blocking)는 Supabase 설정 시 운영 저장소 기준

### 운영 저장소 전환 + Phase 8 (2026-05-28)

- `supabase/migrations/202605281200_operational_storage_phase8.sql` — session 확장, plan/regression 테이블
- `services/storage/memory-store.ts`, `supabase-store.ts`, `store.ts`(facade)
- 모니터링 API·알림 평가 입력을 async Supabase 조회로 전환
- Phase 8:
  - `/analysis/sql/[sqlId]` — SQL 상세 (T-038)
  - `/analysis/plan-changes` — 실행 계획 변경 분석 (T-039)
  - `/analysis/regressions` — 성능 회귀 탐지 (T-040)
  - Top SQL 목록에서 SQL ID → 상세 링크
  - Collector 성공 후 `detectSqlRegressions` 자동 실행

## 현재 목표

- Supabase 프로젝트에 `202605281200_operational_storage_phase8.sql` 마이그레이션 적용
- Collector 실행 후 서버 재시작해도 대시보드/Top SQL/회귀 데이터가 유지되는지 확인
- 그 다음 작업 후보:
  - **T-041**: 이슈 관리 (회귀 `issueCandidate` → 실제 이슈 생성)
  - SSO/RBAC + RLS
  - 메신저 발송 API 연동
  - retention/cleanup job

## Git 상태 (2026-05-28)

- 브랜치: `main`
- 이 문서 수정 직전 `git status --short` 출력 없음
- `.next/` 빌드 산출물이 보이면 커밋 대상에서 제외하고, 필요 시 `.gitignore` 상태를 먼저 확인

## 실행한 명령과 결과

- `npm install` — 성공
- `npx eslint "components/layout" "components/shared" "app/(portal)"` — 성공
- `npm run lint` — 성공
- `npm run build` — 성공
- T-007 후 `npm run lint`, `npm run build` — 성공
- T-008 후 `npm run lint`, `npm run build` — 성공
- T-011~T-013 후 `npm run lint`, `npm run build` — 성공
- T-014~T-021 후 `npm run lint` — 성공
- `POST /api/collector/run` (`db_erp_test`) — 성공, 지표 8건/세션 29건/SQL 20건 적재 확인
- Phase 6~7 MVP 후 `npm run lint`, `npm run build` — 성공
- MSSQL 추가 지표 및 Azure SQL 수집기 확장 후 `npm run lint` — 성공
- MSSQL 추가 지표 및 Azure SQL 수집기 확장 후 `npm run build` — 성공
- Azure SQL 메모리 병합 로직 수정 후 `npm run lint` — 성공

## 남은 작업과 다음 단계

1. Azure SQL 인스턴스에서 `POST /api/collector/run` 실행 후 `server.memory.used_percent`가 적재되는지 확인
2. Azure SQL DB가 막 생성되었거나 부하가 없으면 `sys.dm_db_resource_stats`가 비어 있을 수 있으므로 몇 분 뒤 재시도
3. 필요 시 Azure SQL 계정에 `VIEW DATABASE STATE` 권한이 있는지 확인
4. Supabase 마이그레이션 적용 후 `POST /api/collector/run` → DB row 저장 및 재시작 유지 확인
5. `/analysis/plan-changes`, `/analysis/regressions` 화면에서 Azure/MSSQL 인스턴스 데이터 확인
6. **T-041** 이슈 관리 착수
7. 보류 항목: SSO/RBAC, 메신저 발송 API, retention job

## 주의할 점

- `services/`는 React·클라이언트에서 import 금지
- 실제 `.env.local` 값은 문서/로그/커밋에 남기지 않음
- DB·SSO 미연동 — Health API의 `db`는 환경 변수 설정 상태만 표시
- 수집 결과 저장은 Supabase 설정 시 운영 DB, 미설정 시 memory fallback (`services/storage/store.ts`)
- Supabase 마이그레이션(`202605270001`, `202605281200`)은 프로젝트에 반영 후 **Supabase에 직접 적용** 필요
- T-010 보류로 DB 관리 API의 역할별 권한 검증은 아직 미적용
- Oracle Collector는 공통 인터페이스 스텁이며 실제 연결은 미구현
- Azure SQL은 SQL 연결 기반 수집만 구현됨. Azure Monitor API, Resource Graph, AAD 인증은 아직 범위 밖
- Azure SQL 메모리는 `sys.dm_db_resource_stats.avg_memory_usage_percent`를 우선 사용함. 화면에서 `미수집`이면 수집 결과에 해당 metric이 없는지 먼저 확인

## 유용한 명령

```bash
npm run dev
npm run build
npm run lint
```



이 프로젝트(dbmonitoring)는 회사망 ePrism SSL(WQNC) HTTPS 검사 때문에
Node.js에서 Supabase 접속 시 SELF_SIGNED_CERT_IN_CHAIN 오류가 납니다.
다른 노트북(Windows)에서 동일하게 개발할 수 있도록 아래를 진행해 주세요.
1. Windows 인증서 저장소에서 ePrism SSL 루트 CA 찾기
   - certmgr.msc → 신뢰할 수 있는 루트 인증 기관
   - Subject: CN=ePrsim SSL, O=WQNC, C=KR
   - 또는 PowerShell:
     Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match 'ePrsim|WQNC' }
2. certs/corp-ca.pem 생성 (프로젝트 루트)
   - PEM 형식으로 저장 (Git에는 *.pem이 ignore됨)
3. package.json의 dev 스크립트가 아래인지 확인:
   "dev": "cross-env NODE_EXTRA_CA_CERTS=./certs/corp-ca.pem next dev"
   - cross-env가 없으면 npm install 후 dev 스크립트 반영
4. 검증
   - $env:NODE_EXTRA_CA_CERTS = "<프로젝트절대경로>/certs/corp-ca.pem"
   - node -e "fetch('https://tycbicshfxiyrxqmxrvc.supabase.co').then(r=>console.log('OK',r.status)).catch(e=>console.error('FAIL',e.cause?.code||e.message))"
     → OK 404 이면 성공
   - npm run dev 후 /api/monitoring/summary 가 200인지 확인
.env.local은 Supabase URL/키만 맞으면 됩니다. NODE_TLS_REJECT_UNAUTHORIZED=0 은 사용하지 마세요.
