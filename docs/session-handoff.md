# Session Handoff

Last updated: 2026-06-04 KST

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

---

## 현재 프로젝트 상태 (요약)

| 영역 | 상태 |
|------|------|
| Framework | Next.js `16.2.6`, React `19.2.4`, App Router |
| UI | Tailwind CSS `4`, Shadcn/ui, `next-themes` 라이트/다크 |
| 백엔드 | Route Handlers + `services/collector` 스케줄러 (`instrumentation.ts` 자동 시작) |
| 저장소 | Supabase 우선, 미설정 시 memory fallback (`services/storage/store.ts`) |
| 수집 | MSSQL·Azure SQL 실구현, Oracle 스텁 |
| MVP 화면 | 대시보드(v1/v2), 실시간 모니터링, 분석, 알림, DB/임계치 관리 |
| 보류 | SSO/RBAC, 메신저 실발송, retention job, T-041 이슈 관리 |

기준 TASK·아키텍처 문서: [development-plan.md](./development-plan.md), [04_db_collection_items.md](./04_db_collection_items.md)

---

## 데이터·수집 흐름 (운영 시 이해 필수)

```text
[instrumentation.ts] → startCollectorScheduler()
  └─ 인스턴스별 collect_interval_sec(기본 30s)마다 runCollectorForInstance (scope: full)

[화면 마운트]
  └─ GET /api/monitoring/summary (+ /api/alerts) 10초 폴링
  └─ 마운트 시 POST /api/collector/run 자동 호출 없음 (성능 개선)

[실시간 수집 실행 버튼]
  └─ 화면별 scope·대상 DB 상이 (아래 표 참고)
```

### `POST /api/collector/run` body

| 필드 | 설명 |
|------|------|
| `dbInstanceId` | 있으면 해당 인스턴스만 수집 |
| `scope` | `full`(기본) \| `sessions`(세션 전용 경량) |

구현: `app/api/collector/run/route.ts` → `services/collector/scheduler/index.ts`

---

## 화면별 수집·조회 동작 (2026-06-04 기준)

| 화면 | 수동 수집 | scope | 대상 | 수집 후 UI 갱신 | 알림 평가 |
|------|-----------|-------|------|-----------------|-----------|
| **실시간 세션** | 실시간 수집 실행 | `sessions` | 선택 DB 1개 | API 응답으로 세션·lastRun 즉시 패치 (전체 summary 생략) | 없음 |
| **DB 실시간 현황** | 실시간 수집 실행 | `full` | 선택 DB 1개 | 전체 summary + alerts 재조회 | `POST /api/alerts/evaluate` |
| 통합 현황 / v1 / v2 | 실시간 수집 실행 | `full` | **전체** 활성 인스턴스 | summary + alerts 재조회 | 있음 |
| 기타 monitoring variant | 폴링만 (버튼 없거나 동일 클라이언트) | — | — | 10초 summary 폴링 | — |

### `scope: sessions` 경량 수집 (실시간 세션 전용)

- **수집**: `collectSessions()`만 (MSSQL `dm_exec_sessions` + `dm_exec_requests` + `dm_exec_sql_text`, TOP 50)
- **저장**: `saveSessionsCollectorRun` — `collection_run` + `session_snapshot`만 (`services/storage/store.ts`)
- **제외**: metrics, locks, deadlocks, Top SQL, 실행계획, availability 선행, 회귀 탐지, 알림 평가
- **그리드 컬럼**: 세션 ID, 계정, 상태, 대기, Blkby, CPU, Reads, 프로그램/DB·호스트, Command/SQL ID/SQL 텍스트 — 모두 세션 쿼리에서 수집
- **폴링**: `GET /api/monitoring/summary?dbInstanceId={id}` 로 선택 DB만 갱신 (최초 로드는 전체 summary로 DB 선택 목록 확보)

### `scope: full` (실시간 현황·대시보드)

- 기존과 동일: availability → metrics → sessions → locks → deadlocks → sql → sqlPlans → `saveCollectorRun` → (full일 때) `detectSqlRegressions`

---

## 최근 완료한 주요 작업

### 1. 성능·데이터 흐름

- `MonitoringRealtimeClient.tsx`: 마운트/폴링 시 **`POST /api/collector/run` 제거**, `GET /api/monitoring/summary` + alerts **10초** 주기만
- 백그라운드 수집은 `instrumentation.ts` 스케줄러 + 인스턴스 `collect_interval_sec` 유지
- 메뉴 전환 지연 원인 제거 확인 (자동 수집이 병목이었음)

### 2. PageHeader·수집 UI

- `PageHeader.tsx`: `actions` / `actionsMeta` 2행 그리드 (제목 행 ↔ DB선택·버튼 정렬)
- `CollectRunButton.tsx`: 수집 중 스피너, 완료 토스트, `finally`에서 버튼 재활성
- `CollectionReferenceBar.tsx`: `layout: compact` — 헤더 우측 하단 「데이터 수집 기준」+ 시각 (11px). 대시보드 보조 문구(등록 DB N개·범위) **제거**
- `MonitoringRealtimeClient.tsx` / `DashboardBiClient.tsx`:
  - 우측: `[DB선택] [실시간 수집 실행]` / 하단: 수집 기준 시각
  - 본문 중복 제목(`{인스턴스} 서버 상태`, `{인스턴스} 실시간 세션`) **제거**

### 3. 사이드바 (고정·호버·리사이즈·아이콘)

| 파일 | 역할 |
|------|------|
| `components/layout/PortalSidebarProvider.tsx` | `SidebarProvider` + 고정·너비·호버 상태 |
| `components/layout/portal-sidebar-context.tsx` | localStorage 키·너비 clamp |
| `components/layout/AppSidebar.tsx` | 메뉴·핀 버튼 |
| `components/layout/SidebarResizeHandle.tsx` | 고정 시 우측 드래그 리사이즈 |
| `lib/constants/nav-icons.tsx` | 메뉴·그룹별 Lucide 아이콘 |

동작:

- **고정**: 항상 펼침, 우측 가장자리 드래그(약 208~400px), `dbmonitoring-sidebar-pinned` / `dbmonitoring-sidebar-width`
- **고정 해제**: 아이콘만 표시, 좌측 가장자리 호버 시 펼침 (`PortalSidebarProvider` pointermove)
- **활성 메뉴**: `/dashboard`는 exact match만 (`EXACT_MATCH_HREFS`) — v1/v2와 겹침 방지

### 4. 테마

- `components/providers/ThemeProvider.tsx`, `components/layout/ThemeToggle.tsx`, `app/layout.tsx`
- `app/globals.css` 라이트 팔레트
- `DashboardBiClient.tsx` 히트맵 라이트 모드 텍스트 대비

### 5. BI 대시보드 v1 / v2

- `app/(portal)/dashboard/v1/page.tsx`, `v2/page.tsx`
- `components/features/monitoring/DashboardBiClient.tsx` (variant `v1` | `v2`)
- 메뉴: 통합 현황_v1, 통합 현황_v2 (`lib/constants/routes.ts`)

### 6. 실시간 세션 화면 UX

- `SessionsTable`: 카드 내 헤더 고정 + 본문 스크롤 (`portal-content-canvas` flex)
- 세션 상세 Sheet, SQL 복사 토스트 등 기존 기능 유지

### 7. Collector·Storage API 확장

- `CollectorRunScope`: `full` | `sessions` (`services/collector/types.ts`)
- `runCollectorForInstance(id, { scope })` 분기 (`services/collector/scheduler/index.ts`)
- `saveSessionsCollectorRun` / `saveSessionsCollectorRunToSupabase` (`services/storage/*`)
- `GET /api/monitoring/summary?dbInstanceId=` 단일 인스턴스 요약 (`app/api/monitoring/summary/route.ts`)

### 8. 이전 세션까지 완료된 백엔드·수집 (유지)

- MSSQL: QPS/TPS delta(1초 샘플), 세션 집계, 파일/파일그룹/테이블 크기
- Azure SQL: MSSQL 호환 + `sys.dm_db_resource_stats`
- Phase 8: SQL 상세, 실행 계획 변경, 성능 회귀 (`/analysis/*`)
- Supabase operational storage 마이그레이션 (`202605281200_operational_storage_phase8.sql`)

---

## 주요 파일 맵 (빠른 탐색)

### 레이아웃·공통

- `components/layout/AppShell.tsx` — `PortalSidebarProvider` 래핑
- `components/layout/PageHeader.tsx`
- `components/layout/AppHeader.tsx`

### 실시간 모니터링

- `components/features/monitoring/MonitoringRealtimeClient.tsx` — variant별 화면·수집·폴링
- `components/features/monitoring/DashboardBiClient.tsx` — v1/v2 BI
- `components/features/monitoring/CollectRunButton.tsx`
- `components/features/monitoring/CollectionReferenceBar.tsx`
- `app/(portal)/monitoring/realtime/page.tsx`
- `app/(portal)/monitoring/sessions/page.tsx`

### Collector·API

- `services/collector/scheduler/index.ts`
- `services/collector/adapters/mssql/index.ts`
- `app/api/collector/run/route.ts`
- `app/api/monitoring/summary/route.ts`

### 메뉴

- `lib/constants/routes.ts`
- `lib/constants/nav-icons.tsx`

---

## 현재 목표

1. **실시간 세션** 경량 수집이 목표 **2초 미만**인지 운영망·Supabase 환경에서 실측 (병목: DB RTT, `session_snapshot` insert, SQL text 조회)
2. Supabase 마이그레이션 적용·재시작 후 데이터 유지 재확인
3. 미커밋 변경분 정리 후 `main` 반영 (아래 Git 참고)
4. 후속 후보: T-041 이슈 관리, SSO/RBAC, 메신저 연동, retention/cleanup

## Git 상태 (2026-06-04)

- 인수인계 시점에 **다수 로컬 변경·신규 파일이 커밋 전일 수 있음** — 반드시 `git status` / `git diff`로 확인
- 대표 신규·변경 영역: `PortalSidebarProvider*`, `nav-icons.tsx`, `CollectRunButton.tsx`, `CollectionReferenceBar.tsx`, `dashboard/v2/`, `ThemeProvider`, collector `scope`/`saveSessionsCollectorRun`, `MonitoringRealtimeClient` 수집·헤더 로직
- `.next/`는 커밋 제외

## 실행·검증 명령

```bash
npm run dev
npm run build
npm run lint
npx tsc --noEmit
```

수동 검증 체크리스트:

- [ ] 실시간 세션: DB 선택 → 실시간 수집 실행 → 그리드 전 컬럼·2초 근접 여부
- [ ] DB 실시간 현황: 선택 DB full 수집 + 지표·용량 패널 갱신
- [ ] 대시보드 v1/v2: 전체 수집 + BI 차트
- [ ] 사이드바: 고정/해제, 호버 펼침, 너비 드래그
- [ ] 라이트/다크 전환

## 남은 작업·알려진 제한

1. **실시간 세션**만 `scope: sessions` — 다른 화면에 경량 scope 적용하지 말 것 (요구사항)
2. 실시간 세션 경량 수집 시 **지표·용량·알림**은 갱신되지 않음 (스케줄러 full 수집 또는 실시간 현황 수동 수집 필요)
3. Azure SQL / Oracle 세션 경로는 DBMS별 어댑터 차이 있음 — MSSQL(ERP) 기준으로 최적화됨
4. T-010 보류: API 역할별 권한 검증 미적용
5. Phase 2: SSO/RBAC, 메신저, retention 보류

## 주의할 점

- `services/`는 React·클라이언트에서 import 금지
- `.env.local`·시크릿은 문서/커밋/로그에 남기지 않음
- Supabase 미설정 시 memory fallback — PC마다 데이터 불일치 가능
- 회사망 ePrism SSL: 아래 **Corp CA** 절차 필수 (`NODE_TLS_REJECT_UNAUTHORIZED=0` 사용 금지)

---

## 회사망 Supabase TLS (ePrism SSL / WQNC)

이 프로젝트(dbmonitoring)는 회사망 ePrism SSL(WQNC) HTTPS 검사 때문에 Node.js에서 Supabase 접속 시 `SELF_SIGNED_CERT_IN_CHAIN` 오류가 날 수 있습니다. 다른 PC(Windows)에서 동일하게 개발할 때:

1. **Windows 인증서 저장소**에서 ePrism SSL 루트 CA 찾기  
   - `certmgr.msc` → 신뢰할 수 있는 루트 인증 기관  
   - Subject: `CN=ePrsim SSL, O=WQNC, C=KR`  
   - 또는 PowerShell:  
     `Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match 'ePrsim|WQNC' }`

2. **`certs/corp-ca.pem`** 생성 (프로젝트 루트, PEM 형식, Git ignore)

3. **`package.json` dev 스크립트** 확인:  
   `"dev": "cross-env NODE_EXTRA_CA_CERTS=./certs/corp-ca.pem next dev"`  
   (`cross-env` 없으면 `npm install`)

4. **검증**  
   - `$env:NODE_EXTRA_CA_CERTS = "<프로젝트절대경로>/certs/corp-ca.pem"`  
   - `node -e "fetch('https://<project>.supabase.co').then(r=>console.log('OK',r.status)).catch(e=>console.error('FAIL',e.cause?.code||e.message))"` → `OK 404`면 성공  
   - `npm run dev` 후 `GET /api/monitoring/summary` → 200 확인

`.env.local`은 Supabase URL/키만 맞으면 됩니다.
