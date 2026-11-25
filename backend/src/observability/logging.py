"""구조화 로깅 진입점입니다."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from src.config.loader import get_settings


class StructuredLogger:
    """JSON 한 줄 로그."""

    def __init__(self, name: str) -> None:
        self._logger = logging.getLogger(name)
        level = get_settings().log_level.upper()
        self._logger.setLevel(level)
        if not self._logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(logging.Formatter("%(message)s"))
            self._logger.addHandler(handler)

    def _emit(self, level: str, message: str, **fields: Any) -> None:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
            **fields,
        }
        line = json.dumps(payload, ensure_ascii=False)
        getattr(self._logger, level.lower(), self._logger.info)(line)

    def info(self, message: str, **fields: Any) -> None:
        self._emit("INFO", message, **fields)

    def error(self, message: str, **fields: Any) -> None:
        self._emit("ERROR", message, **fields)


logger = StructuredLogger("dbmonitoring-backend")