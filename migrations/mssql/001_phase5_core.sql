-- Phase 5 운영 DB 핵심 스키마 (MSSQL)

IF OBJECT_ID(N'dbo.business_system', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.business_system (
    id              UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id       UNIQUEIDENTIFIER NOT NULL,
    code            NVARCHAR(100)    NOT NULL,
    name            NVARCHAR(500)    NOT NULL,
    importance      NVARCHAR(50)     NOT NULL,
    owner_dept      NVARCHAR(200)    NULL,
    owner_name      NVARCHAR(200)    NULL,
    owner_email     NVARCHAR(320)    NULL,
    created_at      DATETIMEOFFSET   NOT NULL CONSTRAINT df_business_system_created_at DEFAULT SYSDATETIMEOFFSET(),
    updated_at      DATETIMEOFFSET   NOT NULL CONSTRAINT df_business_system_updated_at DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT uq_business_system_tenant_code UNIQUE (tenant_id, code)
  );
END;
GO

IF OBJECT_ID(N'dbo.db_instance', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.db_instance (
    id                          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id                   UNIQUEIDENTIFIER NOT NULL,
    dbms_type                   NVARCHAR(50)     NOT NULL,
    instance_name               NVARCHAR(200)    NOT NULL,
    host                        NVARCHAR(500)    NOT NULL,
    port                        INT              NOT NULL,
    service_name                NVARCHAR(200)    NULL,
    database_name               NVARCHAR(200)    NULL,
    business_system_id          UNIQUEIDENTIFIER NOT NULL,
    importance                  NVARCHAR(50)     NOT NULL,
    env_type                    NVARCHAR(50)     NOT NULL,
    collector_type              NVARCHAR(50)     NOT NULL,
    collector_id                NVARCHAR(200)    NULL,
    collect_interval_sec        INT              NOT NULL CONSTRAINT df_db_instance_collect_interval DEFAULT 30,
    sql_aggregate_interval_sec  INT              NOT NULL CONSTRAINT df_db_instance_sql_aggregate_interval DEFAULT 300,
    is_active                   BIT              NOT NULL CONSTRAINT df_db_instance_is_active DEFAULT 1,
    connection_secret_ref       NVARCHAR(500)    NOT NULL,
    last_collect_at             DATETIMEOFFSET   NULL,
    last_collect_status         NVARCHAR(50)     NULL,
    last_connection_test_at     DATETIMEOFFSET   NULL,
    last_connection_test_status NVARCHAR(50)     NULL,
    created_at                  DATETIMEOFFSET   NOT NULL CONSTRAINT df_db_instance_created_at DEFAULT SYSDATETIMEOFFSET(),
    updated_at                  DATETIMEOFFSET   NOT NULL CONSTRAINT df_db_instance_updated_at DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT fk_db_instance_business_system FOREIGN KEY (business_system_id)
      REFERENCES dbo.business_system (id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_db_instance_tenant_active' AND object_id = OBJECT_ID(N'dbo.db_instance')
)
BEGIN
  CREATE INDEX idx_db_instance_tenant_active ON dbo.db_instance (tenant_id, is_active);
END;
GO

IF OBJECT_ID(N'dbo.collection_run', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.collection_run (
    id              UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id       UNIQUEIDENTIFIER NOT NULL,
    db_instance_id  UNIQUEIDENTIFIER NOT NULL,
    started_at      DATETIMEOFFSET   NOT NULL,
    finished_at     DATETIMEOFFSET   NOT NULL,
    status          NVARCHAR(50)     NOT NULL,
    error_message   NVARCHAR(MAX)    NULL,
    metrics_count   INT              NOT NULL CONSTRAINT df_collection_run_metrics_count DEFAULT 0,
    sessions_count  INT              NOT NULL CONSTRAINT df_collection_run_sessions_count DEFAULT 0,
    locks_count     INT              NOT NULL CONSTRAINT df_collection_run_locks_count DEFAULT 0,
    sql_count       INT              NOT NULL CONSTRAINT df_collection_run_sql_count DEFAULT 0,
    CONSTRAINT fk_collection_run_db_instance FOREIGN KEY (db_instance_id)
      REFERENCES dbo.db_instance (id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_collection_run_instance_time' AND object_id = OBJECT_ID(N'dbo.collection_run')
)
BEGIN
  CREATE INDEX idx_collection_run_instance_time ON dbo.collection_run (db_instance_id, finished_at DESC);
END;
GO

IF OBJECT_ID(N'dbo.metric_history', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.metric_history (
    id              UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id       UNIQUEIDENTIFIER NOT NULL,
    db_instance_id  UNIQUEIDENTIFIER NOT NULL,
    metric_time     DATETIMEOFFSET   NOT NULL,
    metric_name     NVARCHAR(200)    NOT NULL,
    metric_value    FLOAT            NOT NULL,
    unit            NVARCHAR(50)     NULL,
    tags            NVARCHAR(MAX)    NOT NULL CONSTRAINT df_metric_history_tags DEFAULT N'{}',
    CONSTRAINT fk_metric_history_db_instance FOREIGN KEY (db_instance_id)
      REFERENCES dbo.db_instance (id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_metric_history_instance_metric_time' AND object_id = OBJECT_ID(N'dbo.metric_history')
)
BEGIN
  CREATE INDEX idx_metric_history_instance_metric_time
    ON dbo.metric_history (db_instance_id, metric_name, metric_time DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_metric_history_instance_time' AND object_id = OBJECT_ID(N'dbo.metric_history')
)
BEGIN
  CREATE INDEX idx_metric_history_instance_time
    ON dbo.metric_history (db_instance_id, metric_time DESC);
END;
GO

IF OBJECT_ID(N'dbo.session_snapshot', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.session_snapshot (
    id                   UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id            UNIQUEIDENTIFIER NOT NULL,
    db_instance_id       UNIQUEIDENTIFIER NOT NULL,
    snapshot_time        DATETIMEOFFSET   NOT NULL,
    session_id           NVARCHAR(100)    NOT NULL,
    login_name           NVARCHAR(200)    NOT NULL,
    status               NVARCHAR(100)    NOT NULL,
    wait_type            NVARCHAR(200)    NULL,
    wait_ms              INT              NULL,
    sql_id               NVARCHAR(200)    NULL,
    blocking_session_id  NVARCHAR(100)    NULL,
    command              NVARCHAR(200)    NULL,
    cpu_time_ms          INT              NULL,
    logical_reads        BIGINT           NULL,
    sql_text_masked      NVARCHAR(MAX)    NULL,
    host_name            NVARCHAR(200)    NULL,
    program_name         NVARCHAR(200)    NULL,
    database_name        NVARCHAR(200)    NULL,
    CONSTRAINT fk_session_snapshot_db_instance FOREIGN KEY (db_instance_id)
      REFERENCES dbo.db_instance (id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_session_snapshot_instance_time' AND object_id = OBJECT_ID(N'dbo.session_snapshot')
)
BEGIN
  CREATE INDEX idx_session_snapshot_instance_time
    ON dbo.session_snapshot (db_instance_id, snapshot_time DESC);
END;
GO

IF OBJECT_ID(N'dbo.blocking_snapshot', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.blocking_snapshot (
    id                  UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id           UNIQUEIDENTIFIER NOT NULL,
    db_instance_id      UNIQUEIDENTIFIER NOT NULL,
    snapshot_time       DATETIMEOFFSET   NOT NULL,
    blocker_session_id  NVARCHAR(100)    NOT NULL,
    blocked_session_id  NVARCHAR(100)    NOT NULL,
    lock_type           NVARCHAR(100)    NOT NULL,
    wait_ms             INT              NOT NULL,
    object_name         NVARCHAR(500)    NULL,
    CONSTRAINT fk_blocking_snapshot_db_instance FOREIGN KEY (db_instance_id)
      REFERENCES dbo.db_instance (id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_blocking_snapshot_instance_time' AND object_id = OBJECT_ID(N'dbo.blocking_snapshot')
)
BEGIN
  CREATE INDEX idx_blocking_snapshot_instance_time
    ON dbo.blocking_snapshot (db_instance_id, snapshot_time DESC);
END;
GO

IF OBJECT_ID(N'dbo.sql_performance', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.sql_performance (
    id                   UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id            UNIQUEIDENTIFIER NOT NULL,
    db_instance_id       UNIQUEIDENTIFIER NOT NULL,
    metric_time          DATETIMEOFFSET   NOT NULL,
    sql_id               NVARCHAR(200)    NOT NULL,
    sql_text_masked      NVARCHAR(MAX)    NOT NULL,
    executions           BIGINT           NOT NULL,
    avg_elapsed_ms       FLOAT            NOT NULL,
    total_cpu_ms         FLOAT            NOT NULL,
    total_logical_reads  FLOAT            NULL,
    last_execution_time  DATETIMEOFFSET   NULL,
    CONSTRAINT fk_sql_performance_db_instance FOREIGN KEY (db_instance_id)
      REFERENCES dbo.db_instance (id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_sql_performance_instance_time' AND object_id = OBJECT_ID(N'dbo.sql_performance')
)
BEGIN
  CREATE INDEX idx_sql_performance_instance_time
    ON dbo.sql_performance (db_instance_id, metric_time DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_sql_performance_instance_sql_time' AND object_id = OBJECT_ID(N'dbo.sql_performance')
)
BEGIN
  CREATE INDEX idx_sql_performance_instance_sql_time
    ON dbo.sql_performance (db_instance_id, sql_id, metric_time DESC);
END;
GO

IF OBJECT_ID(N'dbo.deadlock_event', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.deadlock_event (
    id                 UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id          UNIQUEIDENTIFIER NOT NULL,
    db_instance_id     UNIQUEIDENTIFIER NOT NULL,
    occurred_at        DATETIMEOFFSET   NOT NULL,
    victim_session_id  NVARCHAR(100)    NOT NULL,
    graph_xml          NVARCHAR(MAX)    NOT NULL,
    CONSTRAINT fk_deadlock_event_db_instance FOREIGN KEY (db_instance_id)
      REFERENCES dbo.db_instance (id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_deadlock_event_instance_time' AND object_id = OBJECT_ID(N'dbo.deadlock_event')
)
BEGIN
  CREATE INDEX idx_deadlock_event_instance_time
    ON dbo.deadlock_event (db_instance_id, occurred_at DESC);
END;
GO

IF OBJECT_ID(N'dbo.sql_plan_snapshot', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.sql_plan_snapshot (
    id                   UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id            UNIQUEIDENTIFIER NOT NULL,
    db_instance_id       UNIQUEIDENTIFIER NOT NULL,
    captured_at          DATETIMEOFFSET   NOT NULL,
    sql_id               NVARCHAR(200)    NOT NULL,
    plan_hash            NVARCHAR(200)    NOT NULL,
    plan_text            NVARCHAR(MAX)    NOT NULL,
    avg_elapsed_ms       FLOAT            NOT NULL CONSTRAINT df_sql_plan_avg_elapsed DEFAULT 0,
    total_cpu_ms         FLOAT            NOT NULL CONSTRAINT df_sql_plan_total_cpu DEFAULT 0,
    total_logical_reads  FLOAT            NULL,
    executions           BIGINT           NOT NULL CONSTRAINT df_sql_plan_executions DEFAULT 0,
    CONSTRAINT fk_sql_plan_snapshot_db_instance FOREIGN KEY (db_instance_id)
      REFERENCES dbo.db_instance (id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_sql_plan_snapshot_instance_sql_plan_time' AND object_id = OBJECT_ID(N'dbo.sql_plan_snapshot')
)
BEGIN
  CREATE INDEX idx_sql_plan_snapshot_instance_sql_plan_time
    ON dbo.sql_plan_snapshot (db_instance_id, sql_id, plan_hash, captured_at DESC);
END;
GO

IF OBJECT_ID(N'dbo.sql_regression_event', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.sql_regression_event (
    id              UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id       UNIQUEIDENTIFIER NOT NULL,
    db_instance_id  UNIQUEIDENTIFIER NOT NULL,
    detected_at     DATETIMEOFFSET   NOT NULL,
    sql_id          NVARCHAR(200)    NOT NULL,
    metric_key      NVARCHAR(200)    NOT NULL,
    baseline_value  FLOAT            NOT NULL,
    current_value   FLOAT            NOT NULL,
    change_percent  FLOAT            NOT NULL,
    severity        NVARCHAR(50)     NOT NULL,
    recommendation  NVARCHAR(MAX)    NOT NULL,
    status          NVARCHAR(50)     NOT NULL CONSTRAINT df_sql_regression_status DEFAULT N'OPEN',
    issue_candidate NVARCHAR(MAX)    NOT NULL CONSTRAINT df_sql_regression_issue_candidate DEFAULT N'{}',
    CONSTRAINT fk_sql_regression_event_db_instance FOREIGN KEY (db_instance_id)
      REFERENCES dbo.db_instance (id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_sql_regression_event_instance_detected' AND object_id = OBJECT_ID(N'dbo.sql_regression_event')
)
BEGIN
  CREATE INDEX idx_sql_regression_event_instance_detected
    ON dbo.sql_regression_event (db_instance_id, detected_at DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_sql_regression_event_instance_sql' AND object_id = OBJECT_ID(N'dbo.sql_regression_event')
)
BEGIN
  CREATE INDEX idx_sql_regression_event_instance_sql
    ON dbo.sql_regression_event (db_instance_id, sql_id, detected_at DESC);
END;
GO
