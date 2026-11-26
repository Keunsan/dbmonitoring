"""dbmonitoring Python API 진입점입니다."""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.handlers import (  # noqa: E402
    alerts,
    analysis,
    collector,
    health,
    inventory,
    monitoring,
    threshold,
)
from app.legacy_proxy import router as legacy_proxy_router  # noqa: E402
from src.api.exception_handlers import register_exception_handlers  # noqa: E402
from src.config.loader import get_config, get_settings  # noqa: E402
from src.observability.logging import logger  # noqa: E402

app = FastAPI(
    title="dbmonitoring API",
    version=str(get_config().get("app", {}).get("version", "0.1.0")),
    description="통합 DB 관제 — TO-BE 백엔드 (전환기 Next 프록시 지원)",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(monitoring.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(analysis.router, prefix="/api/v1")
app.include_router(collector.router, prefix="/api/v1")
app.include_router(threshold.router, prefix="/api/v1")
# 미등록 경로는 마지막에 레거시 프록시 (R1 전환기)
app.include_router(legacy_proxy_router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    settings = get_settings()
    logger.info(
        "백엔드 시작",
        app_env=settings.app_env,
        app_port=settings.app_port,
    )


def run() -> None:
    import uvicorn

    port = get_settings().app_port
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)


if __name__ == "__main__":
    run()