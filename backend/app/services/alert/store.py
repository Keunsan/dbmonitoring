"""AS-IS in-memory 알림 이벤트 저장소 (GET /api/alerts)."""

from __future__ import annotations

_ALERT_EVENTS: list[dict] = []


def list_alert_events() -> list[dict]:
    return list(reversed(_ALERT_EVENTS))


def append_alert_event(event: dict) -> None:
    _ALERT_EVENTS.append(event)


def acknowledge_alert(alert_id: str, *, acknowledged_by: str = "operator") -> dict:
    for index, event in enumerate(_ALERT_EVENTS):
        if event["id"] == alert_id:
            updated = {
                **event,
                "status": "ACKNOWLEDGED",
                "acknowledgedAt": __import__("datetime").datetime.now(
                    __import__("datetime").timezone.utc
                ).isoformat(),
                "acknowledgedBy": acknowledged_by,
            }
            _ALERT_EVENTS[index] = updated
            return updated
    raise KeyError(alert_id)