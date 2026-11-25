# 표준 배포 파일 생성 프롬프트 (GitLab CI + Kubernetes GitOps / Rancher Fleet)

> **공용 템플릿.** 사람·레포마다 이름·포트·태그가 달라도 이 문서 하나로 세팅한다.  
> 새 프로젝트 루트에서 Cursor를 열고 **"프롬프트 본문"** + 아래에 채운 **"프로젝트 변수"** 를 함께 붙여 넣는다.
>
> | 산출 | 경로 |
> | --- | --- |
> | GitLab CI | `/.gitlab-ci.yml` |
> | Backend 이미지 | `/backend/Dockerfile` |
> | Frontend 이미지 | `/frontend/Dockerfile` |
> | GitOps 매니페스트 | `/gitops/**` (`fleet.yaml`, `apps/backend|frontend/...`) |
> | Cursor Rules | `.cursor/rules/*.mdc` (특히 `deployment.mdc`, `project-overview.mdc`) |
> | git-push Skill | `.cursor/skills/git-push/SKILL.md` |
>
> **[MUST]** 배포 산출물과 **같은 실행**에서 Rule·Skill을 반드시 생성·갱신한다.  
> (사용자가 “rule/skill 만들어줘”를 따로 말하지 않아도 된다. 상세는 **Step 7**.)
>
> 레포마다 다른 값(키, 러너 태그, `APP_PORT`, Harbor, Namespace, pull secret 이름)은  
> **오직 [프로젝트 변수](#프로젝트-변수-복사전-채우기) 블록만** 채운다. 본문의 하드코딩 예시는 쓰지 않는다.

---

## 빈 레포에서 처음부터 (공용 초기 세팅)

앱 골격 + 배포 TO-BE를 **한 번에** 만들 때는 두 문서를 **함께** 준다. 배포만 있으면 `AI_PLATFORM` 없이 본 문서만으로도 된다.

```text
# Cursor — 그린필드(신규) 권장
@AI_PLATFORM_DEV_GUIDE.md
@DEPLOYMENT_PROMPT.md

아래 [프로젝트 변수]로 frontend·backend·gitops·CI·Rule·Skill을 전부 생성해줘.
스킵할 AI 컴포넌트(있을 경우)도 명시해줘. (예: LLM/Vector/Security 스킵)

[프로젝트 변수]
- 프로젝트 키              : <레포명>
- ...
```

| 순서 | 누가 | 할 일 |
| --- | --- | --- |
| 1 | 사람 | GitLab 빈 레포 생성, 로컬 클론, Runner에 **러너 태그(=프로젝트 키)** 등록 |
| 2 | 사람 | Harbor에 **동일 이름 Project** 생성 |
| 3 | 사람 | CI/CD Variables: `HARBOR_REGISTRY`/`USER`/`PASSWORD`, `HARBOR_CA_CERT`(사설 CA), **`GITOPS_GIT_TOKEN`=Maintainer+write_repository**. Protected `main` Allowed to push 확인 |
| 4 | Cursor | 위 프롬프트로 `frontend/`·`backend/`·`gitops/`·`.gitlab-ci.yml`(**Step 5 전체 YAML = real-test2 패턴, 키만 치환**)·Rules/Skill 생성 |
| 5 | 사람 | `main` 푸시 → Pipeline: build_* → update-gitops 성공 확인 |
| 6 | 사람 | Rancher Fleet GitRepo 등록 (Root=`gitops`, 대상 클러스터, Git 인증) |
| 7 | 사람 | Namespace에 **imagePullSecrets와 同名** Registry Secret 생성 |
| 8 | 사람 | 사내 DNS(`*.k8s.wonikqnc.com` → Ingress IP) 확인 · Pod Ready → 브라우저로 `https://<GitLab레포명>.k8s.wonikqnc.com/` 접속. **Ingress YAML에는 `tls:` 넣지 않음**(아래 Ingress MUST) |
| 9 | 사람 | (폴백) Ingress 전엔 frontend **NodePort**로 임시 확인 가능 |

> **에이전트 [MUST]**: Step 5의 **검증된 전체 `.gitlab-ci.yml` 골격**(아래 코드 블록)을 **구조·스크립트까지 변형하지 말고** `default.tags` / `HARBOR_PROJECT` 등 **프로젝트 키만** 치환해 생성한다.  
> 특히 DinD 기동은 **반드시** `dockerd-entrypoint.sh &` (인자 없음). `dockerd-entrypoint.sh dockerd … &` / 로그 리다이렉트 변형 **금지**.  
> **Harbor TLS `before_script`(CA PEM\|base64 · registry host 정규화 · certs.d+`:443` · `insecure-registries`)를 “간단한 base64 -d 한 줄”로 축약하지 말 것** — 레포마다 login 성공/실패가 갈리는 주원인.  
> 중첩 clone·`stages: gitops`(잡과 다른 이름)·따옴표 없는 `git commit -m "…:…"` 금지.  
> **프로젝트 키/네임스페이스는 CI·GitOps 모두 `"…"` 큰따옴표**: `default.tags` · `HARBOR_PROJECT` · **`gitops/fleet.yaml`의 `defaultNamespace`** · 모든 **`metadata.namespace`** · 라벨 `project`.  
> 미인용 숫자·leading zero(예: `01774`) → YAML 정수/8진수 → GitLab `tags config should be an array of strings` **또는** Fleet `cannot unmarshal number into … defaultNamespace of type string` (Step 4·5 MUST).

본 문서만으로 **이미 앱 코드가 있는 레포**에 배포 파일만 추가할 때도 Step 0~7을 그대로 쓴다.

---

## 프로젝트 키 · APP_PORT 결정 규칙 (공용)

에이전트/작성자는 **현재 레포**에서 키를 정한 뒤, 아래 규칙으로 포트를 확정한다.

| 항목 | 규칙 |
| --- | --- |
| **프로젝트 키** | 기본 = GitLab 레포명(또는 폴더명)을 **소문자·케밥/허용문자**로 정규화한 값. 사용자가 변수 블록에 명시하면 그 값을 최우선. |
| **Namespace / Harbor 프로젝트 / Runner 태그** | 특별한 팀 규약이 없으면 **프로젝트 키와 동일** |
| **APP_PORT (NNN 규칙)** | 키(또는 사용자가 명시한 프로젝트명)의 **맨 끝 3문자**가 `[0-9]{3}` 이면 `APP_PORT = 8000 + int(NNN)` |
| **APP_PORT (기본)** | 끝에 숫자 3자리가 **없으면** `APP_PORT = 8000` |
| **동기화** | Dockerfile ENV·EXPOSE·HEALTHCHECK, `nginx` `proxy_pass http://backend:<APP_PORT>`, Deployment `containerPort`·Service·ConfigMap `APP_PORT` **전부 동일** |

예시 (참고용 — 실제 값은 항상 현재 레포 기준):

| 프로젝트 키 예 | APP_PORT |
| --- | --- |
| `WIQ-2026-006` / `wiq-2026-006` | **8006** |
| `my-kanban` | **8000** |
| `k8s-test` | **8000** |
| `order-api` | **8000** |

> 파드/서비스 간 통신 포트는 항상 `APP_PORT`. 외부 진입은 **Ingress(서브도메인)** 가 기본. NodePort는 폴백.

---

## AS-IS → TO-BE (한눈에)

| 항목 | AS-IS (Docker Compose 직접 배포) | TO-BE (K8s + Fleet GitOps) |
| --- | --- | --- |
| CI 역할 | 빌드 + 런타임 서버에서 `compose up` | **빌드 + Harbor Push + GitOps 매니페스트 이미지 태그 갱신** |
| CD 역할 | GitLab `deploy` Job이 서버에서 compose 실행 | **Rancher Fleet**이 `gitops/` 변경을 감지해 RKE2에 반영 |
| 이미지 저장소 | GitLab Container Registry | **SUSE Private Registry (Harbor)** |
| 환경변수 | deploy Job이 `backend/.env` 생성 | **ConfigMap** (`backend-config`) + **Secret** (`backend-secret`) |
| Frontend↔Backend | nginx `proxy_pass http://backend:<APP_PORT>` | **동일 Namespace의 Service 이름** `backend` 유지 |
| 배포 확인 | `docker compose ps` | Rancher: Fleet AppBundle, Deployment, Pod, Service |
| 롤백 기준 | 호스트 컨테이너 상태 | **GitOps YAML 이력** + Fleet/클러스터 상태 |

```text
Source Commit (main)
  -> GitLab Runner: build_backend / build_frontend
  -> SUSE Private Registry (Harbor) Push
  -> update-gitops: gitops/apps/*/deployment.yaml image 갱신 + Git Push
  -> Rancher Fleet Sync
  -> RKE2 (<FLEET_CLUSTER>) Deploy
```

> **금지(TO-BE)**: CI `deploy` Job에서 `docker compose down/pull/up`, 운영 서버에 Runner가 직접 컨테이너를 올리는 패턴.

---

## 프로젝트 변수 (복사 전 채우기)

Cursor에 붙여 넣기 **전에** 아래를 현재 레포에 맞게 채운다.  
비워 두면 에이전트가 **레포명 → 키**, **NNN/기본 포트 규칙**으로 추론한다.

```text
[프로젝트 변수]
- 프로젝트 키              : <레포명 소문자. 예: my-service>
- Namespace                : <기본: 프로젝트 키와 동일>
- Harbor 프로젝트          : <기본: 프로젝트 키와 동일>
- GitLab 러너 태그         : <기본: 프로젝트 키와 동일>
- APP_PORT                 : <NNN 규칙 또는 8000. 직접 쓰면 추론보다 우선>
- imagePullSecrets 이름    : <클러스터에 미리 만든 Registry Secret 이름. 예: admin>
- frontend Service type    : <기본: ClusterIP (Ingress 진입). NodePort 폴백 시 NodePort>
- backend Service type     : <기본: ClusterIP>
- Ingress host             : <기본: <GitLab 레포명>.k8s.wonikqnc.com — 서브도메인 라벨 = 레포명(=프로젝트 키)>
- Ingress class            : <**기본: traefik** — 이 클러스터 표준>
- Ingress TLS on resource  : <**기본: 없음(금지에 가깝)** — 엣지 Apache가 HTTPS 종료. Ingress `spec.tls` / `websecure` 넣지 말 것>
- Fleet 대상 클러스터      : <기본: k8s-downstream>
- Fleet GitRepo Root       : gitops
- 백엔드 헬스              : /api/v1/health
- 프론트 헬스              : /healthz
- nginx → backend Service  : backend:<APP_PORT>
- docker-compose.yml       : 로컬 전용 (기본: 예)
- AI 스킵 컴포넌트         : <예: LLM, Vector DB, Security — AI_PLATFORM_DEV_GUIDE Skip Rule>
```

### 작성 예시 (복붙용 샘플 — 그대로 쓰지 말고 이름만 교체)

**A. 레포명만 있는 일반 PoC**

```text
- 프로젝트 키              : shop-demo
- Namespace / Harbor / Runner tag : shop-demo
- APP_PORT                 : 8000
- imagePullSecrets 이름    : admin
- Ingress host             : shop-demo.k8s.wonikqnc.com
- Ingress class            : traefik
- Ingress TLS on resource  : 없음 (엣지 종료)
- Fleet 대상 클러스터      : k8s-downstream
```

**B. 키 끝 3자리가 숫자인 경우**

```text
- 프로젝트 키              : wiq-2026-009
- Namespace / Harbor / Runner tag : wiq-2026-009
- APP_PORT                 : 8009
- imagePullSecrets 이름    : admin
- Ingress host             : wiq-2026-009.k8s.wonikqnc.com
- Ingress class            : traefik
- Ingress TLS on resource  : 없음 (엣지 종료)
- Fleet 대상 클러스터      : k8s-downstream
```

---

## 프롬프트 본문 (여기서부터 복사)

아래 `text` 블록 + 위에서 채운 **[프로젝트 변수]** 를 함께 보낸다.

```text
역할: 너는 이 레포의 배포 파일을 만드는 DevOps 엔지니어다.
목표: GitLab CI + Harbor + Kubernetes GitOps(Rancher Fleet) 배포를 위해 아래를 **모두** 생성·갱신한다.
  (빈 레포이고 @AI_PLATFORM_DEV_GUIDE.md 가 함께 주어지면 frontend/backend 앱 골격도 같이 만든다.)
  1) .gitlab-ci.yml
  2) backend/Dockerfile
  3) frontend/Dockerfile (+ nginx.conf)
  4) gitops/fleet.yaml
  5) gitops/apps/backend/{deployment,service,configmap}.yaml (+ secret.example.yaml)
  6) gitops/apps/frontend/{deployment,service}.yaml
  7) gitops/apps/ingress.yaml — **기본 포함** (Host → frontend:80, class=traefik, **Ingress에 tls 없음**)
  8) .cursor/rules/*.mdc
  9) .cursor/skills/git-push/SKILL.md
  10) (로컬) docker-compose.yml — **로컬 전용**, CI CD 경로에 넣지 않는다.
  배포 산출만 만들고 Rule/Skill 을 생략하면 **미완료**다.

사용자 메시지에 [프로젝트 변수]가 있으면 그 값을 쓴다.
없으면: 레포명(또는 루트 폴더명)을 프로젝트 키로 쓰고,
  Namespace / Harbor 프로젝트 / Runner 태그 = 프로젝트 키,
  APP_PORT = (키 끝 3자리가 숫자면 8000+NNN, 아니면 8000),
  Ingress class = traefik,
  Ingress `spec.tls` / websecure annotation = **넣지 않음** (아래 Ingress MUST).
특정 레포(k8s-test, k8s-cicd-test 등) 이름을 본문에 하드코딩하지 않는다.

==================================================================
[MUST] Ingress (`*.k8s.wonikqnc.com`) — Traefik + 엣지 TLS (실수 금지)
==================================================================
이 클러스터의 공개 진입 패턴(검증됨: real-test2 / real-test3 등):

1. **Ingress Class = `traefik`** (`ingressClassName: traefik` + `kubernetes.io/ingress.class: traefik`)
2. **Ingress 리소스에 `spec.tls` 를 넣지 않는다.** HTTPS는 앞단(Apache 등)이 종료하고 Traefik에는 HTTP로 들어온다.
3. **`traefik.ingress.kubernetes.io/router.entrypoints: websecure` 금지.** (넣으면 Rancher Target이 `https://…` 가 되고 라우트가 깨져 **404 page not found** / `Server: Apache` 가 자주 난다.)
4. 브라우저 URL은 여전히 `https://<레포명>.k8s.wonikqnc.com/` 이다. YAML Target/규칙은 **HTTP Host → Service frontend:80**.
5. Rancher Ingress 목록에서 **정상 Target은 `http://<host>/`**. `https://<host>/` 로 보이면 Ingress TLS를 잘못 켠 신호다 — 형제 레포(real-test2)와 비교할 것.
6. nginx Ingress Class로 바꾸며 우회하지 말 것(이 환경 표준은 traefik). 프론트 컨테이너의 `nginx.conf`(`/api/` 프록시)와 Ingress Class는 **별개**.

잘못된 예(금지):
```yaml
# ❌ DO NOT — 엣지 TLS 환경에서 Ingress에 TLS/websecure
metadata:
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
spec:
  ingressClassName: traefik
  tls:
    - hosts: ["my-app.k8s.wonikqnc.com"]
      secretName: my-app-tls
```

올바른 예:
```yaml
# ✅ DO — class=traefik, HTTP rule only (엣지가 HTTPS 종료)
metadata:
  annotations:
    kubernetes.io/ingress.class: traefik
spec:
  ingressClassName: traefik
  rules:
    - host: my-app.k8s.wonikqnc.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

==================================================================
[MUST] 백엔드 포트 규칙
==================================================================
- 키/프로젝트명의 마지막 3문자가 [0-9]{3}$ 이면 APP_PORT = 8000 + int(NNN)
- 그 외 APP_PORT = 8000 (또는 사용자가 변수로 명시한 값)
- 동기화 필수: backend/Dockerfile ENV·EXPOSE·HEALTHCHECK,
  frontend/nginx.conf 의 proxy_pass http://backend:<APP_PORT>,
  gitops/apps/backend deployment containerPort·Service port·프로브,
  ConfigMap APP_PORT
- 외부 진입 기본은 Ingress 서브도메인. **Host 라벨 = GitLab 레포명**(=프로젝트 키) → `<레포명>.k8s.wonikqnc.com`. 파드/서비스 간 통신 포트는 항상 APP_PORT

==================================================================
[Step 0] 사전 조사
==================================================================
- backend/, frontend/, gitops/ 존재 여부
- 백엔드/프론트 스택 판별
- 헬스: /api/v1/health (backend), /healthz (frontend nginx)
- Harbor 프로젝트명 · Namespace · Runner 태그 = 프로젝트 변수(또는 키)
- Fleet GitRepo Root directory = gitops
조사 결과를 10줄 이내로 요약한 뒤 파일을 만든다. (확정한 키·APP_PORT를 명시)

==================================================================
[Step 1] 공통 규칙
==================================================================
- Docker 빌드 컨텍스트는 **레포 루트**. COPY backend/... , COPY frontend/...
- Dockerfile 첫 줄: # syntax=docker/dockerfile:1.6
- 이미지 태그: $CI_COMMIT_SHORT_SHA (선택 latest)
- Push 대상: Harbor $HARBOR_REGISTRY/$HARBOR_PROJECT/{backend|frontend}:$TAG
- 비밀값: 이미지·깃에 박지 않음. 클러스터 Secret / Rancher UI. CI에는 Harbor·Git push용 자격만.
- CI는 운영 서버에서 docker compose 를 실행하지 않음.

==================================================================
[Step 2] backend/Dockerfile
==================================================================
- [MUST] APP_PORT 반영 (ENV, EXPOSE, HEALTHCHECK)
- 멀티스테이지 deps → runtime, non-root user app
- Python(해당 시): python:3.11-slim, uvicorn app.main:app --port ${APP_PORT}
- HEALTHCHECK: curl http://127.0.0.1:${APP_PORT}/api/v1/health

==================================================================
[Step 3] frontend/Dockerfile + nginx.conf
==================================================================
- build → nginx:1.27-alpine
- nginx: SPA fallback, /healthz, location /api/ { proxy_pass http://backend:<APP_PORT>; }
  (K8s 동일 Namespace Service 이름 backend)
- HEALTHCHECK: wget http://127.0.0.1/healthz

==================================================================
[Step 4] gitops/ 매니페스트
==================================================================
gitops/
  fleet.yaml                          # defaultNamespace: "<프로젝트 Namespace>" (따옴표 MUST)
  apps/
    backend/
      deployment.yaml
      service.yaml                    # ClusterIP, port=APP_PORT, name=backend
      configmap.yaml                  # backend-config
      secret.example.yaml             # 예시/주석만 (실비밀 금지)
    frontend/
      deployment.yaml
      service.yaml                    # name=frontend, port=80, type=ClusterIP(기본)
    ingress.yaml                      # 기본 — Host=<GitLab레포명>.k8s.wonikqnc.com → frontend:80

**[MUST] `fleet.yaml` 전문** (`<PROJECT_KEY>` → 프로젝트 키, **반드시 따옴표**):

```yaml
defaultNamespace: "<PROJECT_KEY>"
```

- 금지: `defaultNamespace: 01774` (미인용) → Fleet **`Failed to process bundle` / `cannot unmarshal number into … defaultNamespace of type string`** (`01774`→8진수 `1020`).
- 올바른 예: `defaultNamespace: "01774"`.

규칙:
- deployment image 초기값:
  $HARBOR_REGISTRY/$HARBOR_PROJECT/backend:placeholder
  $HARBOR_REGISTRY/$HARBOR_PROJECT/frontend:placeholder
- imagePullSecrets: <프로젝트 변수의 pull secret 이름> (클러스터에 사전 생성, YAML 이름과 일치)
- backend Service: ClusterIP. frontend Service: ClusterIP(기본, Ingress 진입). NodePort는 폴백만.
- ingress.yaml [MUST 기본] — **「[MUST] Ingress」절과 동일**:
  - **서브도메인 규칙**: Host = `<GitLab 레포명>.k8s.wonikqnc.com` (레포명 = 프로젝트 키)
  - path `/` Prefix → Service `frontend` port 80 (backend는 nginx `/api/` 프록시 — Ingress에 backend 직접 노출 금지)
  - `ingressClassName: traefik` + annotation `kubernetes.io/ingress.class: traefik`
  - **`spec.tls` 금지** · **`router.entrypoints: websecure` 금지** (엣지 Apache가 HTTPS 종료)
  - Rancher Target은 `http://<host>/` 이어야 함 (`https://` 이면 잘못 설정)
  - 사전 조건(사람): 사내 DNS `*.k8s.wonikqnc.com` → Ingress/엣지 IP
  - 참고 구현: 동작 중인 `real-test2` / `real-test3` Ingress와 동일 패턴
- backend envFrom: configMapRef backend-config + secretRef backend-secret (optional: true 가능)
- probes: backend /api/v1/health , frontend /healthz
- labels: app, **`project: "<프로젝트 키>"` 따옴표** (미인용 숫자 키 금지)
- metadata.namespace: **`"<Namespace>"` 따옴표 MUST** (`fleet.yaml` `defaultNamespace`와 동일 문자열). 미인용 → 위 Fleet unmarshal 오류와 동일 계열
- secret.example.yaml: 주석·플레이스홀더만. Fleet는 gitops/ 아래 유효한 apiVersion YAML을 적용할 수 있으므로
  실비밀·동작 가능한 dockerconfig 를 example에 넣지 말 것. 필요 시 파일을 gitops 밖이나 주석 전용으로 둔다.

==================================================================
[Step 5] .gitlab-ci.yml  — **검증된 표준 골격 (최초 로드 시 이 YAML을 그대로 생성)**
==================================================================
**[MUST] 기준 레포**: 동작 검증된 CI는 `real-test2` 패턴이다. 신규 레포는 아래 전체를 복사한 뒤
`<PROJECT_KEY>` 만 실제 프로젝트 키(소문자)로 치환한다. 구조·스크립트·DinD 기동 줄을 **임의 변형 금지**.

**[MUST] DinD 기동**
- **올바른 예**: `- dockerd-entrypoint.sh &`  (인자 없음, 리다이렉트 없음)
- **금지**: `- dockerd-entrypoint.sh dockerd … &` , `>/tmp/dockerd.log 2>&1` 등
- 잘못된 기동 → `Cannot connect to the Docker daemon at unix:///tmp/docker.sock` (login은 성공할 수 있음)

**[MUST] Harbor 사설 CA / TLS (레포마다 성공·실패가 갈리는 지점 — 초기 구축 시 생략 금지)**

형제 레포 중 **어떤 프로젝트는 login이 되고, 어떤 프로젝트는 `x509: certificate signed by unknown authority`로 실패**한다.  
원인은 “변수 유무”만이 아니다. **CA 형식·레지스트리 호스트 표기·certs.d 경로·DinD 신뢰 경로**가 어긋나면, CI Variable에 `HARBOR_CA_CERT`가 있어도 실패한다.

에이전트는 Step 5 **아래 `before_script` 전체**(CA 설치 + `insecure-registries` + DinD)를 **축소·삭제하지 않는다**. “간단한 base64 -d 한 줄”로 되돌리면 재발한다.

| 체크 | 올바른 값 / 동작 |
| --- | --- |
| `HARBOR_REGISTRY` | **호스트만** (`harbor.example.com` 또는 `host:port`). **`https://` / 끝 `/` 금지** — 있으면 `certs.d` 경로가 어긋남 |
| `HARBOR_CA_CERT` | **Harbor TLS를 서명한 CA**(또는 체인). 서버 leaf 인증서를 CA처럼 넣으면 → 파일은 `BEGIN CERTIFICATE`여도 login 실패 |
| CA 변수 형식 | **base64(권장)** 또는 **PEM 원문** 모두 허용. CI는 `BEGIN CERTIFICATE`면 PEM 그대로, 아니면 `base64 -d` |
| certs.d | `/etc/docker/certs.d/<host>/ca.crt` **및** (포트 없으면) `/etc/docker/certs.d/<host>:443/ca.crt` |
| 시스템 CA | `update-ca-certificates` 가능 시 동일 CA를 시스템 번들에도 등록 (DinD TLS 경로가 certs.d만 안 보는 경우 대비) |
| `daemon.json` | dockerd **기동 전** `insecure-registries: ["<host>", "<host>:443"]` 기록 — CA가 맞아도 DinD에서 실패하는 사례·CA 불일치 사례 모두 차단 해제 |
| 로그 확인 | CA 설치 후 `wc -c`·`head`에 `BEGIN CERTIFICATE` 보이는데도 login 실패 → **잘못된 CA** 또는 **host/certs.d 불일치**. `WARNING: HARBOR_CA_CERT is empty` → Protected 변수·브랜치 주입 문제 |

기타 불변 규칙:
- stages: **오직** `build`, `update-gitops`. test / compose deploy / 중첩 `git clone` **금지**.
- privileged 는 Job YAML 키가 아님 (Runner `config.toml` `[runners.docker] privileged=true`)
- `GITOPS_GIT_TOKEN` = Maintainer + `write_repository`; push는 PAT URL + `credential.helper=`
- **YAML 콜론 함정**: `git commit -m "ci: …"` 는 `|` 블록 안이거나 줄 전체를 `'…'` 로 감싼다.
- **[MUST] 프로젝트 키 따옴표 (숫자형·leading zero)**: CI·GitOps YAML에서 프로젝트 키/네임스페이스는 **항상 `"…"` 큰따옴표**.  
  - **CI**: `default.tags` · `HARBOR_PROJECT`  
  - **GitOps**: `fleet.yaml`의 `defaultNamespace` · 모든 `metadata.namespace` · 라벨 `project`  
  - 금지: `defaultNamespace: 01774` / `namespace: 01774` / `- 01774` → YAML이 **정수(또는 8진수)** 로 파싱 (`01774`→`1020`).  
  - 증상: GitLab **`Unable to run pipeline` / `default:tags config should be an array of strings`** · Fleet **`cannot unmarshal number into … defaultNamespace of type string`**.  
  - 올바른 예: `defaultNamespace: "01774"` · `namespace: "01774"` · `- "01774"` · `HARBOR_PROJECT: "01774"` (문자 키도 `"shop-demo"` 권장).  
  - 참고: `host: 01774.k8s.wonikqnc.com` 처럼 **점이 있으면** 보통 문자열이지만, 네임스페이스·태그는 **항상 따옴표**.

**생성할 `.gitlab-ci.yml` 전문** (`<PROJECT_KEY>` → 프로젝트 키, **반드시 따옴표 포함**):

```yaml
stages:
  - build
  - update-gitops

default:
  tags:
    - "<PROJECT_KEY>"

variables:
  DOCKER_HOST: unix:///tmp/docker.sock
  DOCKER_TLS_CERTDIR: ""
  DOCKER_BUILDKIT: "1"
  HARBOR_PROJECT: "<PROJECT_KEY>"
  BACKEND_LATEST: $HARBOR_REGISTRY/$HARBOR_PROJECT/backend:latest
  FRONTEND_LATEST: $HARBOR_REGISTRY/$HARBOR_PROJECT/frontend:latest
  GITOPS_BACKEND_FILE: apps/backend/deployment.yaml
  GITOPS_FRONTEND_FILE: apps/frontend/deployment.yaml

.build_base:
  stage: build
  image: docker:24
  before_script:
    - |
      set -e
      # HARBOR_REGISTRY must be host[:port] without https:// (certs.d path + login)
      export HARBOR_REGISTRY="${HARBOR_REGISTRY#https://}"
      export HARBOR_REGISTRY="${HARBOR_REGISTRY#http://}"
      export HARBOR_REGISTRY="${HARBOR_REGISTRY%/}"
      if [ -n "${HARBOR_CA_CERT:-}" ]; then
        mkdir -p "/etc/docker/certs.d/${HARBOR_REGISTRY}"
        # Accept base64 (권장) or raw PEM pasted into the CI variable
        if printf '%s' "${HARBOR_CA_CERT}" | grep -q "BEGIN CERTIFICATE"; then
          printf '%s\n' "${HARBOR_CA_CERT}" > "/etc/docker/certs.d/${HARBOR_REGISTRY}/ca.crt"
        else
          printf '%s' "${HARBOR_CA_CERT}" | base64 -d > "/etc/docker/certs.d/${HARBOR_REGISTRY}/ca.crt"
        fi
        # Docker looks up certs.d by host or host:443 depending on dial address
        case "${HARBOR_REGISTRY}" in
          *:*) ;;
          *)
            mkdir -p "/etc/docker/certs.d/${HARBOR_REGISTRY}:443"
            cp "/etc/docker/certs.d/${HARBOR_REGISTRY}/ca.crt" \
              "/etc/docker/certs.d/${HARBOR_REGISTRY}:443/ca.crt"
            ;;
        esac
        # Also trust via system CA bundle (some DinD TLS paths use this)
        if command -v update-ca-certificates >/dev/null 2>&1; then
          cp "/etc/docker/certs.d/${HARBOR_REGISTRY}/ca.crt" \
            /usr/local/share/ca-certificates/harbor-ca.crt
          update-ca-certificates >/dev/null 2>&1 || true
        fi
        wc -c "/etc/docker/certs.d/${HARBOR_REGISTRY}/ca.crt"
        head -n 1 "/etc/docker/certs.d/${HARBOR_REGISTRY}/ca.crt"
      else
        echo "WARNING: HARBOR_CA_CERT is empty at runtime"
      fi
      # Private Harbor: allow untrusted HTTPS if CA chain still mismatches (레포별 편차 흡수)
      mkdir -p /etc/docker
      printf '%s\n' "{" \
        "  \"insecure-registries\": [\"${HARBOR_REGISTRY}\", \"${HARBOR_REGISTRY}:443\"]" \
        "}" > /etc/docker/daemon.json
      cat /etc/docker/daemon.json
    - dockerd-entrypoint.sh &
    - |
      for i in $(seq 1 30); do
        docker info >/dev/null 2>&1 && break
        sleep 1
      done
    - docker info 2>/dev/null | grep -i insecure || true
    - echo "${HARBOR_PASSWORD}" | docker login "${HARBOR_REGISTRY}" -u "${HARBOR_USER}" --password-stdin
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

build_backend:
  extends: .build_base
  script:
    - docker pull "${BACKEND_LATEST}" || true
    - |
      docker build --pull --provenance=false \
        --cache-from "${BACKEND_LATEST}" \
        -f backend/Dockerfile \
        -t "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/backend:${CI_COMMIT_SHORT_SHA}" \
        -t "${BACKEND_LATEST}" \
        .
    - docker push "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/backend:${CI_COMMIT_SHORT_SHA}"
    - docker push "${BACKEND_LATEST}"
    - echo "BUILT_BACKEND_IMAGE=${HARBOR_REGISTRY}/${HARBOR_PROJECT}/backend:${CI_COMMIT_SHORT_SHA}" >> build.env
  artifacts:
    reports:
      dotenv: build.env
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      changes:
        - backend/**/*
        - .gitlab-ci.yml

build_frontend:
  extends: .build_base
  script:
    - docker pull "${FRONTEND_LATEST}" || true
    - |
      docker build --pull --provenance=false \
        --cache-from "${FRONTEND_LATEST}" \
        -f frontend/Dockerfile \
        -t "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/frontend:${CI_COMMIT_SHORT_SHA}" \
        -t "${FRONTEND_LATEST}" \
        .
    - docker push "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/frontend:${CI_COMMIT_SHORT_SHA}"
    - docker push "${FRONTEND_LATEST}"
    - echo "BUILT_FRONTEND_IMAGE=${HARBOR_REGISTRY}/${HARBOR_PROJECT}/frontend:${CI_COMMIT_SHORT_SHA}" >> build.env
  artifacts:
    reports:
      dotenv: build.env
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      changes:
        - frontend/**/*
        - .gitlab-ci.yml

update-gitops:
  stage: update-gitops
  image:
    name: alpine/git
    entrypoint: [""]
  needs:
    - job: build_backend
      optional: true
      artifacts: true
    - job: build_frontend
      optional: true
      artifacts: true
  before_script:
    - apk add --no-cache sed
  script:
    - |
      set -e
      CHANGED=0
      if [ -n "${BUILT_BACKEND_IMAGE:-}" ]; then
        sed -i "s|image:.*backend:.*|image: ${BUILT_BACKEND_IMAGE}|" "gitops/${GITOPS_BACKEND_FILE}"
        CHANGED=1
      fi
      if [ -n "${BUILT_FRONTEND_IMAGE:-}" ]; then
        sed -i "s|image:.*frontend:.*|image: ${BUILT_FRONTEND_IMAGE}|" "gitops/${GITOPS_FRONTEND_FILE}"
        CHANGED=1
      fi
      if [ "${CHANGED}" -eq 0 ]; then
        echo "No built images to update; skipping"
        exit 0
      fi
      git config user.email "ci@${CI_SERVER_HOST}"
      git config user.name "gitlab-ci"
      git add "gitops/${GITOPS_BACKEND_FILE}" "gitops/${GITOPS_FRONTEND_FILE}"
      if git diff --cached --quiet; then
        echo "No gitops diff"
        exit 0
      fi
      git commit -m "ci: update images to ${CI_COMMIT_SHORT_SHA} [skip ci]"
      git -c credential.helper= push "https://oauth2:${GITOPS_GIT_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git" HEAD:main
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

==================================================================
[Step 6] 검증
==================================================================
- Fleet `defaultNamespace` · Service backend/frontend · 프로젝트 키 라벨 일치 (**모두 `"키"` 따옴표**)
- APP_PORT 전 구간 일치
- stages 가 `build`, `update-gitops` 만인가? compose deploy 없는가?
- **DinD 기동이 `dockerd-entrypoint.sh &` 인가?** (`dockerd` 인자·로그 리다이렉트 변형 없음)
- **Harbor TLS `before_script`가 Step 5와 동일한가?** (레지스트리 `https://` 제거 · PEM/base64 분기 · certs.d + `:443` · system CA · **dockerd 전 `insecure-registries`** — 한 줄 `base64 -d`만으로 축약 금지)
- Step 5 **전체 YAML**과 구조가 동일한가? (프로젝트 키 치환만 허용)
- **`default.tags` / `HARBOR_PROJECT` / `defaultNamespace` / `metadata.namespace` 가 `"프로젝트키"` 따옴표 문자열인가?** (미인용 → CI tags 오류 또는 Fleet `cannot unmarshal number into … defaultNamespace`)
- GITOPS_*_FILE 이 `apps/...` 이고 sed가 `gitops/${GITOPS_*_FILE}` 인가?
- build.env dotenv → update-gitops 의 BUILT_*_IMAGE 연결이 있는가?
- imagePullSecrets 이름이 변수·클러스터 Secret과 같은가?
- Rule/Skill 의 키·포트·러너·GitOps 사실이 파일과 일치하는가?
- **[MUST] script 콜론 따옴표** + **프로젝트 키 따옴표(CI+GitOps)** + **GITOPS_GIT_TOKEN=Maintainer+write_repository** + protected main Allowed to push 확인

==================================================================
[Step 7] Cursor Rule + git-push Skill ([MUST])
==================================================================
7-A) .cursor/rules/
  - deployment.mdc: 이 레포의 APP_PORT, Harbor, Fleet, stages, pull secret 이름, compose 로컬 전용,
    **DinD=`dockerd-entrypoint.sh &` (real-test2 패턴)**,
    **Harbor TLS: `HARBOR_REGISTRY`에 https 금지 · `HARBOR_CA_CERT` PEM|base64 · certs.d(+`:443`) · insecure-registries(dockerd 전) — Step 5 before_script 축약 금지**,
    **및 CI script 콜론 함정**(Step 5 MUST — `chore(gitops):` 등 따옴표/`|` 필수),
    **및 `default.tags`/`HARBOR_PROJECT`/`defaultNamespace`/`metadata.namespace` 프로젝트 키 따옴표**(숫자·`01774` 등 leading zero → 미인용 시 int/8진수),
    **Ingress: class=traefik · `spec.tls`/`websecure` 금지 · Rancher Target=`http://…`** (본문 Ingress MUST)
  - project-overview.mdc: 스택, 프로젝트 키, 포트, Ingress(traefik·엣지 TLS), 문서 우선순위(DEPLOYMENT_PROMPT > AI_PLATFORM_DEV_GUIDE)
  - (가이드와 함께면) ai-platform-backend.mdc / ai-platform-frontend.mdc
7-B) .cursor/skills/git-push/SKILL.md
  - Harbor push → update-gitops → Fleet 배포
  - 헬스: /api/v1/health , /healthz
```

---

## GitLab CI/CD GitOps 운영 (공용 체크리스트)

`main` push 시: **build** (이미지 → Harbor) → **update-gitops** → **Fleet** → RKE2.

### 사전 요구사항 (파이프라인·Fleet 전에) — **최초 로드 전 사람 체크리스트**

| 항목 | 값 / 설명 |
| --- | --- |
| GitLab Runner | 태그 = **이 레포의 러너 태그**(보통 프로젝트 키). Job tags와 **문자열 일치** |
| Harbor Project | `$HARBOR_PROJECT` **사전 생성** (없으면 첫 push 실패) |
| Registry CI Vars | `HARBOR_REGISTRY`(**호스트만**, `https://` 금지), `HARBOR_USER`, `HARBOR_PASSWORD`, **`HARBOR_CA_CERT`**(사설 CA 필수 — **base64 또는 PEM**; **서명 CA**여야 함, 서버 leaf 금지). CI Step 5는 `insecure-registries`로 레포별 TLS 편차도 흡수 |
| **GitOps push 토큰** | **`GITOPS_GIT_TOKEN`**: Project Access Token · **role=Maintainer** · scopes=`write_repository`(+`read_repository`) · Masked CI Variable. **Developer 토큰/CI_JOB_TOKEN 만으로는 protected `main` push 실패** |
| Protected `main` | Settings → Repository → Protected branches → **Allowed to push** 에 Maintainer(또는 토큰 역할) 포함 |
| Fleet GitRepo | URL = 이 레포, Branch = `main`, Root = `gitops`, 대상 Cluster |
| Fleet Git 인증 | Deploy/Project Access Token (`read_repository`) 권장. 개인 비번은 임시만 |
| Namespace | 프로젝트 Namespace (없으면 Fleet/클러스터 정책으로 생성) |
| Pull Secret | Deployment `imagePullSecrets`와 **동일 이름**·type=docker-registry·Harbor 호스트 |
| Secret | `backend-secret` 등 — Rancher UI 권장, git에 실비밀 금지 |

### 흔한 실패 (초기 세팅 시)

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| Job pending | Runner 태그 불일치 | Runner·`.gitlab-ci.yml` tags 동일화 |
| docker/TLS/login 실패 (일반) | DinD·CA·Harbor Project 미준비 | Step 5 Harbor TLS `before_script` 유지, Project 생성, `HARBOR_*` |
| **`x509: certificate signed by unknown authority`** (`HARBOR_CA_CERT` 변수는 있음) | (1) CA가 **서명 CA가 아님**(leaf/다른 인증서) (2) 변수는 PEM인데 CI가 **base64 -d만** 함 (3) `HARBOR_REGISTRY`에 **`https://`** (4) certs.d에 **`:443` 경로 없음** (5) DinD가 certs.d만으로 부족 | Step 5 **전체** Harbor TLS 블록 사용(PEM\|base64·host 정규화·certs.d+`:443`·system CA·**`insecure-registries`**). 장기적으로는 올바른 **서명 CA**로 `HARBOR_CA_CERT` 교체. 형제 레포는 되고 이 레포만 실패해도 **동일 골격**으로 맞춤 |
| **`WARNING: HARBOR_CA_CERT is empty at runtime`** | Protected 변수가 Job에 안 들어옴(비보호 브랜치 등) 또는 변수명 오타 | `main` Protected + 변수 Protected 일치, Key=`HARBOR_CA_CERT` |
| CA 로그에 `BEGIN CERTIFICATE` 보이는데도 login 실패 | 파일은 PEM이지만 **잘못된 인증서 내용** 또는 host/certs.d 불일치 | 서명 CA로 교체 + Step 5 `insecure-registries` 확인(`docker info`에 insecure 목록) |
| **`Cannot connect to the Docker daemon at unix:///tmp/docker.sock`** (login은 성공) | DinD 기동 줄 변형 (`dockerd-entrypoint.sh dockerd … &` 등) 또는 Runner `privileged=false` | **반드시** `dockerd-entrypoint.sh &` (Step 5). Runner privileged=true |
| **Unable to run pipeline** / `script config should be a string or a nested array of strings` | `script` 줄의 **따옴표 없는 `:`** 가 YAML 맵으로 파싱됨 (예: `git commit -m "chore(gitops): …"`) | 해당 줄 전체를 `'…'` 또는 `\|` 블록으로 감싸기. Step 5 **[MUST] YAML 콜론 함정** 참고 |
| **Unable to run pipeline** / `default:tags config should be an array of strings` | `default.tags`(또는 동일 위치)에 **따옴표 없는 숫자형 프로젝트 키** (예: `- 01774`) → YAML이 **정수/8진수**로 파싱 (`01774`→`1020`) | **반드시** `- "01774"` · `HARBOR_PROJECT: "01774"`. Step 5 **[MUST] 프로젝트 키 따옴표** 참고. Runner 등록 태그도 문자열 `"01774"`와 일치 |
| Fleet **`cannot unmarshal number into … defaultNamespace of type string`** | `fleet.yaml`의 `defaultNamespace: 01774` (미인용) → 숫자로 파싱 | **`defaultNamespace: "01774"`**. 같은 이유로 모든 `metadata.namespace`도 `"01774"` |
| update-gitops 403 / Job Token | protected main + Job Token | `GITOPS_GIT_TOKEN` |
| **`You are not allowed to push code to protected branches`** | `GITOPS_GIT_TOKEN` 역할이 protected `main`의 **Allowed to push**에 없음 (또는 Developer 토큰만 있음). 또는 credential helper가 `CI_JOB_TOKEN`으로 push | Project Access Token을 **Maintainer** + `write_repository`로 재발급 → CI Variable `GITOPS_GIT_TOKEN` 갱신. Protected branches에서 Maintainer push 허용 확인. push는 PAT URL + `credential.helper=` 사용 |
| Fleet Error / Access denied | GitRepo 자격 없음 | read_repository 토큰 |
| Deployment Available 0/1 | pull secret 이름/부재 | Secret 이름 = YAML, Events에서 ImagePull 확인 |
| UI OK + `"kind":"Status"` 404 | Rancher Service Proxy + absolute `/api/v1` | Ingress(또는 NodePort)로 접속하거나 API URL을 proxy prefix 유지 |
| **브라우저 `404 page not found` + `Server: Apache`** (형제 앱은 200) | Ingress에 `spec.tls` / `websecure`를 넣어 Traefik HTTP 라우트가 깨짐. 또는 Class=`None` | **tls·websecure 제거**, class=`traefik`만. Rancher Target이 `http://…`인지 확인. 형제(real-test2)와 비교 |
| Ingress Address 비어 있음 / 404 | DNS·Fleet 미동기화·frontend Pod 없음 | DNS→엣지 IP, Fleet Ready, frontend+backend Running |

### 포트

| 리소스 | 포트 |
| --- | --- |
| backend container / Service | **\<APP_PORT\>** |
| frontend container / Service | **80** |
| nginx → backend | `http://backend:<APP_PORT>` |

### 등록할 CI/CD Variables

| Key | 설명 |
| --- | --- |
| `HARBOR_REGISTRY` | Private Registry **호스트만** (`host` 또는 `host:port`). **`https://`·trailing slash 넣지 말 것** |
| `HARBOR_PROJECT` | Harbor 프로젝트 (= 보통 프로젝트 키) |
| `HARBOR_USER` / `HARBOR_PASSWORD` | Masked |
| `HARBOR_CA_CERT` | (사설 CA면 필수) Harbor를 **서명한 CA** PEM. **base64(권장) 또는 PEM 원문**. 서버 인증서(leaf)를 넣지 말 것. Masked 시 개행 없는 base64가 안전 |
| `GITOPS_BACKEND_FILE` | **기본 `apps/backend/deployment.yaml`** (gitops/ 상대) |
| `GITOPS_FRONTEND_FILE` | **기본 `apps/frontend/deployment.yaml`** (gitops/ 상대) |
| `GITOPS_GIT_TOKEN` | **Maintainer + write_repository** — protected `main` gitops push |

앱 런타임 비밀은 CI Variables로 compose `.env`를 만들지 않는다. ConfigMap / Secret만 사용.

### 파이프라인

| Stage | Job | 역할 |
| --- | --- | --- |
| build | `build_backend` / `build_frontend` | 빌드 → Harbor Push → dotenv `BUILT_*_IMAGE` |
| update-gitops | `update-gitops` | `gitops/${GITOPS_*_FILE}` 의 `image:` 갱신 → PAT로 `main` Push → Fleet |

### 배포 후 확인

1. Pipeline: build_* + update-gitops 성공  
2. Harbor: `<HARBOR_PROJECT>/backend|frontend` 에 새 태그  
3. `gitops/apps/*/deployment.yaml` image = 해당 SHA  
4. Fleet AppBundle Active / Resources Ready  
5. 대상 클러스터 Namespace: Pod Running  
6. Ingress: class=`traefik`, Host=`<GitLab레포명>.k8s.wonikqnc.com` → frontend:80, **Ingress에 tls 없음**, Rancher Target=`http://…` →  
   브라우저는 `https://<GitLab레포명>.k8s.wonikqnc.com/` 접속 (엣지 TLS)  
7. (폴백) frontend가 NodePort면 Rancher에서 할당 포트 확인 → `http://<node>:<nodePort>`  
8. `GET /api/v1/health` 또는 보드 API는 **앱 진입점(Ingress)** 경유.  
   Rancher `…/services/…/proxy/` 만 쓸 때 `fetch("/api/v1/…")`는 클러스터 API로 갈 수 있음 →  
   프론트는 proxy 경로를 유지하는 resolve를 두거나, Ingress를 기본 진입점으로 쓴다.

### 로컬 개발

- README의 uvicorn / `npm run dev`  
- 루트 `docker-compose.yml` = **로컬만** (CI·운영 CD 무관)

### 관련 문서

- 사용자 매뉴얼: `원익큐엔씨_SUSE_Rancher_사용자_매뉴얼_v1.0.pdf` — Part 2 §2  
- 앱·AI 구조: `AI_PLATFORM_DEV_GUIDE.md` (배포 세부는 **본 문서 우선**)

---

## 이 레포에서 쓰는 경우 (선택 기록)

공용 문서이므로 여기에 고정 키를 박지 않는다.  
**이 체크아웃**에서 쓰는 값은 `.cursor/rules/project-overview.mdc` · `deployment.mdc` 가 권위다.  
팀 공유용 vault에는 레포별로 “프로젝트 변수” 노트만 따로 두면 된다.
