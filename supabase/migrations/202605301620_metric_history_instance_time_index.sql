-- 대시보드 요약 조회(metric_time 최신순) 성능 개선용 인덱스입니다.
create index if not exists idx_metric_history_instance_time
  on public.metric_history (db_instance_id, metric_time desc);
