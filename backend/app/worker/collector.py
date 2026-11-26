"""독립 프로세스용 Collector 스케줄러 진입점입니다."""

from __future__ import annotations

from app.services.collector.scheduler import start_collector_scheduler

if __name__ == "__main__":
    start_collector_scheduler()
    import time

    while True:
        time.sleep(60)