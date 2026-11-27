# 다음 Agent 세션 — 복사용 프롬프트

> **전제**: dbmonitoring은 **여러 업무 시스템 × 다수 DB 인스턴스**를 등록·수집·취합해 **통합 관제**하는 시스템이다. (`docs/SYSTEM_PURPOSE.md`)

아래 ` ```text ` 블록 전체를 새 Agent 채팅에 붙여넣는다.

```text
프로젝트: dbmonitoring (c:\CURSOR_DEV\dbmonitoring)
저장소: https://github.com/Keunsan/dbmonitoring (main — 착수 시 git pull)
직전 세션(2026-11-27): P0-C E2E·계약 ☑, session sanitize, 대시보드 DMV, plan/regression 1차, Vite admin bootstrap — **대량 미커밋**

## 먼저 읽을 문서
1. docs/session-handoff.md (게이트 표·블로커)
2. docs/E2E_RUNBOOK.md, docs/COLLECTOR_MSSQL_GAP.md
3. docs/REFACTORING_PLAN.md 변경 이력 1.0~1.1
4. .cursor/rules/project-overview.mdc

## 직전 세션에서 끝낸 것 (재작업 금지)
- P0-C: 계약 12경로 pytest ☑ (Next :3000 + `error:null`·`meta` envelope), E2E #3 ack UI, E2E #4 Top SQL→상세 (:5174)
- session_snapshot: `sanitize_sql` + 행 단위 INSERT·실패 시 SQL 텍스트 NULL (ERP 단일 run SUCCESS)
- MSSQL collector: CPU·메모리·스토리지·Temp·세션 집계 DMV, plan snapshot Top10, regressions/detect 1차
- Vite: `DbInstanceAdminPage` / `ThresholdAdminPage` API bootstrap, README·docker-compose **5174**, frontend Dockerfile repo-root context
- P0-A smoke: `_session_gate_smoke.py` ☑ (16 summary, 8/16 collector SUCCESS)

## 직전 세션 잔여·블로커
- `GET /api/v1/monitoring/summary` 다건 인스턴스 시 **~30~90s** (ERP Top SQL 탐색 시 summary 병목)
- R2: Supabase 인벤토리 **write** 동등·`test_r2_inventory_writes.py` 미완
- R3: 회귀 이벤트 **MSSQL 저장** 운영 검증, plan_changes UI 데이터 연동 재확인
- 활성 Oracle/Azure → collector 스텁 FAIL(정상) — UI 스텁 안내·비활성화는 선택
- COLLECTOR_MSSQL_GAP: 디스크 IOPS·latency, ring buffer 등 AS-IS 대비 미구현
- 스케줄러: collectIntervalSec 60초 **부하 스모크** 미실시
- REFACTORING §6 매트릭스 미갱신 (Vite 라우트 대비 진행중/완료 표기)
- git commit/push: 사용자 요청 시만 (.cursor/skills/git-push/SKILL.md)

---

## 이번 세션 목표 — 1~5순위 (멈추지 말고 진행)

블로커는 docs/session-handoff.md에 남기고 다음 항목 계속.

### 1순위 — 성능·P0 운영 품질

1. `monitoring/summary` 지연 원인 프로파일 → reads 배치/캐시 또는 N+1 제거 (목표: 16건 <15s 체감)
2. Top SQL 화면: summary 대신 `/monitoring/sql`·인스턴스 필터 우선 로딩 검토
3. `_session_gate_smoke.py` + 계약 pytest 회귀 (`CONTRACT_LEGACY_BASE_URL=http://127.0.0.1:3000`)

### 2순위 — R2 인벤토리 write

- Supabase/MSSQL/memory **CRUD 동등** (다수 인스턴스 생성·수정·삭제)
- `backend/tests/test_r2_inventory_writes.py` 통과
- connection-secret·collection-settings 쓰기 경로 정합

### 3순위 — R3·Collector 잔여

- `sql_regression_event` MSSQL insert 경로 E2E (detect → GET regressions)
- 스케줄러 60초: `COLLECTOR_SCHEDULER_DISABLED=false` 로컬 스모크 (부하·중복 run 없음)
- 디스크 IOPS/latency DMV 1차 (대시보드 `ResourceMetricGrid` 소비 키 확인)
- Secret: supabase_vault RPC (선택)

### 4순위 — R5 준비 (Next 삭제 금지 §8.3)

- REFACTORING §6.1·6.2 매트릭스 — Vite에서 실제 동작 화면/API **진행중·완료** 반영
- 계약: shallow compare 확장(목록 길이·핵심 필드) 또는 경로 추가 검토

### 5순위 — 마무리

- Oracle/Azure 활성 인스턴스 UI 안내(선택)
- `cd frontend && npm run lint && npm run build`
- 사용자 요청 시 커밋·푸시

## 로컬 기동

| 서비스 | 명령 | URL |
|--------|------|-----|
| Backend | `cd backend && uvicorn app.main:app --reload --port 8000` | :8000 |
| Frontend (주 UI) | `cd frontend && npm run dev` | **:5174** |
| Next (계약) | 루트 `npm run dev` | :3000 |

참고: `127.0.0.1`이 아닌 **`localhost`** 로 Vite 접속 (Windows에서 5174 차이 있음).

## 환경 (읽기만, 로그·커밋 금지)

- 루트 `.env.local`: MSSQL_*, SECRET_PROVIDER=db_encrypted, SECRET_ENCRYPTION_KEY
- 인스턴스 vault ref → dbo.connection_secret (Next와 동일 키)

## 불변 규칙

- SSO·외부 알림·T-041~045 신규 금지 · Harbor/Fleet 금지 · polling 60초

## 세션 종료 시

1. docs/session-handoff.md, REFACTORING 변경 이력 +1
2. 요약 10줄 + 게이트 표(등록/run/summary/통과)
```

---

## 로컬 실행 (요약)

| 서비스 | 명령 | URL |
|--------|------|-----|
| Backend | `cd backend && uvicorn app.main:app --reload --port 8000` | :8000 |
| Frontend (주 UI) | `cd frontend && npm run dev` | **:5174** |
| Next (계약) | `cd .. && npm run dev` | :3000 |