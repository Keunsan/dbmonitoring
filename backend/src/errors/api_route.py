"""AS-IS ApiRouteError와 동일한 HTTP 상태·코드를 갖는 예외입니다."""

from __future__ import annotations

from src.errors.exceptions import FrameworkError


class ApiRouteError(FrameworkError):
    """Route Handler에서 사용자에게 노출할 실패 응답용 예외입니다."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status: int = 400,
    ) -> None:
        super().__init__(message, code=code)
        self.status = status