# Python MSSQL 어댑터 — `04_db_collection_items.md` 갭 (2026-11-26)

## 구현됨 (P0-A 최소 보완)

| 영역 | 항목 | 비고 |
|------|------|------|
| 2.3 리소스 | User Connections, PLE, blocked, MGP, Batch/Txn + **CPU·메모리·스토리지·Temp·세션 집계**(dmv) | 디스크 IOPS·latency 상세는 미구현 |
| 2.4 세션 | dm_exec_sessions/requests Top 200, blocking_session_id, sql_hash | DB 등록 필터( databaseName ) 미적용 |
| 2.5 락 | blocking_snapshot (dm_exec_requests + tran_locks) | Deadlock graph·Extended Events 없음 |
| SQL 성능 | dm_exec_query_stats Top 20 | **plan snapshot Top10** 수집·저장 (회귀 탐지 API 1차) |
| 저장 | `save_collector_run` → MSSQL/Supabase write | memory는 개발 전용 |

## 미구현 (운영 DB 검증·후속)

- 가용성 probe(응답시간·DB 상태) 별도 메트릭 키
- CPU ring buffer, 스토리지·Temp·로그 용량 DMV
- Deadlock 수집(시스템 health / XE)
- 실행 계획 스냅샷·회귀 탐지(R3-5)
- Oracle·Azure SQL AS-IS 수준 1:1 (스텁 유지)
- 계정·보안·리포트 집계 항목(문서 §3~§5)

**검증**: MSSQL `MSSQL_*` 설정 후 `POST /api/v1/collector/run` → `GET /api/v1/monitoring/summary` 필드가 Next AS-IS와 동등한지 `CONTRACT_LEGACY_BASE_URL` 계약 테스트로 확인.