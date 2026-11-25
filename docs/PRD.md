
# PRD - 통합 DB 모니터링 및 성능 분석 시스템

## 1. 프로젝트 개요

### 1.1 프로젝트명
통합 DB 모니터링 및 성능 분석 시스템

### 1.2 프로젝트 목적
여러 업무 시스템의 데이터베이스를 **한 포털에서 상시 관제**하여 **운영 연속성**을 확보하고, 시스템별 화면·로직 개발·배포와 **병행**할 수 있는 DB 안정성 기반을 제공한다.  
이를 위해 MSSQL, Oracle, Azure SQL Database 등 이기종 DB 환경을 통합 모니터링하고, 사용자 체감 장애로 이어질 수 있는 징후(부하·Lock·Blocking·Wait 등)를 운영자가 **포털 화면**으로 인지·분석할 수 있게 한다. 성능 분석·SQL 튜닝·보안 점검·이슈 대응 표준화는 그 위에 단계적으로 고도화한다.

상세 목적 정의: [SYSTEM_PURPOSE.md](./SYSTEM_PURPOSE.md)

### 1.3 추진 배경
- 여러 시스템 운영·개발을 동시에 맡는 환경에서 DBMS별 **도구·관측 경로 분산**
- 아침/퇴근 등 **고정 점검 루틴 없이** 상시 모니터링이 필요함
- 장애 **징후**를 일상적으로 보기 어려움 (장애 **후** 대응에 치우침)
- SQL 성능 이력·실행 계획 이력이 시스템 단위로 흩어짐
- 권한 및 보안 감사 어려움
- 장애 대응 및 이슈 관리 비표준화

### 1.4 프로젝트 목표
- 이기종 DB **통합 관제·관측성** 확보
- 상시 수집·화면 기반 인지 (외부 알림 채널은 필요 시 후속 — [SYSTEM_PURPOSE.md](./SYSTEM_PURPOSE.md) §5.1)
- SQL 성능 이력 기반 분석 체계 구축
- 실행 계획 변경 및 성능 회귀 탐지
- 계정/권한/접속 이력 기반 보안 강화
- 리포트 및 운영 표준화

---

# 2. 사용자 정의

| 사용자 유형 | 주요 역할 |
|---|---|
| DBA 관리자 | 성능 분석, SQL 튜닝, 장애 대응 |
| 시스템 운영자 | 업무 DB 상태 확인 및 이슈 대응 |
| 개발자 | 문제 SQL 분석 및 개선 확인 |
| 보안 담당자 | 계정, 권한, 접속 이력 감사 |
| 시스템 관리자 | 사용자/권한/정책/메뉴 관리 |
| 조회 사용자 | 대시보드 및 리포트 조회 |

---

# 3. 핵심 기능 정의

## 3.1 통합 대시보드
### 주요 기능
- 전체 DB 상태 요약
- 정상/주의/경고/장애 상태 표시
- DBMS별 상태 분포
- 업무 시스템별 위험도
- 최근 알림 및 미처리 이슈
- CPU/I/O/세션 Top-N
- Blocking/Deadlock 현황

### 우선순위
필수

---

## 3.2 DB 인스턴스 관리
### 주요 기능
- DBMS 유형 등록
- 호스트/포트/서비스 등록
- 업무 시스템 매핑
- 수집 주기 설정
- 연결 테스트
- 수집 활성화 관리

### 우선순위
필수

---

## 3.3 실시간 성능 모니터링
### 주요 기능
- CPU 사용률
- 메모리 사용률
- Disk I/O
- Network I/O
- Active Session
- TPS/Batch Request
- Temp/Log 사용률
- Wait 분석

### 우선순위
필수

---

## 3.4 세션 및 Blocking 분석
### 주요 기능
- 현재 실행 SQL 조회
- Blocking Tree 시각화
- Wait Type/Event 표시
- 장시간 세션 탐지
- 세션 종료 기능(권한 기반)

### 우선순위
필수

---

## 3.5 SQL 성능 분석
### 주요 기능
- Top SQL 조회
- 실행 시간 추이
- CPU/I/O 분석
- Query Hash 기반 집계
- 실행 계획 변경 분석
- 성능 회귀 탐지
- 개선 권고 제시

### 우선순위
필수 ~ 중요

---

## 3.6 보안 및 권한 모니터링
### 주요 기능
- 장기 미사용 계정 탐지
- 관리자 권한 보유 계정 식별
- 권한 변경 이력
- 로그인 실패 탐지
- 비정상 접속 탐지
- Azure SQL 보안 설정 점검

### 우선순위
중요

---

## 3.7 알림 및 이슈 관리
### 주요 기능
- 임계치 기반 알림
- 이벤트 기반 알림
- Teams/Slack/Email 연동
- 이슈 자동 생성
- 담당자 배정
- 조치 이력 관리

### 우선순위
필수

---

## 3.8 리포트
### 주요 기능
- 일간/주간/월간 리포트
- Top SQL 리포트
- 장애 리포트
- 보안 점검 리포트
- PDF/Excel 다운로드

### 우선순위
중요

---

# 4. 화면 구성

## 4.1 메뉴 구조

### 대시보드
- 통합 현황
- 업무 시스템별 현황
- DBMS별 현황
- 개인 대시보드

### 실시간 모니터링
- DB 실시간 현황
- 세션 모니터링
- Blocking
- Deadlock
- Wait 분석

### 성능 분석
- 성능 추이
- 피크 분석
- Top SQL
- SQL 상세 분석
- 실행 계획 분석
- 성능 회귀 탐지

### 보안 및 운영
- 계정 현황
- 권한 현황
- 로그인 실패
- 보안 이벤트

### 알림 및 이슈
- 실시간 알림
- 알림 이력
- 이슈 목록
- 이슈 상세

### 시스템 관리
- 사용자 관리
- 역할 관리
- DB 인스턴스 관리
- 임계치 정책 관리
- 감사 로그

---

# 5. 주요 화면 상세

## 5.1 통합 현황 대시보드
### 주요 위젯
- 전체 DB 상태 카드
- DBMS별 상태 분포
- CPU Top-N
- I/O Top-N
- Long Query Top-N
- Blocking 현황
- Deadlock 현황
- 최근 알림
- 미처리 이슈

### 주요 액션
- DB 상세 이동
- 알림 상세 이동
- 이슈 상세 이동

---

## 5.2 DB 실시간 현황
### 주요 정보
- CPU
- Memory
- Disk I/O
- Session
- Active Session
- Wait
- Log 사용률
- Temp 사용률

### 주요 그래프
- CPU 추이
- I/O 추이
- Wait 추이
- Session 추이

---

## 5.3 SQL 상세 분석
### 주요 정보
- SQL Text
- SQL ID
- 실행 횟수
- CPU/I/O 추이
- Wait 추이
- 실행 계획 목록
- 성능 변화율
- 개선 권고

---

## 5.4 이슈 상세 화면
### 주요 정보
- 이슈 상태
- 관련 SQL
- 관련 세션
- 관련 지표
- 원인 후보
- 조치 이력
- 첨부 파일

---

# 6. 시스템 아키텍처

## 6.1 전체 구조

```text
DB(MSSQL/Oracle/Azure SQL)
        ↓
수집 Agent / API / Agentless
        ↓
수집 서버
        ↓
메시지 큐 / 처리 엔진
        ↓
시계열 저장소 + 운영 DB
        ↓
분석 엔진
        ↓
웹 대시보드
```

---

## 6.2 아키텍처 구성 요소

| 구성 요소 | 설명 |
|---|---|
| Collector | DB 성능/세션/보안 데이터 수집 |
| Processing Engine | 정규화 및 이벤트 생성 |
| Alert Engine | 임계치/이상 탐지 |
| Analysis Engine | SQL 성능 분석 |
| API Server | 프론트엔드 API 제공 |
| Frontend | 운영 포털 UI |
| Storage | 시계열 및 운영 데이터 저장 |

---

# 7. 기술 스택

## 7.1 Frontend
| 항목 | 기술 |
|---|---|
| Framework | Next.js 16 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI Component | Shadcn/ui |
| State | Zustand / React Query |
| Chart | ECharts 또는 Recharts |
| Lint | ESLint (Next/TS 규칙 기반) |

## 7.2 Backend
| 항목 | 기술 |
|---|---|
| Runtime | Node.js |
| Framework | Next.js 16 App Router |
| API | Route Handlers 기반 REST API + 필요 시 SSE/WebSocket |
| Auth | JWT + SSO |
| Queue | Redis / BullMQ |

## 7.3 Database
| 용도 | 기술 |
|---|---|
| 운영 DB | PostgreSQL |
| 시계열 저장 | TimescaleDB |
| 캐시 | Redis |

## 7.4 Infra
| 항목 | 기술 |
|---|---|
| Container | Docker |
| Orchestration | Kubernetes |
| Monitoring | Prometheus + Grafana |
| CI/CD | GitHub Actions |

---

# 8. 데이터 모델

## 8.1 주요 엔티티

### DB_INSTANCE
| 컬럼 | 설명 |
|---|---|
| id | PK |
| dbms_type | MSSQL/Oracle/AzureSQL |
| host | 호스트 |
| port | 포트 |
| service_name | 서비스명 |
| business_system_id | 업무 시스템 |
| importance | 중요도 |
| collector_type | Agent/API |

---

### METRIC_HISTORY
| 컬럼 | 설명 |
|---|---|
| id | PK |
| db_instance_id | DB ID |
| metric_name | 지표명 |
| metric_value | 값 |
| metric_time | 수집 시각 |

---

### SQL_PERFORMANCE
| 컬럼 | 설명 |
|---|---|
| sql_id | SQL 식별자 |
| query_hash | Query Hash |
| avg_elapsed_ms | 평균 수행시간 |
| cpu_ms | CPU 사용량 |
| logical_reads | Logical Read |
| plan_id | 실행 계획 ID |

---

### SESSION_SNAPSHOT
| 컬럼 | 설명 |
|---|---|
| session_id | 세션 ID |
| status | 상태 |
| wait_name | Wait |
| blocking_session_id | Blocking ID |
| elapsed_ms | 수행 시간 |

---

### ALERT_EVENT
| 컬럼 | 설명 |
|---|---|
| alert_type | 알림 유형 |
| severity | 심각도 |
| current_value | 현재값 |
| threshold | 임계치 |
| status | 처리 상태 |

---

### ISSUE
| 컬럼 | 설명 |
|---|---|
| issue_no | 이슈 번호 |
| title | 제목 |
| assignee | 담당자 |
| status | 상태 |
| created_at | 생성일 |

---

# 9. 권한 모델

| 역할 | 권한 |
|---|---|
| 시스템 관리자 | 전체 권한 |
| DBA 관리자 | 성능 분석 및 운영 |
| 업무 운영자 | 담당 업무 DB 조회 |
| 개발자 | SQL 분석 조회 |
| 보안 담당자 | 보안 감사 조회 |
| 조회 사용자 | 읽기 전용 |

---

# 10. 비기능 요구사항

## 성능
- 실시간 대시보드 3초 이내 응답
- 대량 SQL 조회 페이징 제공
- WebSocket 기반 실시간 업데이트

## 보안
- DB 계정 정보 암호화 저장
- RBAC 기반 접근 제어
- SQL Text 마스킹
- 감사 로그 저장
- Secure Coding 적용

## 확장성
- 신규 DBMS 확장 가능
- Collector 수평 확장 가능
- 알림 채널 추가 가능

## 안정성
- 수집 실패 재시도
- 메시지 버퍼링
- 장애 시 로그 추적 가능

---

# 11. 데이터 보관 정책

| 데이터 유형 | 보관 기간 |
|---|---|
| 초 단위 성능 데이터 | 7~30일 |
| 분 단위 집계 | 3~12개월 |
| SQL 성능 이력 | 6개월 이상 |
| 알림 이력 | 1년 이상 |
| 보안 감사 이력 | 1년 이상 |

---

# 12. 연계 시스템

- Azure Monitor
- Azure Resource Graph
- Email 서버
- Teams / Slack
- 사내 SSO / AD
- ITSM 시스템
- CMDB

---

# 13. 구축 단계

## 1차 구축
- 실시간 모니터링
- 세션/Blocking
- Top SQL
- 기본 알림
- 사용자 권한 관리

## 2차 구축
- 실행 계획 분석
- 이슈 관리
- 리포트
- 성능 회귀 탐지

## 3차 구축
- 보안 분석
- AI 기반 이상 탐지
- 자동 개선 권고
- 용량 예측

---

# 14. 운영 정책

## 수집 정책
- 실시간: 5~60초
- SQL 집계: 1~5분
- 계정 정보: 1일 1회

## 알림 정책
- 중복 억제 지원
- 재알림 주기 설정
- 담당자 및 대체 담당자 지정

---

# 15. 성공 지표(KPI)

| KPI | 목표 |
|---|---|
| 장애 탐지 시간 | 5분 이내 |
| 장애 분석 시간 | 50% 단축 |
| SQL 성능 분석 시간 | 70% 단축 |
| 미처리 장애 감소율 | 30% 이상 |
| 운영 자동화율 | 60% 이상 |

---

# 16. 향후 확장 방향

- PostgreSQL/MySQL 지원
- AI 기반 장애 요약
- 자연어 기반 성능 질의
- 자동 튜닝 권고
- APM 연계
- CMDB 영향도 분석
- 예측 기반 Capacity Planning

