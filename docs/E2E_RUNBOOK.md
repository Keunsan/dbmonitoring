# 수동 E2E (§8.2) — 로컬 runbook

1. `cd backend && uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → http://localhost:5173
3. DB 인스턴스 관리 → 연결 테스트
4. Collector 실행 → monitoring/summary 갱신 확인
5. 임계치 evaluate → /alerts/live → ack

메모리 백엔드 자동 검증: `cd backend && pytest -q -k collector`