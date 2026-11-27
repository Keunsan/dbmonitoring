# 수동 E2E (§8.2) — 로컬 runbook

1. `cd backend && uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → http://localhost:5174
3. DB 인스턴스 관리 → 연결 테스트
4. Collector 실행 → monitoring/summary 갱신 확인
5. 임계치 evaluate → /alerts/live → ack

## 자동 검증 (메모리)

```bash
cd backend && pytest -q
cd frontend && npm run lint && npm run build
```

## 수동 체크리스트 (2026-11-26)

| # | 항목 | 결과 | 메모 |
|---|------|------|------|
| 1 | 인스턴스 등록·연결 테스트 | ☑ | ERP·WIMS `test-connection` 17:05 KST |
| 2 | collector/run → summary | ☑ | 단일·전체 run + summary 16건 (`_session_gate_smoke.py`) |
| 3 | threshold evaluate → ack | ☑ | Vite `/alerts/live` 확인 버튼 + pytest R3 |
| 4 | Top SQL → sql 상세 | ☑ | :5174 `/analysis/sql/:sqlId?dbInstanceId=` (2026-11-27) |
| 5 | 인스턴스 삭제 purge | ☑ | `purge_db_instance_data.py` (MSSQL) |

## 계약 테스트 (Next :3000 병행 시)

```bash
# 터미널: npm run dev (루트) + backend
set CONTRACT_LEGACY_BASE_URL=http://127.0.0.1:3000
cd backend && pytest -q tests/test_contract_legacy.py tests/test_r1_read_apis.py -k contract
```