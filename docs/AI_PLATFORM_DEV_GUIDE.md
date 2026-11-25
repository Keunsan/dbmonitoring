# AI 공통 플랫폼 개발 가이드

> **적용 범위**: 본 가이드는 AI 공통 플랫폼 프레임워크(`ai-framework`)를 기반으로 신규 AI 서비스를 개발하는 **모든 개발팀**에 적용됩니다.

> **표준 풀스택 스택 (본 프로젝트)**: **프론트엔드**는 **Vite 5 + TypeScript 5 + React 18 + Tailwind CSS**로 구현하고, **백엔드(AI 인프라·API)**는 **Python**으로 구현합니다. 저장소 루트에 `frontend/`, `backend/`, `gitops/` 디렉터리를 둡니다. 이미지는 **SUSE Private Registry(Harbor)**로 Push하고, 운영 반영은 **Rancher Fleet GitOps**(RKE2)입니다. **운영 배포·CI·매니페스트 규칙**은 `DEPLOYMENT_PROMPT.md` **우선**(§2-3, §6). 상세 구조는 **§2-3**, **§3**, **§6**을 참고하세요.

> **경로 관례**: 이후 절에서 등장하는 `src/` 경로는 **백엔드 패키지 기준**입니다. 풀스택 레포에서는 **`backend/src/`**와 동일하게 해석합니다.

> **언어 안내**: **백엔드·AI 인프라** 관련 코드 예시는 **Python 기준**으로 작성되었습니다. 프론트엔드(TypeScript/React)는 동일한 API 계약·보안·관측 원칙을 따르되, 해당 스택의 관용(컴포넌트 분리, 훅, TanStack Query 등)으로 구현합니다. Java, Go 등 다른 언어로 백엔드를 대체하는 경우에도 컴포넌트 경계와 개발 원칙은 동일하게 적용합니다.

> **활용 방식**: 이 가이드는 **개발 룰(Rule) 파일로 직접 import**하여 사용하도록 설계되었습니다. Cursor, GitHub Copilot 등 프롬프트 기반 개발 환경에서 이 파일을 컨텍스트로 주입하면 AI가 프레임워크 구조에 맞는 코드를 자동으로 생성합니다. 프레임워크에 포함되지 않은 기능은 자유롭게 추가 개발할 수 있으나, **기본 인프라 레이어(7개 핵심 컴포넌트)는 이 틀을 기반으로 구현하기를 권장합니다.**  
> **[MUST] Cursor Rule·Skill 산출**: 이 파일(`@AI_PLATFORM_DEV_GUIDE.md`)로 **신규 프로젝트 스캐폴드·초기 틀 잡기**를 실행하면, 본문 전체를 컨텍스트로만 두지 말고 **핵심 제약을 압축해** `.cursor/rules/*.mdc`**에 쓰고**, 커밋·푸시 절차용 `.cursor/skills/git-push/SKILL.md`**를 반드시 생성·갱신**한다. 상세는 **§6-6**.

> **컴포넌트 선택적 사용 (Skip Rule)**: 7개 핵심 컴포넌트 중 **프로젝트에서 해당 기능을 사용하지 않는 컴포넌트는 도입하지 않아도 됩니다.** 단, 사용하기로 결정한 컴포넌트는 **이 가이드를 기반으로 구현하는 것을 원칙**으로 하되, **프로젝트 성격과 요구사항에 맞게 합리적으로 커스터마이징**할 수 있습니다. 자세한 기준은 **§1-3**을 참고하세요.

> **배포 규칙 우선순위**: **CI/CD·Dockerfile·Harbor·GitOps(**`gitops/`**)·Fleet·포트·ConfigMap/Secret** 등 **배포 산출물의 구체 규칙**은 레포 루트의 `DEPLOYMENT_PROMPT.md`(예: *표준 배포 파일 생성 프롬프트 (GitLab CI + Kubernetes GitOps / Rancher Fleet)*)를 따릅니다. `DEPLOYMENT_PROMPT.md`**와 본 문서가 상충하면 항상** `DEPLOYMENT_PROMPT.md`**를 우선**합니다. 본 가이드는 애플리케이션 구조·AI 컴포넌트 원칙을 다루며, 배포 파일 경로·빌드 컨텍스트·GitLab 잡·매니페스트 구성 등은 해당 프롬프트 문서를 기준으로 합니다.  
> **AS-IS → TO-BE**: 과거 GitLab Runner가 `docker compose up`으로 런타임 서버에 직접 배포하던 방식(AS-IS)은, **이미지 빌드 → Harbor Push →** `gitops/` **Deployment 이미지 태그 갱신 → Rancher Fleet이 RKE2에 동기화**(TO-BE)로 대체합니다. CI에 compose 기반 `deploy` Job을 두지 않습니다.

---



## 목차

1. [문서 목적 및 배경](#1-문서-목적-및-배경)
  - 1-3. 컴포넌트 선택 가이드 (Skip Rule)
2. [플랫폼 아키텍처 개요](#2-플랫폼-아키텍처-개요)
  - 2-3. 권장 레포지토리 구조 (frontend / backend 분리 배포)
3. [프레임워크 디렉토리 구조](#3-프레임워크-디렉토리-구조)
4. [핵심 컴포넌트 상세 가이드](#4-핵심-컴포넌트-상세-가이드)
  - 4-1. LLM Gateway
  - 4-2. Vector DB
  - 4-3. Prompt Repository
  - 4-4. Cache Layer
  - 4-5. API 표준 및 인터페이스
  - 4-6. Security (보안 아키텍처)
  - 4-7. Observability (모니터링)
5. [공통 유틸리티](#5-공통-유틸리티)
6. [신규 프로젝트 시작 가이드](#6-신규-프로젝트-시작-가이드)
  - 6-6. Cursor Rule·git-push Skill 필수 산출
7. [기능 개발 플로우](#7-기능-개발-플로우)
8. [코드 스타일 & 품질 기준](#8-코드-스타일--품질-기준)
9. [테스트 작성 가이드](#9-테스트-작성-가이드)
10. [DO / DON'T 요약](#10-do--dont-요약)
11. [개발 체크리스트](#11-개발-체크리스트)

---



## 1. 문서 목적 및 배경



### 1-1. 왜 공통 플랫폼인가

각 팀이 AI 서비스를 독립적으로 개발할 경우 다음 문제가 반복됩니다.

- **중복 개발**: LLM 연동, Vector DB 구성, 인증 처리를 매 프로젝트마다 재구현
- **품질 편차**: 팀마다 다른 방식으로 보안·로깅·캐싱을 구현 → 운영 복잡도 증가
- **벤더 종속**: 특정 LLM Provider, Vector DB에 강하게 묶여 전환 비용 급증
- **거버넌스 부재**: 사용량·비용·오류를 통합 모니터링할 수 없음

`ai-framework`는 이 문제를 해결하기 위한 **공통 AI 인프라 레이어**입니다.  
각 개발팀은 이 프레임워크를 **조립해서 서비스를 구축**하고, 인프라 구현은 프레임워크에 위임합니다.

---



### 1-2. 이 가이드의 사용법



#### 개발자가 직접 개발하는 경우

- **신규 프로젝트 시작 전**: §2(특히 §2-3), §3, §6을 먼저 읽는다. **배포·GitLab CI·Harbor·**`gitops/`**·Fleet**는 **`DEPLOYMENT_PROMPT.md`**를 함께 본다 (본 가이드와 상충 시 해당 문서 우선).
- **특정 기능 개발 중**: §4의 해당 컴포넌트 절을 참고한다.
- **PR 리뷰 기준**: §10 DO/DON'T와 §11 체크리스트를 사용한다.
- **코드 스타일 논의**: §8을 기준으로 한다.



#### AI 코딩 도구(Cursor, GitHub Copilot 등)와 함께 사용하는 경우

이 파일을 개발 룰로 import하여 프롬프트 기반 개발에 활용합니다.

```
# Cursor 사용 예시 — 빈 레포에서 처음부터 (앱 + 배포 TO-BE)
@AI_PLATFORM_DEV_GUIDE.md
@DEPLOYMENT_PROMPT.md

[프로젝트 변수]를 채운 뒤 frontend·backend·gitops·CI·Rule·Skill을 전부 생성해줘.
스킵 컴포넌트도 명시 (예: LLM/Vector/Security 스킵 — §1-3 Skip Rule).

# 배포·CI·Docker만 추가할 때 (앱 코드가 이미 있을 때)
@DEPLOYMENT_PROMPT.md
```

**에이전트 필수 동작 (이 가이드 실행 시)**: 코드 골격만 만들지 말고 **§6-6**에 따라 `.cursor/rules/`와 `.cursor/skills/git-push/SKILL.md`를 **항상** 생성하거나 프로젝트 값에 맞게 갱신한다.  
배포 파일·`deployment.mdc`·프로젝트 키/`APP_PORT`/Runner 태그·Harbor·Fleet 세부 형식은 **`DEPLOYMENT_PROMPT.md` 우선** (레포명마다 다른 값은 그 문서의 **프로젝트 변수** 블록).  
그린필드에서는 **사람 쪽 Harbor Project·CI Variables·Fleet GitRepo·pull secret** 사전 작업이 있다 — `DEPLOYMENT_PROMPT.md`의 **「빈 레포에서 처음부터」·「사전 요구사항」**을 따른다.

---



### 1-3. 컴포넌트 선택 가이드 (Skip Rule)

프로젝트에서 실제로 필요하지 않은 컴포넌트는 도입하지 않아도 됩니다.  
단, **선택한 컴포넌트는 반드시 이 가이드의 규칙을 따라야 합니다.** 절반만 따르거나 다른 방식과 혼용하지 않습니다.

#### 컴포넌트별 필수/선택 분류


| 컴포넌트                  | 기본 성격  | 스킵 가능 조건                               |
| --------------------- | ------ | -------------------------------------- |
| **LLM Gateway**       | 사실상 필수 | LLM을 전혀 호출하지 않는 프로젝트에서만 생략 가능          |
| **Vector DB**         | 선택     | RAG, 유사도 검색, 임베딩 저장이 없는 프로젝트는 생략       |
| **Prompt Repository** | 권장     | 프롬프트가 단순·고정적이고 변경 이력 관리가 불필요하면 생략 가능   |
| **Cache Layer**       | 선택     | 응답 속도·비용이 문제되지 않는 소규모 프로젝트에서 생략 가능     |
| **API**               | 사실상 필수 | 외부 HTTP 호출이 전혀 없는 프로젝트에서만 생략 가능        |
| **Security**          | 사실상 필수 | 내부 단독 실행 스크립트·배치 등 인증이 불필요한 경우에만 생략 가능 |
| **Observability**     | 사실상 필수 | 로컬 실험·PoC 수준의 일회성 스크립트에서만 생략 가능        |
| **Config**            | 필수     | 생략 불가 (모든 설정의 단일 진입점)                  |
| **Errors**            | 필수     | 생략 불가 (모든 모듈의 표준 예외)                   |




#### 프로젝트 유형별 권장 컴포넌트 조합

✅ = 사용, ⬜ = 스킵 가능, 🔸 = 규모에 따라 선택


| 프로젝트 유형              | LLM Gateway | Vector DB | Prompt Repo | Cache Layer | API | Security | Observability |
| -------------------- | ----------- | --------- | ----------- | ----------- | --- | -------- | ------------- |
| **RAG 기반 Q&A 서비스**   | ✅           | ✅         | ✅           | ✅           | ✅   | ✅        | ✅             |
| **LLM 요약/번역 API**    | ✅           | ⬜         | ✅           | 🔸          | ✅   | ✅        | ✅             |
| **문서 자동 분류 배치**      | ✅           | 🔸        | ✅           | ⬜           | ⬜   | 🔸       | ✅             |
| **챗봇 서비스**           | ✅           | ✅         | ✅           | ✅           | ✅   | ✅        | ✅             |
| **LLM 기반 코드 리뷰 도구**  | ✅           | ⬜         | ✅           | 🔸          | ✅   | ✅        | ✅             |
| **내부 PoC / 실험 스크립트** | ✅           | 🔸        | ⬜           | ⬜           | ⬜   | ⬜        | 🔸            |
| **임베딩 인덱싱 파이프라인**    | 🔸          | ✅         | ⬜           | ⬜           | ⬜   | 🔸       | ✅             |




#### Skip 적용 방법

**1. 프로젝트 시작 시 config에 명시**

```yaml
# config/production.yaml 예시
components:
  llm_gateway: true
  vector_db: false       # 이 프로젝트는 Vector DB 미사용
  prompt_repository: true
  cache_layer: false     # 소규모 PoC, 캐시 불필요
  api: true
  security: true
  observability: true
```

**2. 스킵한 컴포넌트는 import하지 않는다**

```python
# ✅ Vector DB를 스킵한 프로젝트의 올바른 main.py
from src.llm_gateway import LLMGateway, GatewayConfig
from src.prompt_repository import PromptRepository
from src.api import APIRouter
from src.security import JWTHandler, RBACAuthorizer, AuditLogger
from src.observability import StructuredLogger, MetricsCollector, Tracer, HealthChecker
from src.config import ConfigLoader
# vector_db, cache_layer는 import하지 않음

# ❌ 잘못된 예 — 쓰지도 않을 컴포넌트를 import만 해두는 것
from src.vector_db import PineconeConnector  # 사용 안 하면 import도 하지 않는다
```

**3. 스킵한 컴포넌트의 체크리스트 항목은 건너뛴다**

§11 개발 체크리스트에서 스킵한 컴포넌트에 해당하는 섹션은 검토하지 않아도 됩니다.

**4. 나중에 컴포넌트를 추가할 때**

해당 컴포넌트의 §4 가이드 전체를 처음부터 따릅니다.  
기존에 임시로 직접 구현한 부분(예: 직접 작성한 캐시 로직)은 해당 컴포넌트로 교체합니다.

---



## 2. 플랫폼 아키텍처 개요



### 2-1. 핵심 설계 항목 (공통 플랫폼 7대 컴포넌트)

모든 AI 서비스는 아래 컴포넌트를 **조합해서** 구축합니다. 프로젝트에 불필요한 컴포넌트는 스킵할 수 있습니다 (§1-3 참고).


| #   | 컴포넌트                  | 모듈 경로                    | 핵심 역할                                        | 도입 성격                    |
| --- | --------------------- | ------------------------ | -------------------------------------------- | ------------------------ |
| 1   | **LLM Gateway**       | `src/llm_gateway/`       | 모델 라우팅, 로드 밸런싱, 장애 대응, 사용량 모니터링              | 사실상 필수                   |
| 2   | **Vector DB**         | `src/vector_db/`         | Pinecone·Weaviate·Milvus·pgvector 통합, 인덱스 전략 | **선택** (RAG 미사용 시 스킵 가능) |
| 3   | **Prompt Repository** | `src/prompt_repository/` | 프롬프트 버전 관리, A/B 테스트, 성능 메트릭 연동               | 권장 (단순 프롬프트 시 스킵 가능)     |
| 4   | **Cache Layer**       | `src/cache_layer/`       | Semantic Cache, 다계층(L1/L2) 캐시, 무효화 정책        | **선택** (소규모·PoC 시 스킵 가능) |
| 5   | **API**               | `src/api/`               | RESTful/gRPC 표준 클라이언트·라우터·스키마                | 사실상 필수                   |
| 6   | **Security**          | `src/security/`          | OAuth 2.0·JWT 인증, AES-256 암호화, 감사 로깅         | 사실상 필수                   |
| 7   | **Observability**     | `src/observability/`     | 구조화 로깅, 메트릭, 분산 추적, 헬스체크                     | 사실상 필수                   |


공통 유틸리티 (모든 컴포넌트가 사용):


| 모듈     | 경로            | 역할        |
| ------ | ------------- | --------- |
| Config | `src/config/` | 설정 단일 진입점 |
| Errors | `src/errors/` | 표준 예외 타입  |




### 2-2. 의존성 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│              frontend/ (Vite + React 18 + TS 5 + Tailwind)        │
│         브라우저 UI — API는 HTTP로 backend만 호출                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS (REST/SSE 등, 별도 오리진 가능)
┌──────────────────────────▼──────────────────────────────────────┐
│                    서비스 코드 (App Layer)                          │
│         backend/app/handlers/   backend/app/services/             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 조합·호출
┌──────────────────────────▼──────────────────────────────────────┐
│               AI 공통 플랫폼 — 7개 핵심 컴포넌트 (backend/src/)      │
│                                                                 │
│  llm_gateway  ←→  vector_db  ←→  prompt_repository             │
│  cache_layer  ←→  api        ←→  security                      │
│                   observability                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 공통 참조
┌──────────────────────────▼──────────────────────────────────────┐
│              공통 유틸리티 (config, errors)                        │
└─────────────────────────────────────────────────────────────────┘
```

**규칙**: 하위 레이어가 상위 레이어를 참조하지 않습니다.  
`config`와 `errors`는 어디서나 참조 가능하나, 나머지 7개 컴포넌트끼리 순환 참조는 금지합니다.

---



### 2-3. 권장 레포지토리 구조 (frontend / backend / gitops)


| 영역          | 기술 스택                                        | 배포 단위                                                                                |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `frontend/` | Vite 5, TypeScript 5, React 18, Tailwind CSS | `frontend/Dockerfile` → nginx 이미지 → Harbor → Fleet Deployment                        |
| `backend/`  | Python (본 가이드의 7대 컴포넌트·`src/` 패키지)           | `backend/Dockerfile` → API 이미지 → Harbor → Fleet Deployment                           |
| `gitops/`   | Kubernetes Manifest + Rancher Fleet          | **CD 단일 진실 공급원**. `update-gitops`가 `image` 태그 갱신 → Fleet가 RKE2(`k8s-downstream`) 동기화 |


**표준 배포 (GitLab CI + Harbor + Rancher Fleet) —** `DEPLOYMENT_PROMPT.md` **기준 (TO-BE)**

- 레포 루트에 `.gitlab-ci.yml`, **`gitops/`**를 두고, `backend/Dockerfile`, **`frontend/Dockerfile`**은 각 디렉터리에 둡니다.
- `docker-compose.yml`**은 로컬 개발 전용**으로만 둘 수 있으며, **운영 CD에 포함하지 않습니다** (AS-IS의 Runner `compose up` 배포는 폐기).
- **Docker 빌드 컨텍스트는 항상 레포 루트**이며, Dockerfile 안에서는 `COPY backend/...`, `COPY frontend/...` 형태를 씁니다.
- **CI stages**: `build` → `gitops` (`build_backend` / `build_frontend` → `update-gitops`). GitLab이 운영 호스트에서 compose/`kubectl`로 직접 배포하지 않습니다.
- **이미지 저장소**: **SUSE Private Registry (Harbor)** (`HARBOR_`*). GitLab Registry + compose 배포(AS-IS)는 TO-BE에서 사용하지 않습니다.
- **런타임 설정**: deploy Job의 `backend/.env` 생성(AS-IS) 대신 **ConfigMap**(`backend-config`)·**Secret**(`backend-secret`) — Rancher UI 관리 권장. 키 목록은 `backend/.env.example`, `gitops/apps/backend/secret.example.yaml` 참고.
- **브라우저 → API**: 동일 Namespace Service 이름 `backend` + nginx `proxy_pass http://backend:<APP_PORT>` 유지를 기본으로 합니다. 로컬은 Vite `server.proxy`. 세부 규칙은 `DEPLOYMENT_PROMPT.md` 우선.

**공통 원칙 (배포 방식과 무관)**

- **한 저장소(monorepo)**: `frontend/`, `backend/`, `gitops/`.
- **비밀은 브라우저 번들에 넣지 않는다**: `VITE_`*에는 공개 가능한 값만.
- **API 계약**: OpenAPI(JSON) 또는 공유 타입으로 프론트·백엔드가 동일 스키마를 따릅니다 (§4-5 API 절과 연계).

**런타임 관계 (개념 · TO-BE)**

```
[developer] commit main
    -> [GitLab CI] build images -> Harbor
    -> [GitLab CI] update gitops/apps/*/deployment.yaml image
    -> [Rancher Fleet] sync gitops/ -> [RKE2 / k8s-downstream]
         Service/Ingress -> frontend(nginx) --/api/--> backend:<APP_PORT>
         ConfigMap/Secret --------------------------> backend env
```

---



## 3. 프레임워크 디렉토리 구조

풀스택 레포에서는 아래 `backend/` 트리가 **Python AI 서비스의 소스 루트**입니다. `ai-framework`를 서브모듈·내부 패키지로만 쓰는 경우에도, 서비스 저장소에서는 동일하게 `backend/src/` 아래에 두는 것을 권장합니다.

**레포 루트 (배포 표준 —** `DEPLOYMENT_PROMPT.md`**와 정합)**

```
.gitlab-ci.yml                       # GitLab CI: build → update-gitops (DEPLOYMENT_PROMPT.md 우선)
gitops/                              # Fleet Root directory — K8s 매니페스트
docker-compose.yml                   # 선택 — 로컬 개발 전용 (운영 CD 미사용)
DEPLOYMENT_PROMPT.md                 # 배포 프롬프트(팀 표준). AI 가이드와 상충 시 우선
```

`gitops/` (Fleet가 동기화하는 CD 매니페스트)

```
gitops/
├── fleet.yaml                       # defaultNamespace: "<프로젝트 키>" 따옴표 MUST (미인용 숫자 → Fleet unmarshal 오류)
└── apps/
    ├── backend/
    │   ├── deployment.yaml          # image 태그는 CI update-gitops가 갱신
    │   ├── service.yaml             # name=backend, port=APP_PORT
    │   ├── configmap.yaml           # backend-config (비민감)
    │   └── secret.example.yaml      # Secret 키 예시(실비밀 커밋 금지)
    ├── frontend/
    │   ├── deployment.yaml
    │   └── service.yaml             # name=frontend, port=80, ClusterIP (Ingress 진입 — DEPLOYMENT_PROMPT.md)
    └── ingress.yaml                 # Host=<레포명>.k8s.wonikqnc.com → frontend:80 · class=traefik · Ingress에 tls 없음(엣지 HTTPS)
```

```
backend/                              ← Python API·AI 인프라
│
├── src/                              ← 소스 코드 루트 (서비스에서 import 대상)
│   │
│   ├── llm_gateway/                  🤖 LLM Gateway
│   │   ├── __init__.py               공개 API (LLMGateway, GatewayConfig 등 export)
│   │   ├── gateway.py                통합 진입점 — 라우팅, 재시도, 장애 대응
│   │   ├── router.py                 모델 라우팅 전략 (라운드로빈, 최저레이턴시 등)
│   │   ├── load_balancer.py          서킷 브레이커 + 프로바이더 헬스 관리
│   │   ├── providers.py              OpenAI, Anthropic, Azure, Google 구현체
│   │   └── types.py                  GatewayConfig, LLMRequest, LLMResponse 등
│   │
│   ├── vector_db/                    🗄️ Vector DB
│   │   ├── __init__.py
│   │   ├── connector.py              추상 인터페이스 (upsert/query/delete/stats)
│   │   ├── pinecone.py               Pinecone 커넥터
│   │   ├── weaviate.py               Weaviate 커넥터
│   │   ├── milvus.py                 Milvus / Zilliz 커넥터
│   │   ├── pgvector.py               pgvector (PostgreSQL 확장) 커넥터
│   │   ├── index_strategy.py         인덱스 알고리즘 추천 + 백업 정책
│   │   └── types.py                  Vector, QueryResult, VectorDBConfig 등
│   │
│   ├── prompt_repository/            📝 Prompt Repository
│   │   ├── __init__.py
│   │   ├── repository.py             프롬프트 CRUD + {{variable}} 렌더링
│   │   ├── versioning.py             버전 라이프사이클 관리
│   │   ├── ab_testing.py             A/B 실험 관리
│   │   └── types.py                  Prompt, PromptVersion, ABTestConfig 등
│   │
│   ├── cache_layer/                  ⚡ Cache Layer
│   │   ├── __init__.py
│   │   ├── cache.py                  기본 캐시 (TTL, LRU/LFU, 데코레이터)
│   │   ├── semantic.py               임베딩 유사도 기반 Semantic Cache
│   │   ├── strategies.py             TaggedCache, MultiTierCache (L1+L2)
│   │   └── types.py                  CacheConfig, CacheStats 등
│   │
│   ├── api/                          🌐 API 표준 & 인터페이스
│   │   ├── __init__.py
│   │   ├── client.py                 HTTP REST 클라이언트 (재시도, 인증)
│   │   ├── router.py                 엔드포인트 등록 + OpenAPI paths 생성
│   │   ├── schemas.py                표준 Request/Response 스키마
│   │   └── exceptions.py             HTTP 표준 예외 (4xx, 5xx)
│   │
│   ├── security/                     🔒 보안 아키텍처
│   │   ├── __init__.py
│   │   ├── auth.py                   JWT 발급/검증, OAuth 2.0, RBAC
│   │   ├── encryption.py             AES-256-GCM 암호화, TLS 설정
│   │   ├── audit.py                  감사 로깅 (이벤트 기록 & 조회)
│   │   └── types.py                  AuthContext, AuditEvent 등
│   │
│   ├── observability/                📊 모니터링 & Observability
│   │   ├── __init__.py
│   │   ├── logging.py                구조화 로거 (JSON 출력, 컨텍스트 바인딩)
│   │   ├── metrics.py                메트릭 수집 (카운터/게이지/히스토그램)
│   │   ├── tracing.py                분산 추적 (OpenTelemetry 호환 Span)
│   │   └── health.py                 헬스체크 (liveness/readiness 프로브)
│   │
│   ├── config/                       ⚙️ 설정 (공통 유틸리티)
│   │   ├── __init__.py
│   │   ├── properties.py             모든 설정 타입 정의
│   │   └── loader.py                 파일·환경변수 설정 로더
│   │
│   └── errors/                       ⚠️ 표준 예외 (공통 유틸리티)
│       ├── __init__.py
│       ├── exceptions.py             표준 예외 클래스
│       ├── messages.py               오류 메시지 상수
│       └── handler.py                최상위 에러 핸들러
│
├── tests/                            테스트 파일
├── examples/                         사용 예제
├── docs/                             아키텍처 문서
├── deploy/                           선택 — 팀별 추가 오케스트레이션(비권장; 표준은 루트 `gitops/`)
├── DEVELOPMENT_RULES.md              모듈별 개발 룰 요약
├── AI_PLATFORM_DEV_GUIDE.md         ← 현재 이 문서 (루트에 둘 경우)
└── PROJECT_STRUCTURE.md              디렉토리 구조 상세
```

`frontend/` (동일 저장소 내 권장 구조 요약)

```
frontend/                             ← Vite+React
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   ├── lib/                          API 클라이언트, 공통 유틸
│   └── index.css                     Tailwind 진입 (`@tailwind` 지시문)
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── package.json
├── nginx.conf                        선택 — 없으면 Dockerfile 내 인라인 conf (DEPLOYMENT_PROMPT.md Step 3)
└── Dockerfile                        표준 배포 시 필수 — 루트 컨텍스트 빌드
```

---



## 4. 핵심 컴포넌트 상세 가이드

---



### 4-1. LLM Gateway



#### 개요

`llm_gateway`는 다양한 LLM 공급자(OpenAI, Anthropic, Azure OpenAI, Google 등)를 **단일 인터페이스**로 추상화합니다.  
서비스 코드는 어느 LLM을 쓰는지 알 필요 없이 `LLMGateway.complete(request)` 한 줄로 호출합니다.

**핵심 기능**: 모델 라우팅 (라운드로빈·최저레이턴시·비용최적화·페일오버), 로드 밸런싱, 서킷 브레이커·자동 재시도, 프로바이더별 사용량 통계

#### 파일별 역할


| 파일                 | 역할                                                                           |
| ------------------ | ---------------------------------------------------------------------------- |
| `gateway.py`       | 서비스에서 직접 사용하는 **유일한 진입점**. 라우팅과 재시도를 조율                                      |
| `router.py`        | `RoutingStrategy`에 따라 어느 프로바이더에 요청할지 결정                                      |
| `load_balancer.py` | 프로바이더 헬스 상태 추적, 서킷 브레이커 (오류 N회 → 일정 시간 차단)                                   |
| `providers.py`     | 각 LLM SDK를 래핑하는 구현체. 신규 프로바이더 추가 시 이 파일에 작성                                  |
| `types.py`         | `GatewayConfig`, `LLMConfig`, `LLMRequest`, `LLMResponse`, `RoutingStrategy` |




#### 사용 규칙

> ✅ **반드시 따라야 할 규칙**
>
> 1. LLM 호출은 항상 `LLMGateway`를 통한다. 서비스 코드에서 직접 `openai.ChatCompletion.create()` 또는 `anthropic.Anthropic()`를 호출하는 것을 **금지**한다.
> 2. `LLMGateway` 인스턴스는 서비스 초기화 시 **1개만** 생성하고, DI(의존성 주입)로 사용한다.
> 3. 라우팅 전략(`routing_strategy`)은 환경별 설정 파일에서 주입한다. 코드에 하드코딩하지 않는다.
> 4. 신규 LLM 프로바이더 추가 시 `providers.py`에 `BaseLLMProvider`를 구현하고 `PROVIDER_MAP`에 등록만 하면 된다. `gateway.py`를 수정하지 않는다.



#### 코드 샘플

**기본 사용 — 동기 호출**

```python
from src.llm_gateway import (
    LLMGateway, GatewayConfig, LLMConfig, LLMRequest, LLMMessage,
    LLMProvider, RoutingStrategy
)

gateway_config = GatewayConfig(
    providers=[
        LLMConfig(provider=LLMProvider.OPENAI, model="gpt-4o", api_key="sk-...", weight=2),
        LLMConfig(provider=LLMProvider.ANTHROPIC, model="claude-3-5-sonnet-20241022", api_key="sk-ant-...", weight=1),
    ],
    routing_strategy=RoutingStrategy.LEAST_LATENCY,
    fallback_enabled=True,
    retry_attempts=3,
)

gateway = LLMGateway(gateway_config)  # 서비스 시작 시 1회 초기화

request = LLMRequest(
    messages=[
        LLMMessage(role="system", content="당신은 문서 요약 전문가입니다."),
        LLMMessage(role="user", content="다음 문서를 3줄로 요약해주세요: {document}"),
    ]
)

response = gateway.complete(request)
print(response.content)       # LLM 응답 텍스트
print(response.provider)      # 실제 사용된 프로바이더
print(response.latency_ms)    # 응답 시간 (ms)
print(response.usage)         # {"prompt_tokens": 120, "completion_tokens": 80, "total_tokens": 200}
```

**비동기 호출**

```python
async def summarize(gateway: LLMGateway, text: str) -> str:
    request = LLMRequest(messages=[LLMMessage(role="user", content=f"요약: {text}")])
    response = await gateway.complete_async(request)
    return response.content

# 동시에 여러 요청 처리
async def batch_summarize(gateway: LLMGateway, texts: list[str]) -> list[str]:
    return await asyncio.gather(*[summarize(gateway, t) for t in texts])
```

**스트리밍 응답**

```python
async def stream_response(gateway: LLMGateway, question: str):
    request = LLMRequest(
        messages=[LLMMessage(role="user", content=question)],
        stream=True
    )
    async for token in gateway.stream(request):
        print(token, end="", flush=True)
```

**사용량 모니터링**

```python
summary = gateway.get_usage_summary()
# {
#   "openai": {"total_requests": 1500, "total_tokens": 230000, "avg_latency_ms": 342.1, "is_healthy": True},
#   "anthropic": {"total_requests": 800, "avg_latency_ms": 511.3, "total_errors": 2, "is_healthy": True}
# }
```

**신규 LLM 프로바이더 추가**

```python
# src/llm_gateway/providers.py 에 추가
class MyCustomProvider(BaseLLMProvider):
    def complete(self, request: LLMRequest) -> LLMResponse:
        # SDK 호출 구현
        ...
    async def complete_async(self, request: LLMRequest) -> LLMResponse:
        ...
    async def stream(self, request: LLMRequest):
        ...
        yield

PROVIDER_MAP["my_custom"] = MyCustomProvider
```

---



### 4-2. Vector DB



#### 개요

`vector_db`는 임베딩 벡터를 저장하고 유사도 검색하는 **모든 Vector DB를 동일한 인터페이스**로 제공합니다.  
지원 DB: **Pinecone**, **Weaviate**, **Milvus / Zilliz**, **pgvector (PostgreSQL 확장)**

**핵심 기능**: 단일 인터페이스로 어느 Vector DB든 교체 가능, 인덱스 전략 자동 추천 (FLAT → HNSW → IVF), 백업/복구 정책 코드 관리

#### 파일별 역할


| 파일                                                          | 역할                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `connector.py`                                              | 추상 베이스 (`upsert`, `query`, `delete`, `get_stats`). 컨텍스트 매니저 지원 |
| `pinecone.py` / `weaviate.py` / `milvus.py` / `pgvector.py` | 각 DB 커넥터 구현                                                    |
| `index_strategy.py`                                         | 데이터 규모·레이턴시·메모리 예산에 따른 인덱스 추천, 백업 정책 정의                        |
| `types.py`                                                  | `VectorDBConfig`, `Vector`, `QueryResult`, `IndexStats`        |




#### 사용 규칙

> ✅ **반드시 따라야 할 규칙**
>
> 1. Vector DB 커넥터는 항상 `with connector:` 컨텍스트 매니저로 사용한다. (자동 연결/해제 보장)
> 2. 인덱스 생성 전 반드시 `IndexStrategyAdvisor.recommend()`로 적합한 알고리즘을 확인한다.
> 3. 운영 환경에는 `BackupPolicy`를 코드로 정의해 백업 주기와 보존 기간을 명시한다.
> 4. `CONNECTOR_MAP`을 사용하면 설정값만으로 커넥터를 동적으로 선택할 수 있다. DB 종류를 코드에 하드코딩하지 않는다.



#### 코드 샘플

**기본 upsert & 검색**

```python
from src.vector_db import PineconeConnector, VectorDBConfig, Vector, VectorDBProvider

config = VectorDBConfig(
    provider=VectorDBProvider.PINECONE,
    api_key="pc-...",
    index_name="knowledge-base",
    dimension=1536,
)

with PineconeConnector(config) as db:
    db.upsert([
        Vector(id="doc-001", values=[0.12, -0.34, ...], metadata={"title": "보고서 1"}),
        Vector(id="doc-002", values=[0.56, 0.78, ...], metadata={"title": "보고서 2"}),
    ])

    results = db.query(
        vector=embed("재무 성과 분석"),
        top_k=5,
        filter={"title": {"$eq": "보고서 1"}},
    )
    for r in results:
        print(r.id, r.score, r.metadata)

    stats = db.get_stats()
    print(f"총 벡터 수: {stats.total_vectors}")
```

**설정 기반 동적 커넥터 선택 (권장 패턴)**

```python
from src.vector_db import CONNECTOR_MAP, VectorDBConfig, VectorDBProvider
from src.config import ConfigLoader

cfg = ConfigLoader.load("config/production.yaml")
provider_name = cfg.get("vector_db.provider")  # "pinecone" or "weaviate" or "pgvector"

db_config = VectorDBConfig(
    provider=VectorDBProvider(provider_name),
    api_key=cfg.get("vector_db.api_key"),
    index_name=cfg.get("vector_db.index_name"),
    dimension=cfg.get("vector_db.dimension", 1536),
)

with CONNECTOR_MAP[provider_name](db_config) as db:
    results = db.query(vector=query_embedding, top_k=10)
```

**인덱스 전략 자동 추천**

```python
from src.vector_db import IndexStrategyAdvisor, BackupPolicy

config = IndexStrategyAdvisor().recommend(
    num_vectors=2_000_000,
    query_latency_ms=20,
    memory_budget_gb=16,
)
print(config.index_type)   # HNSW

backup = BackupPolicy(
    enabled=True,
    schedule_cron="0 3 * * *",
    retention_days=30,
    storage_bucket="s3://my-bucket/vector-db-backup",
    encryption_enabled=True,
)
```

**신규 Vector DB 커넥터 추가**

```python
# src/vector_db/chromadb.py
from .connector import VectorDBConnector

class ChromaDBConnector(VectorDBConnector):
    def connect(self): ...
    def disconnect(self): ...
    def upsert(self, vectors, namespace=None): ...
    def query(self, vector, top_k=10, filter=None, namespace=None): ...
    def delete(self, ids, namespace=None): ...
    def get_stats(self): ...

# src/vector_db/__init__.py 의 CONNECTOR_MAP에 등록
# CONNECTOR_MAP["chroma"] = ChromaDBConnector
```

---



### 4-3. Prompt Repository



#### 개요

`prompt_repository`는 프롬프트를 코드에서 분리해 **중앙에서 버전 관리**합니다.  
프롬프트를 소스 코드 안에 문자열로 하드코딩하는 것을 **완전히 금지**합니다.

**핵심 기능**: 프롬프트 CRUD, `{{variable}}` 문법 렌더링, `draft → active → deprecated → archived` 버전 라이프사이클, A/B 테스트

#### 파일별 역할


| 파일              | 역할                                                            |
| --------------- | ------------------------------------------------------------- |
| `repository.py` | CRUD 및 `render()` — `{{variable}}` 치환 담당                      |
| `versioning.py` | `add_version()`, `promote()`, `deprecate()`, 버전 히스토리·비교       |
| `ab_testing.py` | 실험 생성, 트래픽 분배, 성과 기록, 승자 판정                                   |
| `types.py`      | `Prompt`, `PromptVersion`, `PromptVariable`, `ABTestConfig` 등 |




#### 사용 규칙

> ✅ **반드시 따라야 할 규칙**
>
> 1. 서비스 코드에 프롬프트 문자열을 직접 작성하지 않는다. 반드시 `PromptRepository`에 등록한다.
> 2. 프롬프트 변경 시 반드시 새 버전을 `add_version()`으로 추가하고 `promote()`로 단계적 배포한다. 기존 버전을 직접 수정하지 않는다.
> 3. 새 프롬프트를 전체 트래픽에 바로 적용하기 전에 `PromptABTester`로 10~20% 트래픽에 먼저 검증한다.



#### 코드 샘플

**프롬프트 등록 및 렌더링**

```python
from src.prompt_repository import PromptRepository, PromptVariable, PromptCategory

repo = PromptRepository()

repo.create(
    id="doc-summarizer",
    name="문서 요약기",
    category=PromptCategory.USER,
    content=(
        "당신은 전문 문서 요약가입니다.\n"
        "다음 문서를 {{language}}로 {{lines}}줄 이내로 요약해주세요.\n\n"
        "문서:\n{{document}}"
    ),
    variables=[
        PromptVariable(name="language", required=True, default="한국어"),
        PromptVariable(name="lines", required=True, default="3"),
        PromptVariable(name="document", required=True),
    ],
    version="1.0.0",
)

prompt_text = repo.render(
    "doc-summarizer",
    language="한국어",
    lines="3",
    document="2024년 4분기 영업 실적은 전년 대비 15% 성장하였으며...",
)
```

**버전 관리 워크플로우**

```python
from src.prompt_repository import PromptVersionManager

mgr = PromptVersionManager(repo)

mgr.add_version(
    prompt_id="doc-summarizer",
    version="1.1.0",
    content="당신은 최고의 문서 분석 전문가입니다.\n아래 문서를 {{language}}로 핵심만 {{lines}}줄로 요약하세요.\n\n{{document}}",
    changelog="더 명확한 역할 지시로 품질 개선",
)
mgr.promote("doc-summarizer", "1.1.0")       # 이제 이 버전이 active
mgr.deprecate("doc-summarizer", "1.0.0", reason="1.1.0으로 대체")

diff = mgr.compare("doc-summarizer", "1.0.0", "1.1.0")
print("추가:", diff["added"])
```

**A/B 테스트**

```python
from src.prompt_repository import PromptABTester, ABTestConfig

tester = PromptABTester()
tester.create_experiment(ABTestConfig(
    experiment_id="exp-001",
    prompt_id="doc-summarizer",
    variant_a_version="1.0.0",
    variant_b_version="1.1.0",
    traffic_split=0.5,
))

def handle_request(document: str) -> str:
    variant = tester.select_variant("exp-001")  # "a" or "b"
    version = "1.0.0" if variant == "a" else "1.1.0"
    prompt = repo.render("doc-summarizer", version=version, language="한국어", lines="3", document=document)
    response = gateway.complete(...)
    tester.record_outcome("exp-001", variant, score=get_user_feedback())
    return response.content

result = tester.get_result("exp-001")
print(f"A: {result.variant_a_score:.3f} / B: {result.variant_b_score:.3f} → 승자: {result.winner}")
```

---



### 4-4. Cache Layer



#### 개요

`cache_layer`는 응답 속도 향상과 LLM 비용 절감을 위한 **다계층 캐시**를 제공합니다.

**캐시 티어**:

- **L1 (메모리)**: 프로세스 내 캐시. 가장 빠르고 용량 제한 있음
- **L2 (Redis)**: 서비스 인스턴스 간 공유 캐시. 분산 환경 필수
- **Semantic Cache**: 임베딩 코사인 유사도 기반 — 의미가 유사하면 캐시 재사용



#### 파일별 역할


| 파일              | 역할                                                               |
| --------------- | ---------------------------------------------------------------- |
| `cache.py`      | 기본 캐시 — `get/set/delete` + `.cached()`, `.async_cached()` 데코레이터  |
| `semantic.py`   | Semantic Cache — 임베딩 유사도 기반, `get_or_compute()` 인터페이스            |
| `strategies.py` | `TaggedCacheLayer` (태그 무효화), `MultiTierCache` (L1+L2 조합)         |
| `types.py`      | `CacheConfig`, `CacheTier`, `InvalidationStrategy`, `CacheStats` |




#### 사용 규칙

> ✅ **반드시 따라야 할 규칙**
>
> 1. LLM 응답 캐싱에는 **Semantic Cache**를 사용한다. 의미가 같으면 캐시 히트를 얻을 수 있어 비용을 크게 절감한다.
> 2. `SemanticCache`의 `similarity_threshold`는 **0.90 이상**을 권장한다.
> 3. 분산 환경(다중 인스턴스)에서는 `MultiTierCache(l1=..., l2=RedisLayer)`를 사용한다.
> 4. 관련 데이터를 한 번에 무효화해야 할 때는 `TaggedCacheLayer`를 사용한다.



#### 코드 샘플

**기본 캐시 및 데코레이터**

```python
from src.cache_layer import CacheLayer, CacheConfig, InvalidationStrategy

cache = CacheLayer(CacheConfig(
    ttl_seconds=300,
    max_size=1000,
    invalidation_strategy=InvalidationStrategy.LRU,
))

# 직접 사용
cache.set("user:42:profile", user_data, ttl=600)
data = cache.get("user:42:profile")  # None이면 캐시 미스

# 데코레이터 패턴 (권장)
@cache.cached(ttl=300)
def get_embedding(text: str) -> list[float]:
    return embedding_model.encode(text)

@cache.async_cached(ttl=300)
async def fetch_info(company_id: str) -> dict:
    return await db.query(company_id)

stats = cache.get_stats()
print(f"히트율: {stats.hit_rate:.1%}")
```

**Semantic Cache — LLM 비용 절감의 핵심**

```python
from src.cache_layer import SemanticCache

semantic_cache = SemanticCache(
    embed_fn=my_embed,
    similarity_threshold=0.92,
    max_entries=500,
    ttl_seconds=3600,
)

def ask_llm(gateway, question: str) -> str:
    return semantic_cache.get_or_compute(
        query=question,
        compute_fn=lambda q: gateway.complete(
            LLMRequest(messages=[LLMMessage(role="user", content=q)])
        ).content
    )

# "2024년 4분기 실적은?" 과 "2024년 4Q 성과는?" 은 유사도 > 0.92 → 캐시 히트
result1 = ask_llm(gateway, "2024년 4분기 실적은?")
result2 = ask_llm(gateway, "2024년 4Q 성과는?")  # LLM 호출 없음
```

**태그 기반 무효화 + 멀티 티어**

```python
from src.cache_layer import TaggedCacheLayer, MultiTierCache, CacheConfig

# 태그 기반 무효화
tagged = TaggedCacheLayer(CacheConfig(ttl_seconds=600))
tagged.set("user:42:profile", data, tags=["user:42"])
tagged.set("user:42:settings", data, tags=["user:42"])
tagged.invalidate_tag("user:42")  # 두 키 모두 제거

# 멀티 티어
l1 = CacheLayer(CacheConfig(max_size=200, ttl_seconds=60))
multi = MultiTierCache(l1=l1)   # l2 추가 시: MultiTierCache(l1=l1, l2=redis_layer)
multi.set("hot-data", value)
result = multi.get("hot-data")  # L1 먼저, 없으면 L2 → L1으로 프로모션
```

---



### 4-5. API 표준 및 인터페이스



#### 개요

`api`는 플랫폼 컴포넌트 간, 그리고 외부 시스템과의 통신을 위한 **표준 HTTP 인터페이스**를 정의합니다.

**핵심 기능**: 표준 Request/Response 스키마, 인증·재시도 내장 HTTP 클라이언트, 프레임워크 독립적 라우터 (FastAPI, Flask 등에 마운트 가능)

#### 파일별 역할


| 파일              | 역할                                                                                  |
| --------------- | ----------------------------------------------------------------------------------- |
| `client.py`     | 외부 API 호출용 HTTP 클라이언트. 재시도, 타임아웃, 인증 헤더 자동 주입                                       |
| `router.py`     | 엔드포인트 등록 (`@router.post(...)`), OpenAPI paths 자동 생성                                 |
| `schemas.py`    | `APIRequest`, `APIResponse`, `PaginatedResponse`, `ErrorResponse`, `HealthResponse` |
| `exceptions.py` | `BadRequestError(400)`, `UnauthorizedError(401)`, `RateLimitError(429)` 등           |




#### 사용 규칙

> ✅ **반드시 따라야 할 규칙**
>
> 1. 서비스 코드에서 직접 `requests.get()` 또는 `httpx.Client()`를 호출하지 않는다. 반드시 `APIClient`를 통한다.
> 2. 모든 API 엔드포인트는 `APIRouter`에 등록한다. HTTP 프레임워크에 직접 라우트를 선언하지 않는다.
> 3. 에러 응답은 항상 `ErrorResponse` 스키마를 사용한다.



#### 코드 샘플

**외부 API 호출**

```python
from src.api import APIClient

client = APIClient(
    base_url="https://api.partner-service.com",
    api_key="key-...",
    timeout=30,
    max_retries=3,
)

response = client.get("/v1/documents", params={"page": "1", "size": "20"})
if response.is_success:
    print(response.body)

response = client.post("/v1/analyze", body={"text": "분석할 텍스트"})
```

**엔드포인트 정의**

```python
from src.api import APIRouter
from src.api.schemas import PaginatedResponse

router = APIRouter(prefix="/api/v1")

@router.get("/health", auth_required=False, tags=["infra"])
def health_check():
    return {"status": "ok"}

@router.post("/completions", tags=["llm"])
def create_completion(body: dict):
    ...

@router.get("/documents", tags=["documents"])
def list_documents(page: int = 1, size: int = 20):
    return PaginatedResponse(items=[...], total=100, page=page, page_size=size)

# FastAPI 마운트 예시
# for route in router.routes:
#     app.add_api_route(route.path, route.handler, methods=[route.method.value])
```

**표준 에러 처리**

```python
from src.api.exceptions import BadRequestError, UnauthorizedError, NotFoundError
from src.api.schemas import ErrorResponse

def handle_request(user_id: str, document_id: str):
    if not user_id:
        raise BadRequestError("user_id는 필수입니다.", detail={"field": "user_id"})
    if not is_authenticated(user_id):
        raise UnauthorizedError("유효하지 않은 토큰입니다.")
    doc = db.get(document_id)
    if not doc:
        raise NotFoundError(f"문서를 찾을 수 없습니다: {document_id}")
```

---



### 4-6. Security (보안 아키텍처)



#### 개요

`security`는 AI 서비스에 필요한 **인증·인가·암호화·감사 로깅**을 통합 제공합니다.

**핵심 기능**: JWT 토큰 발급/검증 (HS256, RS256), OAuth 2.0 클라이언트 크레덴셜, RBAC (역할 기반 접근 제어), AES-256-GCM 암호화, 불변 감사 로그

#### 파일별 역할


| 파일              | 역할                                                                      |
| --------------- | ----------------------------------------------------------------------- |
| `auth.py`       | `JWTHandler` (발급/검증), `OAuth2Handler` (토큰 획득), `RBACAuthorizer` (권한 체크) |
| `encryption.py` | `AES256Cipher` (AES-256-GCM 암호화/복호화), `TLSConfig` (SSL 컨텍스트 빌더)         |
| `audit.py`      | `AuditLogger` — 보안 이벤트 기록, 필터 조회, JSON 내보내기                             |
| `types.py`      | `AuthContext`, `JWTClaims`, `AuditEvent`, `AuthScheme`                  |




#### 사용 규칙

> ✅ **반드시 따라야 할 규칙**
>
> 1. 모든 API 엔드포인트는 JWT 토큰 검증을 거친다. `auth_required=False`는 `/health`, `/metrics` 등 공개 엔드포인트에만 허용한다.
> 2. 민감 데이터(API 키, 개인식별정보, 금융 정보)는 반드시 `AES256Cipher`로 암호화 후 저장한다.
> 3. 다음 이벤트는 반드시 `AuditLogger`로 기록한다: 로그인/로그아웃, 권한 변경, 데이터 삭제, 설정 변경.
> 4. 권한 체크는 `RBACAuthorizer.require()`를 사용한다. 역할 문자열 직접 비교 금지.



#### 코드 샘플

**JWT 인증 처리**

```python
from src.security import JWTHandler, RBACAuthorizer, AuthContext
from src.security.types import AuthScheme
from src.errors.exceptions import AuthenticationError

jwt = JWTHandler(
    secret_key="your-256-bit-secret",
    algorithm="HS256",
    expire_seconds=3600,
    issuer="ai-platform",
)

token = jwt.create_token(user_id="user-42", roles=["editor", "viewer"])

def authenticate(authorization_header: str) -> AuthContext:
    if not authorization_header.startswith("Bearer "):
        raise AuthenticationError("Authorization 헤더 형식이 잘못되었습니다.")
    try:
        claims = jwt.verify_token(authorization_header[7:])
        return AuthContext(user_id=claims.sub, roles=claims.roles, scheme=AuthScheme.JWT)
    except Exception as e:
        raise AuthenticationError(f"유효하지 않은 토큰: {e}")
```

**RBAC 권한 제어**

```python
from src.security import RBACAuthorizer

rbac = RBACAuthorizer({
    "admin":   ["read", "write", "delete", "manage_users"],
    "editor":  ["read", "write"],
    "viewer":  ["read"],
})

def delete_document(auth_ctx: AuthContext, doc_id: str):
    rbac.require(auth_ctx, action="delete")  # 권한 없으면 PermissionError
    document_service.delete(doc_id)
    audit.log("document.delete", user_id=auth_ctx.user_id, resource=doc_id)
```

**데이터 암호화**

```python
from src.security import AES256Cipher
import os

key = bytes.fromhex(os.environ["ENCRYPTION_KEY"])
cipher = AES256Cipher(key=key)

encrypted = cipher.encrypt_str("sk-real-api-key-1234567890")  # DB에 저장
decrypted = cipher.decrypt_str(encrypted)                     # 사용 시 복호화
```

**감사 로깅**

```python
from src.security import AuditLogger

audit = AuditLogger()

audit.log(event_type="user.login", user_id="user-42",
          resource="/api/v1/completions", action="POST",
          result="success", ip_address="10.0.0.42")

audit.log(event_type="auth.unauthorized", user_id=None,
          resource="/api/v1/admin", action="GET",
          result="failure", ip_address="203.0.113.1")

login_events = audit.query(event_type="user.login", result="success")
all_events = audit.export()  # JSON 내보내기 (SIEM 연동)
```

---



### 4-7. Observability (모니터링 & Observability)



#### 개요

`observability`는 시스템 메트릭, 애플리케이션 로그, 분산 추적을 통합하는 **Observability 스택**입니다.  
AI 서비스의 **3가지 신호(Logs, Metrics, Traces)**를 표준화된 방식으로 수집·노출합니다.

**핵심 기능**: JSON 구조화 로깅, 카운터·게이지·히스토그램 메트릭, OpenTelemetry 호환 분산 추적, liveness/readiness 헬스체크

#### 파일별 역할


| 파일           | 역할                                                                           |
| ------------ | ---------------------------------------------------------------------------- |
| `logging.py` | `StructuredLogger` — JSON 로그, `bind()`로 컨텍스트 필드 추가                           |
| `metrics.py` | `MetricsCollector` — `increment()`, `set_gauge()`, `record()`, Prometheus 연동 |
| `tracing.py` | `Tracer`, `Span` — `start_span()` 컨텍스트 매니저, `@tracer.traced()` 데코레이터         |
| `health.py`  | `HealthChecker` — 컴포넌트 등록, `check_all()`, `is_ready()`                       |




#### 사용 규칙

> ✅ **반드시 따라야 할 규칙**
>
> 1. `print()`와 `logging.getLogger()` 직접 사용 금지. 반드시 `StructuredLogger`를 사용한다.
> 2. 서비스 시작 시 4개 객체를 초기화하고 **싱글턴**으로 관리한다: `StructuredLogger`, `MetricsCollector`, `Tracer`, `HealthChecker`
> 3. 모든 외부 I/O (LLM 호출, Vector DB 쿼리, 외부 API 호출)는 `Tracer`로 추적한다.
> 4. 모든 외부 의존성은 `HealthChecker`에 등록해 `/health` 엔드포인트에서 확인 가능하게 한다.



#### 코드 샘플

**구조화 로깅**

```python
from src.observability import StructuredLogger

logger = StructuredLogger("ai-service", json_output=True)

logger.info("서비스 시작", version="1.2.0", environment="production")
# {"timestamp": "2024-03-12T09:00:00Z", "level": "INFO", "message": "서비스 시작", ...}

# 컨텍스트 바인딩 — 요청 ID, 사용자 ID 자동 포함
def handle_request(request_id: str, user_id: str):
    req_logger = logger.bind(request_id=request_id, user_id=user_id)
    req_logger.info("요청 처리 시작")
    req_logger.info("LLM 호출", prompt_tokens=120)
    req_logger.info("요청 처리 완료", latency_ms=342)
```

**메트릭 수집**

```python
from src.observability import MetricsCollector

metrics = MetricsCollector()

metrics.increment("llm.requests.total", labels={"provider": "openai", "model": "gpt-4o"})
metrics.record("llm.latency_ms", 342.5, labels={"provider": "openai"})
metrics.set_gauge("cache.hit_rate", 0.87)
metrics.increment("llm.cost.usd", 0.003, labels={"provider": "openai"})

summary = metrics.summary()
# {"llm.latency_ms": {"count": 1500, "avg": 342.5, "min": 89.2, "max": 2103.1}}
```

**분산 추적**

```python
from src.observability import Tracer

tracer = Tracer(service_name="ai-service")

def process_rag_query(query: str):
    with tracer.start_span("rag.query", tags={"query_length": len(query)}) as span:
        with tracer.start_span("embedding.encode", parent=span) as emb_span:
            embedding = encode(query)
            emb_span.set_tag("dimension", len(embedding))

        with tracer.start_span("vector_db.search", parent=span) as db_span:
            results = vector_db.query(embedding, top_k=5)
            db_span.set_tag("results_count", len(results))

        with tracer.start_span("llm.complete", parent=span) as llm_span:
            response = gateway.complete(...)
            llm_span.set_tag("tokens", response.usage.get("total_tokens"))

# 데코레이터 방식
@tracer.traced("vector_db.upsert")
def index_documents(docs: list):
    for doc in docs:
        vector_db.upsert([create_vector(doc)])
```

**헬스체크 설정**

```python
from src.observability import HealthChecker

checker = HealthChecker(version="1.2.0")

@checker.register("llm_gateway")
def check_llm():
    if not any(s["is_healthy"] for s in gateway.get_usage_summary().values()):
        raise RuntimeError("모든 LLM 프로바이더 비정상")

@checker.register("vector_db")
def check_vector_db():
    with PineconeConnector(config) as db:
        db.get_stats()

@router.get("/health", auth_required=False)
def health():
    report = checker.check_all()
    return {
        "status": report.overall.value,
        "version": report.version,
        "components": [
            {"name": c.name, "status": c.status.value, "latency_ms": c.latency_ms}
            for c in report.components
        ]
    }
```

---



## 5. 공통 유틸리티



### 5-1. Config — 설정 단일 진입점

- 서비스 전체에서 설정값은 `**config` 모듈을 통해서만** 읽는다.
- `os.getenv()`, `os.environ[]`을 비즈니스 로직에서 직접 호출하지 않는다.
- 새 설정 항목은 `src/config/properties.py`에 Pydantic 모델로 정의한다.

```python
from src.config import ConfigLoader

config = ConfigLoader.load("config/production.yaml")

llm_api_key = config.get("llm.openai.api_key")
db_host     = config.get("vector_db.host", default="localhost")
cache_ttl   = config.get("cache.ttl_seconds", default=300)

# ❌ 금지
api_key = os.getenv("OPENAI_API_KEY")  # 비즈니스 로직에서 직접 호출 금지
```



### 5-2. Errors — 표준 예외

- 모든 예외는 `src/errors/exceptions.py`에 정의된 `FrameworkError` 파생 타입을 사용한다.
- 새 에러 유형 추가 시 `exceptions.py`에 클래스를 추가하고, `messages.py`에 메시지를 등록한다.

```python
from src.errors.exceptions import (
    ValidationError, AuthenticationError, PermissionError,
    VectorDBError, CacheError, PromptError, LLMError
)

# ✅ 올바른 예외 처리
def validate_query(query: str):
    if len(query) > 10000:
        raise ValidationError("쿼리가 너무 깁니다.", field="query", value=len(query))

def get_document(doc_id: str):
    try:
        return vector_db.query(...)
    except Exception as e:
        raise VectorDBError(f"문서 검색 실패: {e}", provider="pinecone", operation="query")

# ❌ 금지
raise ValueError("잘못된 데이터")  # FrameworkError 파생 타입 사용해야 함
```

---



## 6. 신규 프로젝트 시작 가이드

### 6-0. 그린필드 최소 순서 (공용)

빈 GitLab 레포에서 **앱 + K8s TO-BE**까지 가려면 본 가이드와 **`DEPLOYMENT_PROMPT.md`를 같이** 쓴다.

1. **키 확정**: 레포명 → 프로젝트 키. `APP_PORT`·Namespace·Harbor·Runner 태그는 `DEPLOYMENT_PROMPT.md` 규칙(끝 3자리 NNN → `8000+NNN`, 아니면 `8000`).
2. **Cursor**: `@AI_PLATFORM_DEV_GUIDE.md` + `@DEPLOYMENT_PROMPT.md` + 채운 `[프로젝트 변수]` + Skip 목록 → `frontend/`·`backend/`·`gitops/`·CI(**Step 5 전체 YAML = real-test2 패턴, 프로젝트 키만 치환 · `dockerd-entrypoint.sh &` · CI `default.tags`/`HARBOR_PROJECT` **및** `gitops/fleet.yaml` `defaultNamespace`·모든 `metadata.namespace`는 `"키"` 따옴표**)·Rules/Skill 생성.  
   미인용 숫자 키(`01774` 등) → GitLab tags 오류 **또는** Fleet `cannot unmarshal number into … defaultNamespace` (`DEPLOYMENT_PROMPT.md` Step 4·5 MUST).
3. **인프라(사람)**: Harbor Project; CI Variables(`HARBOR_*`, `HARBOR_CA_CERT`=**서명 CA**·base64\|PEM, `HARBOR_REGISTRY`=**호스트만**·`https://` 금지, **`GITOPS_GIT_TOKEN`=Maintainer+write_repository**); Protected `main` Allowed to push; Runner 태그; Fleet GitRepo; Namespace pull secret; **사내 DNS**(`*.k8s.wonikqnc.com` → 엣지/Ingress IP).  
   CI는 `DEPLOYMENT_PROMPT.md` Step 5 Harbor TLS 블록(certs.d + `insecure-registries`)을 그대로 쓴다 — **레포마다 login 성공/실패가 갈리는 지점**.  
   **Ingress YAML에 `spec.tls` / `websecure`를 넣지 않는다** — HTTPS는 엣지(Apache) 종료, Traefik은 HTTP Host 라우트만 (`DEPLOYMENT_PROMPT.md` Ingress MUST).
4. **검증**: Pipeline(`build`→`update-gitops`) → Fleet Ready(번들 파싱 오류 없음) → Pod Running → Rancher Ingress Target이 **`http://<레포명>.k8s.wonikqnc.com/`** (https가 아님) → 브라우저는 `https://<레포명>.k8s.wonikqnc.com/` 접속. Rancher Service Proxy + absolute `/api/v1` 함정은 `DEPLOYMENT_PROMPT.md` 참고.

앱만 먼저 만들거나, 배포 파일만 추가하는 경우는 §1-2 예시의 짧은 프롬프트를 쓴다.



### 6-1. 저장소 루트 (모노레포)

**한 저장소**에 `frontend/`, `backend/`, **`gitops/`**를 둡니다. **GitLab CI + Harbor + Rancher Fleet(GitOps) 표준**을 쓰는 경우 루트에 `.gitlab-ci.yml`, `gitops/`, **`DEPLOYMENT_PROMPT.md`**(공용 배포 프롬프트)를 두며, **CI·Harbor·매니페스트·Dockerfile의 구체 형식은** `DEPLOYMENT_PROMPT.md`**가 본 가이드보다 우선**합니다. `docker-compose.yml`은 **로컬 전용(선택)**입니다. 공용 문서(본 가이드 등)·`README.md`는 루트에 둡니다.  
특정 레포명·포트를 가이드 본문에 하드코딩하지 않는다 — 레포별 값은 Rules(`project-overview.mdc`)와 `DEPLOYMENT_PROMPT.md` 변수 블록이 권위다.

### 6-2. 백엔드 (`backend/`) — Python · AI 프레임워크

**프레임워크 설치**

```bash
cd backend

# 방법 1: pip 패키지로 설치 (권장)
pip install ai-framework

# 방법 2: Git submodule로 추가
git submodule add https://github.com/your-org/ai-framework vendor/ai-framework
pip install -e vendor/ai-framework
```

**권장 디렉터리 구조 (**`backend/`**)**

```
backend/
│
├── app/
│   ├── main.py                       # 애플리케이션 진입점 (FastAPI/Starlette 등)
│   ├── handlers/                     # HTTP/gRPC 핸들러
│   ├── services/                     # 도메인 서비스 (핵심 비즈니스 로직)
│   └── configs/                      # 서비스 고유 설정 정의
│
├── src/                              # ai-framework 패키지 (§3 트리와 동일 역할)
│   ├── llm_gateway/
│   ├── vector_db/
│   └── ...
│
├── config/
│   ├── local.yaml
│   ├── staging.yaml
│   └── production.yaml
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── .env.example                      # 로컬·Secret 키 목록 참고용 (CI로 compose .env 만들지 않음 — DEPLOYMENT_PROMPT.md)
├── requirements.txt
├── pyproject.toml                    # 선택 — ruff/black/pytest 통합 시
└── Dockerfile                      # 루트 컨텍스트에서 빌드 (`DEPLOYMENT_PROMPT.md` Step 2)
```



### 6-3. 프론트엔드 (`frontend/`) — Vite 5 · TypeScript 5 · React 18 · Tailwind CSS

**스캐폴딩 (예시)**

```bash
cd frontend
npm create vite@5 . -- --template react-ts
npm install
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

- **Vite 5** / **React 18** / **TypeScript 5**는 `package.json`의 `engines` 또는 의존성 메이저 버전으로 고정하는 것을 권장합니다 (`"typescript": "^5.0.0"`, `"vite": "^5.0.0"`, `"react": "^18.0.0"` 등).
- **Tailwind CSS**: `tailwind.config.ts`의 `content`에 `./index.html`, `./src/**/*.{ts,tsx}`를 포함하고, `src/index.css`에 `@tailwind base/components/utilities`를 둡니다.
- **백엔드 연동**: 로컬·K8s에서는 **공개 가능한 값만** (`VITE_*`). LLM 키·DB 비밀번호는 프론트에 두지 않습니다. **nginx 동일 오리진**(`/api/` → Service `backend`)이 기본입니다. **경로·프록시는** `DEPLOYMENT_PROMPT.md` **우선**.
- **진입점**: 운영 확인은 frontend **Ingress**를 기본으로 합니다. 브라우저 URL은 **`https://<GitLab레포명>.k8s.wonikqnc.com/`**.  
  **`gitops/apps/ingress.yaml`**: class=`traefik`, Host→frontend:80, **`spec.tls`/`websecure` 금지**(엣지 TLS). Rancher Target은 `http://…`여야 함 — `https://…`면 잘못 설정(`DEPLOYMENT_PROMPT.md` Ingress MUST, 형제 real-test2 참고). NodePort는 폴백입니다. Rancher Service Proxy URL에서 `fetch("/api/v1/...")`처럼 **origin 루트 절대 경로**를 쓰면 요청이 **Kubernetes API**로 가서 `"kind":"Status"` 404가 납니다. Proxy를 써야 하면 현재 경로의 `/proxy` prefix를 유지하도록 API URL을 resolve하거나, Ingress를 쓰세요.
- **로컬 개발**: `vite.config.ts`의 `server.proxy`로 `/api`를 백엔드 개발 서버에 넘기면 편합니다.

**권장 디렉터리 구조 (**`frontend/`**)** — 상세는 §3의 `frontend/` 트리와 동일합니다.

```
frontend/
├── src/
├── vite.config.ts
├── tailwind.config.ts
├── package.json
├── nginx.conf                        선택 — 없으면 Dockerfile 내 인라인 (DEPLOYMENT_PROMPT.md)
└── Dockerfile                        표준 배포 시 필수 — 루트 컨텍스트 빌드
```

**프론트 배포**: `DEPLOYMENT_PROMPT.md` **적용 시** — `frontend/Dockerfile`로 **multi-stage build → nginx** 이미지를 만들고 **Harbor**에 Push한 뒤, `gitops/apps/frontend/deployment.yaml` 이미지 태그 갱신 → **Fleet**가 반영합니다. **비밀·API 키는 백엔드 ConfigMap/Secret에만** 둡니다.

### 6-4. 진입점 구성 예시 (`backend/app/main.py`)

```python
"""서비스 애플리케이션 진입점 — 모든 컴포넌트를 초기화하고 조립합니다."""

from src.config import ConfigLoader
from src.llm_gateway import LLMGateway, GatewayConfig, LLMConfig, LLMProvider, RoutingStrategy
from src.vector_db import CONNECTOR_MAP, VectorDBConfig, VectorDBProvider
from src.prompt_repository import PromptRepository
from src.cache_layer import SemanticCache, CacheLayer, CacheConfig
from src.security import JWTHandler, RBACAuthorizer, AuditLogger
from src.observability import StructuredLogger, MetricsCollector, Tracer, HealthChecker
from src.api import APIRouter

# 1. 설정 로드
cfg = ConfigLoader.load("config/production.yaml")

# 2. Observability 먼저 초기화 (다른 컴포넌트에서 사용)
logger  = StructuredLogger("my-ai-service")
metrics = MetricsCollector()
tracer  = Tracer(service_name="my-ai-service")
checker = HealthChecker(version=cfg.get("app.version", "1.0.0"))

# 3. LLM Gateway
gateway = LLMGateway(GatewayConfig(
    providers=[LLMConfig(
        provider=LLMProvider.OPENAI,
        model=cfg.get("llm.openai.model", "gpt-4o"),
        api_key=cfg.get("llm.openai.api_key"),
    )],
    routing_strategy=RoutingStrategy(cfg.get("llm.routing", "round_robin")),
))

# 4. Vector DB (사용하는 경우만)
db_config = VectorDBConfig(
    provider=VectorDBProvider(cfg.get("vector_db.provider", "pinecone")),
    api_key=cfg.get("vector_db.api_key"),
    index_name=cfg.get("vector_db.index_name", "knowledge"),
    dimension=cfg.get("vector_db.dimension", 1536),
)
ConnectorClass = CONNECTOR_MAP[cfg.get("vector_db.provider")]

# 5. Prompt Repository
prompt_repo = PromptRepository()
_register_prompts(prompt_repo)

# 6. Cache Layer (사용하는 경우만)
cache = CacheLayer(CacheConfig(ttl_seconds=300, max_size=1000))
semantic_cache = SemanticCache(embed_fn=lambda t: ..., similarity_threshold=0.92)

# 7. Security
jwt   = JWTHandler(secret_key=cfg.get("security.jwt_secret"), expire_seconds=3600)
rbac  = RBACAuthorizer({"admin": ["read","write","delete"], "viewer": ["read"]})
audit = AuditLogger()

# 8. Health Checks 등록
@checker.register("llm_gateway")
def _check_llm():
    if not any(s["is_healthy"] for s in gateway.get_usage_summary().values()):
        raise RuntimeError("모든 LLM 프로바이더 비정상")

# 9. API 라우터
router = APIRouter(prefix="/api/v1")
logger.info("서비스 초기화 완료", version=cfg.get("app.version"))
```



### 6-5. 표준 배포 (GitLab CI + Harbor + Kubernetes GitOps)

팀에서 `DEPLOYMENT_PROMPT.md`(*표준 배포 파일 생성 프롬프트 — 공용*)를 쓰는 경우, 아래 산출물을 둡니다. **Harbor Push·**`update-gitops`**·Fleet·포트·ConfigMap/Secret·Runner 태그·pull secret** 등은 **해당 문서가 본 가이드보다 우선**합니다.


| 산출물                | 경로                                      |
| ------------------ | --------------------------------------- |
| GitLab CI 파이프라인    | `/.gitlab-ci.yml` (`build` → `update-gitops`)  |
| GitOps 매니페스트       | `/gitops/` (`fleet.yaml` **`defaultNamespace: "<키>"` 따옴표**, `apps/backend|frontend/...`의 `metadata.namespace`도 동일) |
| 백엔드 이미지            | `/backend/Dockerfile`                   |
| 프론트엔드 이미지          | `/frontend/Dockerfile`                  |
| 로컬 전용 Compose (선택) | `/docker-compose.yml` — **운영 CD 미사용**   |


**AS-IS → TO-BE**: Runner가 `docker compose up`으로 런타임에 직접 배포하던 방식은 폐기하고, **이미지 빌드 → Harbor → GitOps YAML 이미지 태그 갱신 → Fleet 동기화**로 전환합니다.

배포 파일을 자동 생성할 때는 `DEPLOYMENT_PROMPT.md`의 **「프로젝트 변수」+「프롬프트 본문」**을 함께 씁니다. (빌드 컨텍스트는 **레포 루트**.)  
빈 레포면 **§6-0** + 배포 문서의 **「빈 레포에서 처음부터」**를 따른다.  
배포 프롬프트 실행 시에도 **Cursor Rule 압축 +** `git-push` **Skill**이 필수이며, 세부은 해당 문서 **Step 7**.  

**최초 파이프라인 성공을 위한 [MUST] (사람 + 에이전트)** — 상세·예시는 `DEPLOYMENT_PROMPT.md` Step 5·사전 요구사항·흔한 실패:

1. **CI 골격**: `DEPLOYMENT_PROMPT.md` Step 5의 **전체 `.gitlab-ci.yml` YAML**을 그대로 쓰고 **프로젝트 키만** 치환한다 (`real-test2` 검증 패턴). 구조·스크립트 임의 변경 금지.
2. **DinD**: **반드시** `dockerd-entrypoint.sh &` (인자·리다이렉트 없음). `dockerd-entrypoint.sh dockerd … &` 금지 → 소켓 연결 실패 원인.
3. **Harbor TLS (레포별 편차)**: Step 5 `before_script`의 CA 설치·`insecure-registries` 블록을 **축약하지 않는다**.  
   - `HARBOR_REGISTRY` = 호스트만 (`https://` 금지)  
   - `HARBOR_CA_CERT` = **서명 CA**(leaf 금지), **base64 또는 PEM**  
   - certs.d + `:443` + (가능 시) system CA + dockerd **전** `daemon.json` `insecure-registries`  
   - 증상 `x509: certificate signed by unknown authority` — 변수는 있는데도 형제는 되고 이 레포만 실패하는 전형. 조치·표는 `DEPLOYMENT_PROMPT.md` **「흔한 실패」·Step 5 Harbor MUST**.
4. **YAML 콜론**: `git commit -m "ci: …"` 줄은 **반드시** `'…'` 또는 `|` 로 감싼다 (`script config should be a string…` 방지).
5. **프로젝트 키 따옴표 [MUST]**:  
   - **CI**: `default.tags` · `HARBOR_PROJECT` → `"01774"`  
   - **GitOps**: `gitops/fleet.yaml`의 **`defaultNamespace: "01774"`** · 모든 **`metadata.namespace: "01774"`** · 라벨 `project`  
   - 미인용 숫자/leading zero → YAML 정수·8진수(`01774`→`1020`) → GitLab **`tags config should be an array of strings`** **또는** Fleet **`Failed to process bundle` / `cannot unmarshal number into … defaultNamespace of type string`** (`DEPLOYMENT_PROMPT.md` Step 4·5 MUST).
6. **`GITOPS_GIT_TOKEN`**: Project Access Token **Maintainer** + `write_repository`. Protected `main` **Allowed to push** 포함. push는 `credential.helper=` + PAT URL.
7. Harbor Project·`HARBOR_*`·`HARBOR_CA_CERT`·Runner 태그·pull secret·Runner `privileged=true` 사전 준비.

### 6-6. Cursor Rule·git-push Skill 필수 산출 ([MUST])

`@AI_PLATFORM_DEV_GUIDE.md`로 **신규 프로젝트 시작·스캐폴드·초기 틀 잡기**를 수행하는 에이전트는, 앱 코드 생성과 **같은 실행 단위**에서 아래를 **반드시** 수행한다.  
(사용자가 “rule 만들어줘”를 따로 말하지 않아도 된다. 문서만 실행해도 산출한다.)

#### 목적


| 산출                                 | 역할                                                      |
| ---------------------------------- | ------------------------------------------------------- |
| `.cursor/rules/*.mdc`              | 긴 가이드를 **짧은 상시 제약**으로 압축 → 이후 채팅에서 반복 `@` 없이도 준수        |
| `.cursor/skills/git-push/SKILL.md` | “커밋/푸시/파이프라인” 요청 시 밟는 **절차** (제약은 Rule에 두고, Skill은 순서만) |




#### Rule 파일 (압축·작성)

이미 있으면 **프로젝트 식별값·스택에 맞게 갱신**한다. 없으면 생성한다. 각 파일은 **가급적 ~50줄 이내**, YAML frontmatter 포함.


| 파일                                       | frontmatter            | 넣을 내용 (가이드에서 압축)                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.cursor/rules/project-overview.mdc`     | `alwaysApply: true`    | 스택, 모노레포(`frontend`/`backend`/`gitops`), 루트 Docker 컨텍스트, 문서 우선순위(`DEPLOYMENT_PROMPT.md` > 본 가이드), **이 레포의** 프로젝트 키·`APP_PORT`(NNN 규칙 또는 8000)·Namespace·Runner 태그·pull secret 이름, Skip Rule, 비밀은 ConfigMap/Secret                                                                 |
| `.cursor/rules/ai-platform-backend.mdc`  | `globs: backend/**/*`  | App(`backend/app/`) vs Framework(`backend/src/`) 레이어, 사용 컴포넌트만 도입, 금지→권장 표(`openai` 직접→`LLMGateway`, 하드코딩 프롬프트→`PromptRepository`, `print`→`StructuredLogger`, `os.getenv` 로직→`ConfigLoader`, `ValueError`→`FrameworkError`), API/`ErrorResponse`, Config·Errors 필수 |
| `.cursor/rules/ai-platform-frontend.mdc` | `globs: frontend/**/*` | Vite 5 / TS 5 strict / React 18 / Tailwind 3, nginx `/api/` → backend, Ingress Host=`<GitLab레포명>.k8s.wonikqnc.com` · class=traefik · Ingress tls 금지(엣지 HTTPS), Rancher proxy absolute `/api` 함정, 로컬 `server.proxy`, 비밀 금지, `components/`·`lib/` |
| `.cursor/rules/deployment.mdc`           | 배포 관련 globs            | **내용·포트·GitOps·Ingress는** `DEPLOYMENT_PROMPT.md` **우선**. CI는 Step 5 **전체 YAML**·**`dockerd-entrypoint.sh &`만**. **Harbor TLS before_script 축약 금지**(PEM\|base64·host 정규화·certs.d+`:443`·`insecure-registries`). stages=`build`→`update-gitops`. **Ingress MUST**: traefik + **no `spec.tls`/websecure**. **CI script 콜론 함정**·**프로젝트 키 따옴표**·**GITOPS_GIT_TOKEN=Maintainer**. 가이드만 선행 시 플레이스홀더+TODO 후 배포 프롬프트로 확정 |


**압축 원칙**: DO/DON'T·포트·레이어·Skip Rule 등 **에이전트가 매 편집마다 지킬 제약만** 남긴다. 긴 코드 예시는 Rule에 복사하지 않는다.

#### git-push Skill (자동 추가)

경로: `.cursor/skills/git-push/SKILL.md` (없으면 생성, 있으면 프로젝트 CI 사실에 맞게 갱신).

필수 frontmatter 예:

```yaml
---
name: git-push
description: >-
  Runs the team ship workflow for this GitLab monorepo: review changes, commit
  safely, push to main, and verify the CI pipeline (build → deploy). Use when
  the user asks to commit, push, ship, 커밋, 푸시, main에 올려, 파이프라인
  확인해, or release via GitLab CI.
---
```

본문에 **반드시** 포함할 항목:

1. Rule과의 역할 분리 — 포트·CI·비밀 **제약**은 `.cursor/rules/deployment.mdc` / `DEPLOYMENT_PROMPT.md`; Skill은 **실행 순서만**
2. 절대 규칙 — 사용자 명시 요청 시에만 커밋/푸시; `git config` 변경·`main` force push·`--no-verify` 금지; `backend/.env` 등 비밀 스테이징 제외
3. 이 레포 CI 사실 표 — 원격 GitLab, 배포 브랜치 `main`만, Runner 태그, `stages: build → deploy`(`test` 없음), `changes` 경로에 따른 job, 프로젝트 키·호스트/컨테이너 포트
4. 표준 순서 — 상태 수집 → 커밋 범위·비밀 검사 → 커밋(요청 시) → push → 파이프라인·헬스 안내
5. 커밋 메시지 — **한국어** (경로·제품명·환경변수 키 등만 영어 허용)
6. 요청 분기 — 커밋만 / 푸시 / 커밋+푸시 / 파이프라인만
7. PowerShell 환경이면 heredoc 대신 `@" "@` 커밋 예시

배포 파일을 `@DEPLOYMENT_PROMPT.md`로 만든 직후라면, 그 문서 **Step 7**과 **중복 생성하지 말고** 같은 파일을 프로젝트 변수로 **한 번 더 맞춰 갱신**해도 된다.

#### 완료 보고

에이전트는 스캐폴드 끝에 생성·갱신한 경로 목록을 짧게 보고한다.

- `.cursor/rules/project-overview.mdc`
- `.cursor/rules/ai-platform-backend.mdc`
- `.cursor/rules/ai-platform-frontend.mdc`
- `.cursor/rules/deployment.mdc` (또는 DEPLOYMENT 측으로 위임한 경우 그 사실)
- `.cursor/skills/git-push/SKILL.md`

---



## 7. 기능 개발 플로우



### 7-1. 어느 모듈에 넣을지 판단

새 기능 개발 시 가장 먼저 **어느 컴포넌트에 속하는지** 결정합니다.  
해당 컴포넌트가 프로젝트에서 스킵된 경우, 관련 기능 개발은 건너뜁니다 (§1-3 참고).


| 기능 유형          | 추가 위치                                                         |
| -------------- | ------------------------------------------------------------- |
| 새 LLM 프로바이더 연동 | `src/llm_gateway/providers.py` → `PROVIDER_MAP` 등록            |
| 새 Vector DB 연동 | `src/vector_db/`에 커넥터 파일 추가 → `CONNECTOR_MAP` 등록              |
| 프롬프트 추가/수정     | `src/prompt_repository/` (버전 관리 통해서)                          |
| 캐시 전략 추가       | `src/cache_layer/strategies.py`                               |
| 새 API 엔드포인트    | `src/api/router.py` + `schemas.py`                            |
| 인증 방식 변경       | `src/security/auth.py`                                        |
| 새 암호화 알고리즘     | `src/security/encryption.py`                                  |
| 새 메트릭 지표 추가    | `src/observability/metrics.py`                                |
| 공통 설정 항목 추가    | `src/config/properties.py`                                    |
| 새 예외 타입 추가     | `src/errors/exceptions.py` + `messages.py`                    |
| UI·화면·클라이언트 상태 | `frontend/src/` (컴포넌트·훅·API 클라이언트) — **백엔드 OpenAPI/스키마와 동기화** |




### 7-2. 표준 개발 순서

```
1. 요구사항 분석 → 어느 컴포넌트인지 결정
         ↓
2. types.py 먼저 작성 (입출력 타입 정의)
         ↓
3. 핵심 로직 구현 (추상 인터페이스 구현 또는 기존 클래스 확장)
         ↓
4. __init__.py 에 공개 API 노출
         ↓
5. 단위 테스트 작성 (tests/test_<모듈명>.py)
         ↓
6. examples/ 에 사용 예제 추가
         ↓
7. `backend/`: make format → make lint → make test · `frontend/`: lint·`npm run build` 통과 확인
         ↓
8. PR 생성 — §11 체크리스트 확인
```



### 7-3. 컴포넌트 조합 패턴 — RAG 서비스 예시

```python
from src.llm_gateway import LLMGateway, LLMRequest, LLMMessage
from src.vector_db import CONNECTOR_MAP, VectorDBConfig
from src.prompt_repository import PromptRepository
from src.cache_layer import SemanticCache
from src.observability import StructuredLogger, MetricsCollector, Tracer
from src.security import RBACAuthorizer, AuditLogger
from src.errors.exceptions import ValidationError


class RAGService:
    """RAG 파이프라인 — ai-framework 7개 컴포넌트를 조합한 서비스 예시."""

    def __init__(self, gateway, vector_db_config, prompt_repo,
                 semantic_cache, logger, metrics, tracer, rbac, audit):
        self._gateway = gateway
        self._db_config = vector_db_config
        self._prompts = prompt_repo
        self._cache = semantic_cache
        self._log = logger.bind(service="rag")
        self._metrics = metrics
        self._tracer = tracer
        self._rbac = rbac
        self._audit = audit

    def query(self, auth_ctx, question: str, top_k: int = 5) -> str:
        self._rbac.require(auth_ctx, action="read")

        if not question.strip():
            raise ValidationError("질문이 비어있습니다.", field="question")
        if len(question) > 5000:
            raise ValidationError("질문이 너무 깁니다.", field="question")

        with self._tracer.start_span("rag.query", tags={"user": auth_ctx.user_id}) as span:
            result = self._cache.get_or_compute(
                query=question,
                compute_fn=lambda q: self._execute_rag(q, top_k, span)
            )

        self._audit.log("rag.query", user_id=auth_ctx.user_id, resource="knowledge-base")
        self._metrics.increment("rag.queries.total")
        return result

    def _execute_rag(self, question: str, top_k: int, parent_span) -> str:
        with self._tracer.start_span("vector_db.search", parent=parent_span) as db_span:
            query_vector = self._embed(question)
            with CONNECTOR_MAP[self._db_config.provider.value](self._db_config) as db:
                results = db.query(query_vector, top_k=top_k)
            db_span.set_tag("results_count", len(results))

        context = "\n\n".join([r.metadata.get("text", "") for r in results])

        with self._tracer.start_span("prompt.render", parent=parent_span):
            prompt = self._prompts.render("rag-qa", question=question, context=context)

        with self._tracer.start_span("llm.complete", parent=parent_span) as llm_span:
            response = self._gateway.complete(
                LLMRequest(messages=[LLMMessage(role="user", content=prompt)])
            )
            llm_span.set_tag("provider", response.provider)
            llm_span.set_tag("tokens", response.usage.get("total_tokens", 0))

        self._log.info("RAG 쿼리 완료", latency_ms=response.latency_ms, results_count=len(results))
        self._metrics.record("rag.latency_ms", response.latency_ms or 0)
        return response.content
```

---



## 8. 코드 스타일 & 품질 기준



### 8-1. 언어·런타임 버전

**백엔드 (Python)**

- **Python** `>= 3.9` 이상에서 동작하도록 작성합니다.
- `from __future__ import annotations` 선언으로 구버전 타입 힌트 호환성을 확보합니다.

**프론트엔드 (**`frontend/`**)**

- **TypeScript 5** — `tsconfig.json`에서 `strict` 권장.
- **React 18** — 루트는 `createRoot` API 사용.
- **Vite 5** — 개발 서버·빌드는 Vite CLI 기준.
- **Tailwind CSS** — 유틸리티 클래스 위주; 공통 토큰은 `tailwind.config`의 `theme.extend`로 정렬합니다.



### 8-2. 포맷터 및 린터

**백엔드 (Python)**


| 도구      | 역할     | 설정                   |
| ------- | ------ | -------------------- |
| `black` | 코드 포맷터 | `line-length = 100`  |
| `ruff`  | 린터     | E, F, I, N, W 규칙 활성화 |
| `mypy`  | 타입 체커  | 기본 설정 (`strict` 권장)  |


```bash
cd backend
make format   # black + ruff --fix 자동 수정
make lint     # ruff 검사 + mypy 타입 체크
make test     # pytest 전체 테스트

# PR 생성 전 반드시 통과
make format && make lint && make test
```

**프론트엔드 (**`frontend/`**)**


| 도구             | 역할          | 비고                                                   |
| -------------- | ----------- | ---------------------------------------------------- |
| ESLint         | TS/React 린트 | `@typescript-eslint`, `eslint-plugin-react-hooks` 권장 |
| Prettier       | 코드 포맷       | Tailwind용 플러그인은 팀 규칙에 맞게 선택                          |
| `tsc --noEmit` | 타입 검사       | CI에서 Vite 빌드와 병행 가능                                  |


```bash
cd frontend
npm run lint
npm run build
```



### 8-3. 타입 힌트

**백엔드 (Python)** — 모든 공개 함수와 메서드에 **타입 힌트를 필수로 작성**합니다.

**프론트엔드 (TypeScript)** — `strict` 모드에서 `any` **남용 금지**, API 응답·폼 상태 등은 **명시적 타입 또는 생성된 클라이언트 타입**을 사용합니다.

```python
# ✅ 올바른 타입 힌트
def summarize(text: str, max_lines: int = 3, language: str = "한국어") -> Optional[str]:
    ...

# ❌ 금지
def summarize(text, max_lines=3):
    ...
```



### 8-4. 네이밍 규칙

**백엔드 (Python)**


| 대상      | 규칙                | 예시                               |
| ------- | ----------------- | -------------------------------- |
| 모듈/패키지  | `snake_case`      | `llm_gateway`, `vector_db`       |
| 클래스     | `PascalCase`      | `LLMGateway`, `SemanticCache`    |
| 함수/변수   | `snake_case`      | `create_token`, `api_key`        |
| 상수      | `UPPER_CASE`      | `MAX_RETRY_COUNT`, `DEFAULT_TTL` |
| Private | 언더스코어 접두사         | `_client`, `_validate_input()`   |
| 타입 파일   | `types.py`        | —                                |
| 테스트 파일  | `test_<모듈명>.py`   | `test_llm_gateway.py`            |
| 예제 파일   | `<기능>_example.py` | `rag_example.py`                 |


**프론트엔드 (TypeScript / React)**


| 대상            | 규칙                                     | 예시                                 |
| ------------- | -------------------------------------- | ---------------------------------- |
| React 컴포넌트 파일 | `PascalCase.tsx`                       | `ChatPanel.tsx`                    |
| 훅·유틸 모듈       | `camelCase.ts`                         | `useChatStream.ts`, `apiClient.ts` |
| 디렉터리 (선택)     | 기능 단위 `kebab-case` 또는 `camelCase` 팀 통일 | `components/chat/`                 |




### 8-5. Docstring 형식

```python
class RAGService:
    """
    RAG(Retrieval-Augmented Generation) 파이프라인 서비스.

    Example:
        service = RAGService(gateway, db_config, ...)
        answer = service.query(auth_ctx, "2024년 매출은 얼마인가요?")
    """

    def query(self, auth_ctx: AuthContext, question: str, top_k: int = 5) -> str:
        """
        사용자 질문에 대해 RAG 파이프라인을 실행합니다.

        Args:
            auth_ctx: 인증된 사용자 컨텍스트 (JWTHandler.verify_token() 결과)
            question: 사용자 질문 (최대 5000자)
            top_k: 검색할 관련 문서 수 (기본값: 5)

        Returns:
            LLM이 생성한 답변 문자열

        Raises:
            ValidationError: question이 비어있거나 5000자 초과 시
            PermissionError: read 권한 없는 사용자
        """
        ...
```

---



## 9. 테스트 작성 가이드



### 9-1. 테스트 파일 위치 및 네이밍

**백엔드** — 아래 트리는 `backend/tests/` 기준입니다.

```
tests/
├── unit/                    # 단위 테스트 (외부 의존성 Mock)
│   ├── test_llm_gateway.py
│   ├── test_vector_db.py
│   ├── test_prompt_repository.py
│   ├── test_cache_layer.py
│   ├── test_api.py
│   ├── test_security.py
│   └── test_observability.py
└── integration/             # 통합 테스트 (실제 인프라 연결)
    ├── test_rag_pipeline.py
    └── test_full_flow.py
```



### 9-2. Mock 패턴 — LLM Gateway

```python
import pytest
from unittest.mock import MagicMock
from src.llm_gateway import LLMGateway, LLMResponse

@pytest.fixture
def mock_gateway():
    gateway = MagicMock(spec=LLMGateway)
    gateway.complete.return_value = LLMResponse(
        content="모의 LLM 응답입니다.",
        model="gpt-4o",
        provider="openai",
        usage={"prompt_tokens": 50, "completion_tokens": 30, "total_tokens": 80},
        finish_reason="stop",
        latency_ms=123.4,
    )
    return gateway

def test_summarize_calls_gateway(mock_gateway, prompt_repo):
    service = SummarizeService(gateway=mock_gateway, prompt_repo=prompt_repo)
    result = service.summarize("테스트 문서 내용...")
    mock_gateway.complete.assert_called_once()
    assert "모의 LLM 응답" in result
```



### 9-3. Mock 패턴 — Vector DB

```python
from unittest.mock import MagicMock
from src.vector_db import VectorDBConnector, QueryResult

@pytest.fixture
def mock_vector_db():
    db = MagicMock(spec=VectorDBConnector)
    db.__enter__ = MagicMock(return_value=db)
    db.__exit__ = MagicMock(return_value=False)
    db.query.return_value = [
        QueryResult(id="doc-001", score=0.95, metadata={"text": "관련 문서 내용"}),
        QueryResult(id="doc-002", score=0.87, metadata={"text": "두 번째 문서"}),
    ]
    return db
```



### 9-4. Cache Layer 테스트

```python
from src.cache_layer import CacheLayer, CacheConfig

def test_cache_hit():
    cache = CacheLayer(CacheConfig(ttl_seconds=60, max_size=10))
    cache.set("key1", "value1")
    assert cache.get("key1") == "value1"
    assert cache.get_stats().total_hits == 1

def test_cache_decorator():
    cache = CacheLayer(CacheConfig(ttl_seconds=60))
    call_count = 0

    @cache.cached(ttl=60)
    def expensive_fn(x: int) -> int:
        nonlocal call_count
        call_count += 1
        return x * 2

    assert expensive_fn(5) == 10
    assert expensive_fn(5) == 10  # 캐시 히트
    assert call_count == 1         # 실제 함수는 1번만 호출됨
```



### 9-5. Security 테스트

```python
from src.security import JWTHandler, RBACAuthorizer
from src.security.types import AuthContext
from src.errors.exceptions import PermissionError

def test_jwt_create_and_verify():
    handler = JWTHandler(secret_key="test-secret-key", expire_seconds=3600)
    token = handler.create_token(user_id="user-42", roles=["editor"])
    claims = handler.verify_token(token)
    assert claims.sub == "user-42"
    assert "editor" in claims.roles

def test_rbac_permission_denied():
    rbac = RBACAuthorizer({"viewer": ["read"]})
    ctx = AuthContext(user_id="user-1", roles=["viewer"])
    with pytest.raises(PermissionError):
        rbac.require(ctx, action="delete")
```

---



## 10. DO / DON'T 요약



### ✅ DO — 반드시 해야 하는 것


| #   | DO                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | LLM 호출은 **항상** `LLMGateway.complete()`를 통한다                                                                                                            |
| 2   | Vector DB는 **항상** `with connector:` 컨텍스트 매니저로 사용한다                                                                                                     |
| 3   | 프롬프트는 **항상** `PromptRepository`에 등록하고 `render()`로 가져온다                                                                                                 |
| 4   | LLM 응답 캐싱은 **`SemanticCache`**를 사용한다                                                                                                                   |
| 5   | 모든 로그는 **`StructuredLogger`**로 JSON 포맷으로 출력한다                                                                                                          |
| 6   | 외부 I/O는 **`Tracer`**로 분산 추적한다                                                                                                                          |
| 7   | 인증은 `**JWTHandler.verify_token()`**, 인가는 `**RBACAuthorizer.require()`**로 처리한다                                                                          |
| 8   | 민감 데이터는 **`AES256Cipher`**로 암호화 후 저장한다                                                                                                                 |
| 9   | 보안 이벤트는 **`AuditLogger.log()`**로 기록한다                                                                                                                  |
| 10  | 설정은 **`ConfigLoader`**를 통해서만 읽는다                                                                                                                       |
| 11  | 예외는 `**FrameworkError`** 파생 타입을 사용한다                                                                                                                   |
| 12  | 신규 프로바이더/커넥터 추가는 **인터페이스 구현 + MAP 등록** 패턴을 따른다                                                                                                         |
| 13  | 비밀·LLM 키는 **클러스터 Secret/ConfigMap**(및 로컬 `backend/.env`)에만 두고, 프론트에는 `VITE_`***로 공개 가능한 값** 또는 `DEPLOYMENT_PROMPT.md`**에 정의된 동일 오리진** `/api/` 호출만 허용한다 |




### ❌ DON'T — 절대 하지 말아야 하는 것


| #   | DON'T                                             | 대신 사용                                                                                                     |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `openai.ChatCompletion.create()` 직접 호출            | `LLMGateway.complete()`                                                                                   |
| 2   | `requests.get()`, `httpx.Client()` 직접 호출          | `APIClient`                                                                                               |
| 3   | 프롬프트 문자열을 코드에 하드코딩                                | `PromptRepository`                                                                                        |
| 4   | `print()`, `logging.getLogger()` 직접 사용            | `StructuredLogger`                                                                                        |
| 5   | `os.getenv()` 비즈니스 로직에서 직접 호출                     | `ConfigLoader`                                                                                            |
| 6   | `raise ValueError(...)` 또는 `raise Exception(...)` | `FrameworkError` 파생 타입                                                                                    |
| 7   | 민감 데이터 평문 저장                                      | `AES256Cipher.encrypt_str()` 후 저장                                                                         |
| 8   | 로그인/삭제/권한 변경 이벤트 로그 누락                            | `AuditLogger.log()`                                                                                       |
| 9   | 여러 인스턴스가 있는 환경에서 L1 캐시만 사용                        | `MultiTierCache(l1, l2)`                                                                                  |
| 10  | 새 프롬프트를 바로 100% 트래픽에 적용                           | `PromptABTester`로 검증 후 배포                                                                                 |
| 11  | 새 LLM Provider를 `gateway.py`에 직접 추가               | `providers.py`에 `BaseLLMProvider` 구현                                                                      |
| 12  | 역할 문자열 직접 비교 (`if user.role == "admin":`)         | `RBACAuthorizer.has_permission()`                                                                         |
| 13  | LLM·DB 비밀번호를 `VITE_*` 또는 프론트 코드에 넣음               | 비밀은 **Secret/ConfigMap**(로컬은 `backend/.env`); 프론트는 공개 URL·상대 `/api/` 등 `DEPLOYMENT_PROMPT.md`**가 정한 방식**만 |


---



## 11. 개발 체크리스트

PR 생성 또는 코드 리뷰 시 아래 항목을 확인합니다.

> **Skip Rule**: `(해당 컴포넌트 사용 시만 확인)` 표시가 있는 섹션은 해당 컴포넌트를 사용하지 않는 프로젝트에서 **섹션 전체를 건너뜁니다.** 사용 여부는 프로젝트 `config.yaml` 또는 README 기준입니다.

---



### ✅ 공통 — 모든 프로젝트 필수 확인

- `frontend/`**·**`backend/` 변경 시 각각 **해당 폴더의 린트·빌드·테스트**가 CI에서 통과하는가? (한쪽만 수정해도 양쪽 회귀를 점검)
- `DEPLOYMENT_PROMPT.md`**를 쓰는 프로젝트**라면, `.gitlab-ci.yml`·`docker-compose.yml`·각 `Dockerfile`이 해당 프롬프트와 **경로·컨텍스트·포트·env_file**까지 일치하는가?
- `.gitlab-ci.yml` 이 **검증 골격**인가? (`DEPLOYMENT_PROMPT.md` Step 5 전체 YAML = `real-test2` 패턴, 프로젝트 키만 치환; `dockerd-entrypoint.sh &`; **Harbor TLS before_script 축약 없음**(PEM\|base64·certs.d+`:443`·`insecure-registries`); `build`→`update-gitops`; dotenv `BUILT_*_IMAGE`; `GITOPS_*_FILE=apps/...`; alpine/git; 중첩 clone 없음)
- `script`/`before_script` 에 **따옴표 없는 `:`** (예: `ci: update…`)가 없어 YAML 맵으로 파싱되지 않는가?
- `default.tags`·`HARBOR_PROJECT`·`fleet.yaml` `defaultNamespace`·`metadata.namespace` 가 **`"프로젝트키"` 따옴표 문자열**인가? (미인용 `01774` 등 → int/8진수 → CI tags 오류 또는 Fleet `cannot unmarshal number into … defaultNamespace`)
- `GITOPS_GIT_TOKEN` 이 **Maintainer + write_repository** 이고 protected `main` Allowed to push가 준비됐는가? (푸시 시 PAT URL + `credential.helper=`)
- 이 코드가 속할 컴포넌트(또는 공통 유틸리티)가 명확하게 정의되어 있는가?
- 모듈 경계를 지켰는가? (서비스 코드가 외부 SDK를 직접 호출하지 않는가?)
- 컴포넌트 간 순환 의존성이 없는가?
- 설정값은 `ConfigLoader`를 통해 주입되는가? (`os.getenv()` 직접 호출 없음)
- 예외는 `FrameworkError` 파생 타입을 사용하는가?
- 모든 공개 함수에 타입 힌트가 있는가?
- `backend/`에서 `make format && make lint && make test`(또는 동등 스크립트), `frontend/`에서 `npm run lint`·`npm run build`를 통과했는가?
- 단위 테스트가 추가 또는 업데이트되었는가?
- 프로젝트에서 사용하는 컴포넌트 목록이 `config.yaml` 또는 README에 명시되어 있는가?

---



### 🤖 LLM Gateway (해당 컴포넌트 사용 시만 확인)

> LLM을 전혀 호출하지 않는 프로젝트는 이 섹션을 건너뜁니다.

- LLM 호출은 `LLMGateway.complete()` 또는 `complete_async()`를 통하는가?
- `openai`, `anthropic` 등 외부 SDK를 서비스 코드에서 직접 호출하는 코드가 없는가?
- `LLMGateway` 인스턴스는 서비스 내 1개만 생성하고 DI로 주입하는가?
- 라우팅 전략이 설정 파일에서 주입되는가? (코드 하드코딩 없음)

---



### 🗄️ Vector DB (해당 컴포넌트 사용 시만 확인)

> RAG, 유사도 검색, 임베딩 저장 기능이 없는 프로젝트는 이 섹션을 건너뜁니다.

- Vector DB 접근은 `VectorDBConnector`를 통하는가? (직접 SDK 호출 없음)
- 커넥터는 `with connector:` 컨텍스트 매니저 패턴으로 사용하는가?
- 인덱스 생성 전 `IndexStrategyAdvisor.recommend()`로 전략을 검토했는가?
- 운영 환경에 `BackupPolicy`가 코드로 정의되어 있는가?

---



### 📝 Prompt Repository (해당 컴포넌트 사용 시만 확인)

> 프롬프트 변경 이력 관리가 불필요한 경우 이 섹션을 건너뜁니다. (LLM 사용 프로젝트는 도입을 강력 권장)

- 프롬프트 문자열이 코드에 하드코딩되어 있지 않은가?
- 프롬프트는 `PromptRepository.render()`를 통해 사용하는가?
- 프롬프트 변경 시 `add_version()` → `promote()` 흐름을 따르는가?
- 새 프롬프트를 100% 트래픽에 바로 적용하지 않고 A/B 테스트로 검증했는가?

---



### ⚡ Cache Layer (해당 컴포넌트 사용 시만 확인)

> 응답 속도·비용 최적화가 불필요하거나 소규모 PoC 수준이면 이 섹션을 건너뜁니다.

- LLM 응답 캐싱에 `SemanticCache.get_or_compute()`를 사용하는가?
- `similarity_threshold`가 0.90 이상으로 설정되어 있는가?
- 다중 인스턴스 환경에서 L1 캐시만 단독으로 사용하지 않는가?

---



### 🌐 API (해당 컴포넌트 사용 시만 확인)

> 외부 HTTP 호출이 전혀 없는 순수 배치/스크립트 프로젝트는 이 섹션을 건너뜁니다.

- 외부 API 호출은 `APIClient`를 통하는가? (`requests`, `httpx` 직접 사용 없음)
- 엔드포인트는 `APIRouter`에 등록되어 있는가?
- 에러 응답은 `ErrorResponse` 스키마를 사용하는가?

---



### 🔒 Security (해당 컴포넌트 사용 시만 확인)

> 인증이 불필요한 내부 단독 실행 스크립트에서만 이 섹션을 건너뜁니다. HTTP 엔드포인트가 있는 프로젝트는 반드시 확인합니다.

- 모든 API 엔드포인트에 `JWTHandler.verify_token()` 검증이 적용되어 있는가?
- 권한 체크는 `RBACAuthorizer.require()`로 처리하는가?
- 민감 데이터는 `AES256Cipher`로 암호화 후 저장하는가?
- 로그인, 권한 변경, 데이터 삭제 이벤트가 `AuditLogger.log()`에 기록되는가?

---



### 📊 Observability (해당 컴포넌트 사용 시만 확인)

> 로컬 실험·일회성 스크립트에서만 이 섹션을 건너뜁니다. 운영 환경에 배포되는 서비스는 반드시 확인합니다.

- 로그에 `StructuredLogger`를 사용하는가? (`print()`, `logging.getLogger()` 직접 사용 없음)
- 비즈니스 메트릭이 `MetricsCollector`에 기록되고 있는가?
- 외부 I/O에 `Tracer`가 적용되어 있는가?
- 모든 외부 의존성이 `HealthChecker`에 등록되어 있는가?

---

> **언어**: 모든 코드 예시는 Python 기준이며, 다른 언어로 구현 시 동일한 컴포넌트 설계 원칙을 따르되 해당 언어의 관용적인 방식으로 적용합니다.  
> **확장**: 프레임워크에 포함되지 않은 기능은 자유롭게 추가 개발할 수 있습니다. 기본 인프라 레이어만 이 틀을 기반으로 구현하기를 권장합니다.  
> **버전**: 이 가이드는 `ai-framework v2.0` 기준으로 작성되었습니다.  
> **최종 수정**: 2026-03-12

