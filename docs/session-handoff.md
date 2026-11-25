# Session Handoff

Last updated: 2026-05-26 KST

PC 간·에이전트 인수인계 기준 문서입니다.

## 저장소

- GitHub: https://github.com/Keunsan/dbmonitoring.git
- 브랜치: `main`

```bash
git pull
```

## 현재 목표 (2026-05-26)

**Phase P0** 목적·관제 정책 확정 → **Phase R0~** TO-BE 기술 재구축 진행 중.

| 항목 | 상태 |
|------|------|
| 목적 문서 | [SYSTEM_PURPOSE.md](./SYSTEM_PURPOSE.md) — 상시 관제, 화면만, 60초 주기 |
| 재구축 계획 | [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) |
| AS-IS 운영 UI | Next.js `localhost:3000` — **계속 사용** |
| TO-BE | `backend/` FastAPI (8000), `frontend/` Vite (5173), OpenAPI 초안 |
| 레거시 프록시 | `NEXT_LEGACY_BASE_URL=http://127.0.0.1:3000` → `/api/v1/*` → Next `/api/*` |
| 배포 K8s/Harbor | **보류** (VM 대기) |
| 미커밋 | 사용자 복귀 후 커밋 요청 시 반영 |

## 로컬 실행 (3 프로세스)

1. `npm run dev` — AS-IS 포털·Collector
2. `backend/` — `uvicorn app.main:app --reload --port 8000` + `NEXT_LEGACY_BASE_URL`
3. `frontend/` — `npm run dev` (5173)

## 관제 정책 (DEC-07, DEC-08)

- 외부 알림: 없음 (화면만)
- 수집·UI polling: **60초**

## 데이터·수집 흐름 (AS-IS)

```text
[instrumentation.ts] → Collector 스케줄러 (인스턴스 collect_interval_sec, 기본 60s)
[화면] GET /api/monitoring/summary 등 — 60s polling
```

상세 TASK: [development-plan.md](./development-plan.md)

## 다음 작업 (R1~)

- [ ] Python 네이티브 읽기 API (프록시 대체): `business-systems`, `monitoring/summary` …
- [ ] OpenAPI ↔ 구현 동기화
- [ ] R3 Collector Python 포팅
- [ ] R4 Next 화면 → `frontend/` 이관

## 새 채팅 프롬프트

```text
docs/session-handoff.md와 docs/REFACTORING_PLAN.md를 기준으로 TO-BE 이관 작업을 이어줘.
git status 확인 후, R1 읽기 API 이관 또는 문서에 적힌 다음 미완 체크박스부터 진행해줘.
```

---

## 이전 요약 (참고)

- MVP 화면·Phase 8 SQL 분석은 AS-IS Next에 구현 완료
- SSO/RBAC, 외부 메신저 발송, T-041 이슈: 보류