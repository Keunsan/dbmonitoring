---
name: git-push
description: >-
  GitLab/GitHub dbmonitoring 커밋·푸시 절차. 사용자가 커밋/푸시/ship을 요청할 때만 실행.
  배포(K8s/Harbor)는 보류. Use when user asks to commit, push, 커밋, 푸시.
---

# git-push (dbmonitoring)

## 역할 분리

- 제약: `.cursor/rules/deployment.mdc`, `docs/REFACTORING_PLAN.md`
- 이 Skill: **실행 순서만**

## 절대 규칙

- 사용자 **명시 요청 시에만** 커밋/푸시
- `git config` 변경, force push, `--no-verify` 금지
- `.env.local`, `backend/.env`, 시크릿 스테이징 제외

## 레포 사실

| 항목 | 값 |
|------|-----|
| 원격 | GitHub `Keunsan/dbmonitoring` (팀 GitLab 병행 가능) |
| 브랜치 | `main` |
| 배포 CI | **없음/보류** — lint·test만 허용 |
| 모노레포 | 루트 Next(AS-IS) + `frontend/` + `backend/` |

## 순서

1. `git status`, `git diff` — 범위·비밀 확인
2. 사용자 요청 시 `git add` (관련 경로만)
3. 한국어 커밋 메시지
4. `git push` (요청 시)
5. 배포 파이프라인 안내 **생략** (VM 대기)