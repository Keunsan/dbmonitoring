# dbmonitoring backend (TO-BE)

Python FastAPI API · Collector 이관 목표.

## 로컬 실행

```bash
cd backend
pip install -r requirements.txt
# Windows PowerShell
$env:PYTHONPATH = (Get-Location).Path
$env:NEXT_LEGACY_BASE_URL = "http://127.0.0.1:3000"
uvicorn app.main:app --reload --port 8000
```

- 헬스: http://127.0.0.1:8000/api/v1/health
- `NEXT_LEGACY_BASE_URL` 설정 시 미이관 `/api/v1/*` → Next `/api/*` 프록시

## 테스트

```bash
pytest -q
```