# gitops (스켈레톤 only)

Harbor/Fleet **실 적용 금지** — VM 승인 후 `docs/DEPLOYMENT_PROMPT.md` 기준으로 채웁니다.

| 항목 | 값 |
|------|-----|
| 프로젝트 | `dbmonitoring` |
| APP_PORT | `8000` |
| Collector | **기본: API 프로세스 내 스케줄러** (DEC — 별도 Deployment는 주석 템플릿만) |

## VM 이후 체크리스트

- [ ] Fleet Application
- [ ] Ingress → frontend + `/api` → backend
- [ ] Secret (Supabase, MSSQL, 연결 비밀)
- [ ] (선택) Collector 별도 Deployment