# Session Handoff

Last updated: 2026-11-26 KST

## 저장소

- GitHub: https://github.com/Keunsan/dbmonitoring.git
- 브랜치: `main`

## 현재 목표

**R3~R6 1차 착수 완료** — 백엔드 네이티브 API·Collector·프론트 Vite 라우팅·배포 스켈레톤.

| 항목 | 상태 |
|------|------|
| R1/R2 | GET 전면 + 쓰기 핵심(db-instances, threshold, collector, alerts evaluate/ack) — business-systems CRUD·connection-secret **잔여** |
| R3 | Python Collector·스케줄러·`collector/run|status`·E2E pytest ☑ |
| R4 | Vite AppShell·전 포털 라우트·60초 polling·proxy `/api`→`v1`·`npm run build` ☑ |
| R5 | 매트릭스·문서 갱신 — **Next `app/` 제거 보류** (§8.3) |
| R6 | Dockerfile·compose·`.gitlab-ci.yml`·`gitops/` README only — Harbor/Fleet **미적용** |
| 미커밋 | 사용자 커밋 요청 시 반영 |

## 로컬 실행

1. `cd backend && uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → :5173 (**주 UI**)
3. (비교) `npm run dev` :3000 — R5 컷오버 전까지
4. Worker: `python -m app.worker.collector` (선택)

## 정책

- 수집·UI: **60초** (DEC-08)
- 외부 알림 없음 (DEC-07)

## VM 후 할 일

`gitops/README.md` · `DEPLOYMENT_PROMPT.md` 적용, Harbor/Fleet 승인 후 배포.

## 테스트

```bash
cd backend && pytest -q
cd frontend && npm run lint && npm run build
```

## 인수 프롬프트

```text
docs/session-handoff.md 기준으로 R5 컷오버(Next 아카이브) 또는 R1/R2 잔여 API부터 이어줘.
```