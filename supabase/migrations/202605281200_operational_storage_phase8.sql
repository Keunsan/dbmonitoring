-- 운영 저장소 보강 및 Phase 8 SQL 분석 테이블입니다.
-- RLS는 Phase 2(T-009/T-010) 재개 시 service role 외 접근 정책을 확정합니다.

alter table public.session_snapshot
  add column if not exists blocking_session_id text,
  add column if not exists command text,
  add column if not exists cpu_time_ms integer,
  add column if not exists logical_reads bigint,
  add column if not exists sql_text_masked text;

create index if not exists idx_sql_performance_instance_sql_time
  on public.sql_performance (db_instance_id, sql_id, metric_time desc);

create table if not exists public.sql_plan_snapshot (
  id uuid primary key,
  tenant_id uuid not null,
  db_instance_id uuid not null references public.db_instance(id),
  captured_at timestamptz not null,
  sql_id text not null,
  plan_hash text not null,
  plan_text text not null,
  avg_elapsed_ms double precision not null default 0,
  total_cpu_ms double precision not null default 0,
  total_logical_reads double precision,
  executions bigint not null default 0
);

create index if not exists idx_sql_plan_snapshot_instance_sql_plan_time
  on public.sql_plan_snapshot (db_instance_id, sql_id, plan_hash, captured_at desc);

create table if not exists public.sql_regression_event (
  id uuid primary key,
  tenant_id uuid not null,
  db_instance_id uuid not null references public.db_instance(id),
  detected_at timestamptz not null,
  sql_id text not null,
  metric_key text not null,
  baseline_value double precision not null,
  current_value double precision not null,
  change_percent double precision not null,
  severity text not null,
  recommendation text not null,
  status text not null default 'OPEN',
  issue_candidate jsonb not null default '{}'::jsonb
);

create index if not exists idx_sql_regression_event_instance_detected
  on public.sql_regression_event (db_instance_id, detected_at desc);
create index if not exists idx_sql_regression_event_instance_sql
  on public.sql_regression_event (db_instance_id, sql_id, detected_at desc);
