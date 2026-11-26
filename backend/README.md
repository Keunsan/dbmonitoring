# dbmonitoring backend (TO-BE)

Python FastAPI API · Collector Worker.

## 로컬 실행

```bash
cd backend
pip install -r requirements.txt
# Windows PowerShell
$env:PYTHONPATH = (Get-Location).Path
uvicorn app.main:app --reload --port 8000
```

- 헬스: http://127.0.0.1:8000/api/v1/health
- 프론트(Vite): `frontend/` → proxy `/api` → `/api/v1`
- 스토리지: MSSQL → Supabase → 메모리
- `NEXT_LEGACY_BASE_URL`: **미등록** 경로만 Next 프록시 (기본 없음 권장)

## Collector

```bash
# API 기동 시 스케줄러 자동 시작 (POST /api/v1/collector/run 에서도 시작)
uvicorn app.main:app --reload --port 8000

# 별도 프로세스 (선택)
python -m app.worker.collector
```

## 테스트

```bash
python -m pytest -q
```