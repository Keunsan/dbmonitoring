"""Collector 도메인 타입 (AS-IS services/collector/types 동등)."""

from __future__ import annotations

from typing import Literal

CollectorRunScope = Literal["full", "sessions"]
CollectStatus = Literal["SUCCESS", "FAIL", "PARTIAL"]