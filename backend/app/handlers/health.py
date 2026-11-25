"""헬스체크 API 핸들러입니다."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from src.api.schemas import success_response
from src.config.loader import get_config, get_settings

router = APIRouter(tags=["infra"])


@router.get("/health")
def health_check() -> dict:
    """앱·설정 상태를 반환합니다 (AS-IS /api/health 호환 필드)."""
    cfg = get_config()
    settings = get_settings()
    db_configured = bool(
        __import__("os").getenv("DATABASE_URL") or __import__("os").getenv("SUPABASE_URL")
    )
    return success_response(
        {
            "status": "ok",
            "service": "dbmonitoring-api",
            "runtime": "python",
            "db": {
                "configured": db_configured,
                "provider": "supabase_or_postgres" if db_configured else "not_configured",
            },
            "monitoring": {
                "collect_interval_sec": cfg.get("monitoring", {}).get("collect_interval_sec", 60),
                "ui_refresh_sec": cfg.get("monitoring", {}).get("ui_refresh_sec", 60),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )