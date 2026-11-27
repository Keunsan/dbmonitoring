# Session Handoff

Last updated: 2026-11-27 KST (세션 종료)

## 저장소

- GitHub: https://github.com/Keunsan/dbmonitoring.git
- 브랜치: `main`

## 현재 목표

**P0 운영 품질 + R2/R3 잔여** — summary 지연 개선, Top SQL 분리 로딩, Supabase 인벤토리 write, §6 매트릭스 갱신.

| 항목 | 상태 |
|------|------|
| P0-A 게이트 | 16등록/2검증, smoke ☑ (`_session_gate_smoke.py` 2026-11-27 재실행) |
| summary 성능 | ☑ 16건 **~5.8s** (배치 MSSQL, 이전 ~30s) |
| Top SQL UX | ☑ `includeLatestSql=false` + `/monitoring/sql` (Vite·Next `MonitoringRealtimeClient`) |
| 디스크 IOPS/latency | ☑ Python MSSQL collector `dm_io_virtual_file_stats` 1차 |
| R2 Supabase write | ☑ `supabase_store` CRUD + facade 연동 (실 Supabase E2E는 미실시) |
| R2 메모리 테스트 | ☑ `test_r2_inventory_writes.py` |
| 계약 :3000 | ⚠ 11/12 (`metrics` MSSQL deadlock 1205 — smoke 동시 부하 시 간헐) |
| R3 regression MSSQL | 후속 — detect→GET 운영 검증 미실시 |
| 스케줄러 60s 부하 | 미실시 |
| 미커밋 | 사용자 커밋 요청 시 반영 |

### 다수 인스턴스 게이트 (2026-11-27 13:52 KST)

| 등록 | 검증 2대 (ERP/WIMS) | 단일 run | 전체 run | summary items | 통과 |
|------|---------------------|----------|----------|---------------|------|
| 16 active | `01969458…` / `8998f5de…` | SUCCESS×2 | 16 runs, 8 SUCCESS | 16 | ☑ |

**잔여 블로커**: Oracle/Azure 활성 → 스텁 FAIL(정상). 계약 `metrics` deadlock은 수집/smoke와 겹칠 때 재시도 필요. Ring buffer·XE deadlock 수집(COLLECTOR_MSSQL_GAP). Supabase write 실환경 검증. 스케줄러 `COLLECTOR_SCHEDULER_DISABLED=false` 부하 스모크.

## 로컬 실행

1. `cd backend && uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → **:5174** (주 UI, `localhost` 권장)
3. 계약/E2E 비교: 루트 `npm run dev` → :3000
4. Worker: `python -m app.worker.collector` (선택)

## 테스트

```bash
# 계약 (Next + backend 동시, smoke 직후 deadlock 주의)
set CONTRACT_LEGACY_BASE_URL=http://127.0.0.1:3000
cd backend && python -m pytest -q tests/test_contract_legacy.py

cd backend && python -m pytest -q
cd frontend && npm run lint && npm run build
python backend/scripts/_session_gate_smoke.py
```

## 인수 프롬프트

**[docs/NEXT_SESSION_PROMPT.md](./NEXT_SESSION_PROMPT.md)** — 다음: R3 regression MSSQL E2E, 스케줄러 부하 스모크, metrics deadlock 재시도, Supabase 실환경 CRUD 검증.