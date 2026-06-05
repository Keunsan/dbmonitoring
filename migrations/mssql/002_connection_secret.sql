-- DB 인스턴스 접속 Secret 암호화 저장 테이블

IF OBJECT_ID(N'dbo.connection_secret', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.connection_secret (
    secret_name       NVARCHAR(256)   NOT NULL PRIMARY KEY,
    encrypted_payload VARBINARY(MAX)  NOT NULL,
    key_version       INT             NOT NULL CONSTRAINT df_connection_secret_key_version DEFAULT 1,
    description       NVARCHAR(500)   NULL,
    created_at        DATETIMEOFFSET  NOT NULL CONSTRAINT df_connection_secret_created_at DEFAULT SYSDATETIMEOFFSET(),
    updated_at        DATETIMEOFFSET  NOT NULL CONSTRAINT df_connection_secret_updated_at DEFAULT SYSDATETIMEOFFSET()
  );
END;
GO
