"use client";

/** DB 인스턴스 관리 화면의 등록·조회·연결 테스트 클라이언트 컴포넌트입니다. */

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout";
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiResponse } from "@/types/api";
import type { BusinessSystem, DbInstance } from "@/types/entities";

type InventoryPayload = {
  items: DbInstance[];
  businessSystems: BusinessSystem[];
};

type BusinessSystemForm = {
  code: string;
  name: string;
  importance: string;
  ownerDept: string;
  ownerName: string;
  ownerEmail: string;
};

type DbInstanceForm = {
  dbmsType: string;
  instanceName: string;
  host: string;
  port: string;
  databaseName: string;
  businessSystemId: string;
  importance: string;
  envType: string;
  collectorType: string;
  collectorId: string;
  collectIntervalSec: string;
  sqlAggregateIntervalSec: string;
  isActive: boolean;
};

type ConnectionSecretForm = {
  username: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  connectString: string;
  serviceName: string;
};

type RegistrationConnectionTestState = {
  status: "idle" | "testing" | "success" | "fail";
  key: string | null;
  message: string | null;
};

type DbInstanceManagementClientProps = {
  initialBusinessSystems: BusinessSystem[];
  initialDbInstances: DbInstance[];
};

const defaultBusinessSystemForm: BusinessSystemForm = {
  code: "",
  name: "",
  importance: "MEDIUM",
  ownerDept: "",
  ownerName: "",
  ownerEmail: "",
};

const defaultDbInstanceForm: DbInstanceForm = {
  dbmsType: "MSSQL",
  instanceName: "",
  host: "",
  port: "1433",
  databaseName: "",
  businessSystemId: "",
  importance: "MEDIUM",
  envType: "DEV",
  collectorType: "AGENTLESS",
  collectorId: "local-dev-collector",
  collectIntervalSec: "30",
  sqlAggregateIntervalSec: "300",
  isActive: true,
};

const defaultConnectionSecretForm: ConnectionSecretForm = {
  username: "",
  password: "",
  encrypt: true,
  trustServerCertificate: true,
  connectString: "",
  serviceName: "",
};

const defaultRegistrationTestState: RegistrationConnectionTestState = {
  status: "idle",
  key: null,
  message: null,
};

const toBusinessSystemForm = (system: BusinessSystem): BusinessSystemForm => ({
  code: system.code,
  name: system.name,
  importance: system.importance,
  ownerDept: system.ownerDept ?? "",
  ownerName: system.ownerName ?? "",
  ownerEmail: system.ownerEmail ?? "",
});

const toDbInstanceForm = (instance: DbInstance): DbInstanceForm => ({
  dbmsType: instance.dbmsType,
  instanceName: instance.instanceName,
  host: instance.host,
  port: String(instance.port),
  databaseName: instance.databaseName ?? "",
  businessSystemId: instance.businessSystemId,
  importance: instance.importance,
  envType: instance.envType,
  collectorType: instance.collectorType,
  collectorId: instance.collectorId ?? "",
  collectIntervalSec: String(instance.collectIntervalSec),
  sqlAggregateIntervalSec: String(instance.sqlAggregateIntervalSec),
  isActive: instance.isActive,
});

const toDbInstancePayload = (form: DbInstanceForm) => ({
  ...form,
  port: Number(form.port),
  collectIntervalSec: Number(form.collectIntervalSec),
  sqlAggregateIntervalSec: Number(form.sqlAggregateIntervalSec),
});

const toErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
  return payload?.error?.message ?? "요청 처리 중 오류가 발생했습니다.";
};

const requestJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response));
  }

  const payload = (await response.json()) as ApiResponse<T>;

  if (payload.error) {
    throw new Error(payload.error.message);
  }

  return payload.data as T;
};

const SelectField = ({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
}) => {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full"
      >
        {placeholder ? (
          <NativeSelectOption value="" disabled>
            {placeholder}
          </NativeSelectOption>
        ) : null}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
};

const CheckboxField = ({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <div className="flex items-center gap-2">
    <Checkbox
      id={id}
      checked={checked}
      onCheckedChange={(value) => onChange(value === true)}
    />
    <Label htmlFor={id}>{label}</Label>
  </div>
);

/**
 * 업무 시스템과 DB 인스턴스 등록, 수집 설정, 연결 테스트를 제공합니다.
 */
export const DbInstanceManagementClient = ({
  initialBusinessSystems,
  initialDbInstances,
}: DbInstanceManagementClientProps) => {
  const [businessSystems, setBusinessSystems] = useState<BusinessSystem[]>(
    initialBusinessSystems,
  );
  const [dbInstances, setDbInstances] = useState<DbInstance[]>(initialDbInstances);
  const [businessForm, setBusinessForm] = useState(defaultBusinessSystemForm);
  const [editingBusinessSystemId, setEditingBusinessSystemId] = useState<string | null>(
    null,
  );
  const [businessEditForm, setBusinessEditForm] =
    useState<BusinessSystemForm>(defaultBusinessSystemForm);
  const [dbForm, setDbForm] = useState<DbInstanceForm>(() => ({
    ...defaultDbInstanceForm,
    businessSystemId: initialBusinessSystems[0]?.id ?? "",
  }));
  const [editingDbInstanceId, setEditingDbInstanceId] = useState<string | null>(null);
  const [dbEditForm, setDbEditForm] = useState<DbInstanceForm>(defaultDbInstanceForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [registrationSecretForm, setRegistrationSecretForm] =
    useState<ConnectionSecretForm>(defaultConnectionSecretForm);
  const [registrationTest, setRegistrationTest] =
    useState<RegistrationConnectionTestState>(defaultRegistrationTestState);
  const [secretTargetId, setSecretTargetId] = useState<string | null>(null);
  const [secretForm, setSecretForm] = useState<ConnectionSecretForm>(
    defaultConnectionSecretForm,
  );
  const [savingSecretId, setSavingSecretId] = useState<string | null>(null);
  const [deleteConfirmInstance, setDeleteConfirmInstance] = useState<DbInstance | null>(
    null,
  );
  const [deletingDbInstanceId, setDeletingDbInstanceId] = useState<string | null>(null);
  const [registerConfirmOpen, setRegisterConfirmOpen] = useState(false);
  const [isRegisteringDbInstance, setIsRegisteringDbInstance] = useState(false);
  const [businessRegisterConfirmOpen, setBusinessRegisterConfirmOpen] = useState(false);
  const [isRegisteringBusinessSystem, setIsRegisteringBusinessSystem] = useState(false);
  const [businessUpdateConfirmOpen, setBusinessUpdateConfirmOpen] = useState(false);
  const [isUpdatingBusinessSystem, setIsUpdatingBusinessSystem] = useState(false);
  const [deleteConfirmBusinessSystem, setDeleteConfirmBusinessSystem] =
    useState<BusinessSystem | null>(null);
  const [deletingBusinessSystemId, setDeletingBusinessSystemId] = useState<string | null>(
    null,
  );
  const [dbEditConfirmOpen, setDbEditConfirmOpen] = useState(false);
  const [isUpdatingDbInstance, setIsUpdatingDbInstance] = useState(false);

  const businessSystemOptions = useMemo(
    () =>
      businessSystems.map((system) => ({
        label: `${system.name} (${system.code})`,
        value: system.id,
      })),
    [businessSystems],
  );

  const dbInstancePayload = useMemo(
    () => toDbInstancePayload(dbForm),
    [dbForm],
  );

  const registrationCredentialPayload = useMemo(
    () => ({
      username: registrationSecretForm.username,
      password: registrationSecretForm.password,
      encrypt: registrationSecretForm.encrypt,
      trustServerCertificate: registrationSecretForm.trustServerCertificate,
      connectString:
        dbForm.dbmsType === "ORACLE" ? registrationSecretForm.connectString : undefined,
      serviceName:
        dbForm.dbmsType === "ORACLE"
          ? registrationSecretForm.serviceName || dbForm.databaseName
          : undefined,
    }),
    [dbForm.databaseName, dbForm.dbmsType, registrationSecretForm],
  );

  const registrationTestKey = useMemo(
    () =>
      JSON.stringify({
        instance: dbInstancePayload,
        credential: registrationCredentialPayload,
      }),
    [dbInstancePayload, registrationCredentialPayload],
  );

  const hasRequiredDbInstanceFields = Boolean(
    dbForm.businessSystemId &&
      dbForm.instanceName.trim() &&
      dbForm.host.trim() &&
      dbForm.port.trim() &&
      registrationSecretForm.username.trim() &&
      registrationSecretForm.password.trim(),
  );
  const hasRequiredOracleConnectInfo =
    dbForm.dbmsType !== "ORACLE" ||
    Boolean(registrationSecretForm.connectString.trim() || dbForm.databaseName.trim());
  const canTestDbInstance =
    hasRequiredDbInstanceFields && hasRequiredOracleConnectInfo;
  const hasSuccessfulCurrentRegistrationTest =
    registrationTest.status === "success" && registrationTest.key === registrationTestKey;
  const registrationTestNeedsRefresh =
    registrationTest.status === "success" && registrationTest.key !== registrationTestKey;
  const canSubmitDbInstance =
    canTestDbInstance && hasSuccessfulCurrentRegistrationTest;

  const registerConfirmSummary = useMemo(() => {
    const businessSystem = businessSystems.find(
      (system) => system.id === dbForm.businessSystemId,
    );

    return {
      instanceName: dbForm.instanceName.trim(),
      dbmsType: dbForm.dbmsType,
      host: dbForm.host.trim(),
      port: dbForm.port,
      databaseName: dbForm.databaseName.trim() || "-",
      businessSystemName: businessSystem?.name ?? "미지정",
    };
  }, [businessSystems, dbForm]);

  const canSubmitBusinessSystem = Boolean(
    businessForm.code.trim() && businessForm.name.trim(),
  );

  const businessRegisterConfirmSummary = useMemo(
    () => ({
      code: businessForm.code.trim(),
      name: businessForm.name.trim(),
      importance: businessForm.importance,
      ownerDept: businessForm.ownerDept.trim() || "-",
      ownerName: businessForm.ownerName.trim() || "-",
      ownerEmail: businessForm.ownerEmail.trim() || "-",
    }),
    [businessForm],
  );

  const businessEditConfirmSummary = useMemo(
    () => ({
      code: businessEditForm.code.trim(),
      name: businessEditForm.name.trim(),
      importance: businessEditForm.importance,
      ownerDept: businessEditForm.ownerDept.trim() || "-",
      ownerName: businessEditForm.ownerName.trim() || "-",
      ownerEmail: businessEditForm.ownerEmail.trim() || "-",
    }),
    [businessEditForm],
  );

  const dbEditConfirmSummary = useMemo(() => {
    const businessSystem = businessSystems.find(
      (system) => system.id === dbEditForm.businessSystemId,
    );

    return {
      instanceName: dbEditForm.instanceName.trim(),
      dbmsType: dbEditForm.dbmsType,
      host: dbEditForm.host.trim(),
      port: dbEditForm.port,
      databaseName: dbEditForm.databaseName.trim() || "-",
      businessSystemName: businessSystem?.name ?? "미지정",
    };
  }, [businessSystems, dbEditForm]);

  const canSubmitDbInstanceEdit = Boolean(
    dbEditForm.businessSystemId &&
      dbEditForm.instanceName.trim() &&
      dbEditForm.host.trim() &&
      dbEditForm.port.trim(),
  );

  const isRegistrationBusy =
    isRegisteringDbInstance || registrationTest.status === "testing";

  /** API 오류를 사용자에게 보여줄 문구로 변환합니다. */
  const resolveUserFacingErrorMessage = (actionError: unknown, fallback: string) => {
    if (actionError instanceof Error && actionError.message.trim()) {
      return actionError.message;
    }
    return fallback;
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await requestJson<InventoryPayload>("/api/db-instances");
      setBusinessSystems(payload.businessSystems);
      setDbInstances(payload.items);
      setDbForm((current) => ({
        ...current,
        businessSystemId: payload.businessSystems.some(
          (system) => system.id === current.businessSystemId,
        )
          ? current.businessSystemId
          : payload.businessSystems[0]?.id || "",
      }));
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "DB 인스턴스 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  };

  /** 업무 시스템 등록 확인 다이얼로그를 엽니다. */
  const requestRegisterBusinessSystem = () => {
    setMessage(null);
    setError(null);

    if (!canSubmitBusinessSystem) {
      setError("업무 코드와 업무명을 입력해주세요.");
      return;
    }

    setBusinessRegisterConfirmOpen(true);
  };

  const handleBusinessRegisterFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    requestRegisterBusinessSystem();
  };

  /** 확인 후 업무 시스템을 등록합니다. */
  const confirmRegisterBusinessSystem = async () => {
    if (!canSubmitBusinessSystem || isRegisteringBusinessSystem) {
      return;
    }

    setIsRegisteringBusinessSystem(true);
    setMessage(null);
    setError(null);

    try {
      await requestJson<BusinessSystem>("/api/business-systems", {
        method: "POST",
        body: JSON.stringify(businessForm),
      });
      setBusinessRegisterConfirmOpen(false);
      setBusinessForm(defaultBusinessSystemForm);
      setMessage(
        `"${businessRegisterConfirmSummary.name}" 업무 시스템을 등록했습니다.`,
      );
      await refresh();
    } catch (submitError) {
      setError(
        resolveUserFacingErrorMessage(
          submitError,
          "업무 시스템을 등록하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.",
        ),
      );
    } finally {
      setIsRegisteringBusinessSystem(false);
    }
  };

  const startBusinessSystemEdit = (system: BusinessSystem) => {
    setEditingBusinessSystemId(system.id);
    setBusinessEditForm(toBusinessSystemForm(system));
    setMessage(null);
    setError(null);
  };

  const handleBusinessEditFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingBusinessSystemId) {
      return;
    }

    setMessage(null);
    setError(null);

    if (!businessEditForm.name.trim()) {
      setError("업무명을 입력해주세요.");
      return;
    }

    setBusinessUpdateConfirmOpen(true);
  };

  /** 확인 후 업무 시스템 정보를 수정합니다. */
  const confirmUpdateBusinessSystem = async () => {
    if (!editingBusinessSystemId || isUpdatingBusinessSystem) {
      return;
    }

    setIsUpdatingBusinessSystem(true);
    setMessage(null);
    setError(null);

    try {
      await requestJson<BusinessSystem>(`/api/business-systems/${editingBusinessSystemId}`, {
        method: "PATCH",
        body: JSON.stringify(businessEditForm),
      });
      setBusinessUpdateConfirmOpen(false);
      setEditingBusinessSystemId(null);
      setBusinessEditForm(defaultBusinessSystemForm);
      setMessage(`"${businessEditConfirmSummary.name}" 업무 시스템 정보를 수정했습니다.`);
      await refresh();
    } catch (updateError) {
      setError(
        resolveUserFacingErrorMessage(
          updateError,
          "업무 시스템 정보를 수정하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.",
        ),
      );
    } finally {
      setIsUpdatingBusinessSystem(false);
    }
  };

  /** 확인 다이얼로그에서 업무 시스템 삭제를 실행합니다. */
  const confirmDeleteBusinessSystem = async () => {
    if (!deleteConfirmBusinessSystem || deletingBusinessSystemId) {
      return;
    }

    const target = deleteConfirmBusinessSystem;
    setDeletingBusinessSystemId(target.id);
    setMessage(null);
    setError(null);

    try {
      await requestJson(`/api/business-systems/${target.id}`, { method: "DELETE" });
      if (editingBusinessSystemId === target.id) {
        setEditingBusinessSystemId(null);
        setBusinessEditForm(defaultBusinessSystemForm);
      }
      setDeleteConfirmBusinessSystem(null);
      setMessage(`"${target.name}" 업무 시스템을 삭제했습니다.`);
      await refresh();
    } catch (deleteError) {
      setError(
        resolveUserFacingErrorMessage(
          deleteError,
          "업무 시스템을 삭제하지 못했습니다. 연결된 DB 인스턴스가 있는지 확인해주세요.",
        ),
      );
    } finally {
      setDeletingBusinessSystemId(null);
    }
  };

  /** 등록 확인 다이얼로그를 엽니다. */
  const requestRegisterDbInstance = () => {
    setMessage(null);
    setError(null);

    if (!canSubmitDbInstance) {
      setError("DB 연결 테스트에 성공한 후 DB 인스턴스를 등록할 수 있습니다.");
      return;
    }

    setRegisterConfirmOpen(true);
  };

  /** 확인 후 DB 인스턴스 등록과 Secret 저장을 수행합니다. */
  const confirmRegisterDbInstance = async () => {
    if (!canSubmitDbInstance || isRegisteringDbInstance) {
      return;
    }

    setIsRegisteringDbInstance(true);
    setMessage(null);
    setError(null);

    try {
      const instance = await requestJson<DbInstance>("/api/db-instances", {
        method: "POST",
        body: JSON.stringify(dbInstancePayload),
      });

      await requestJson<{
        connectionSecretRef: string;
      }>(`/api/db-instances/${instance.id}/connection-secret`, {
        method: "POST",
        body: JSON.stringify(registrationCredentialPayload),
      });

      setRegisterConfirmOpen(false);
      setDbForm((current) => ({
        ...defaultDbInstanceForm,
        businessSystemId: current.businessSystemId,
      }));
      setRegistrationSecretForm(defaultConnectionSecretForm);
      setRegistrationTest(defaultRegistrationTestState);
      setMessage(`"${registerConfirmSummary.instanceName}" DB 인스턴스를 등록했습니다.`);
      await refresh();
    } catch (submitError) {
      setError(
        resolveUserFacingErrorMessage(
          submitError,
          "DB 인스턴스를 등록하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.",
        ),
      );
    } finally {
      setIsRegisteringDbInstance(false);
    }
  };

  const handleRegisterFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    requestRegisterDbInstance();
  };

  const testRegistrationConnection = async () => {
    setMessage(null);
    setError(null);
    setRegistrationTest({
      status: "testing",
      key: registrationTestKey,
      message: "DB 연결 테스트를 진행 중입니다.",
    });

    try {
      const result = await requestJson<{
        latencyMs: number | null;
        message: string;
      }>("/api/db-instances/test-connection", {
        method: "POST",
        body: JSON.stringify({
          instance: dbInstancePayload,
          credential: registrationCredentialPayload,
        }),
      });

      setRegistrationTest({
        status: "success",
        key: registrationTestKey,
        message: `${result.message} 지연시간: ${result.latencyMs ?? "-"}ms`,
      });
      setMessage("등록 전 DB 연결 테스트에 성공했습니다.");
    } catch (testError) {
      const testMessage = resolveUserFacingErrorMessage(
        testError,
        "등록 전 DB 연결 테스트에 실패했습니다. Host·Port·계정 정보를 확인해주세요.",
      );

      setRegistrationTest({
        status: "fail",
        key: registrationTestKey,
        message: testMessage,
      });
      setError(testMessage);
    }
  };

  const startDbInstanceEdit = (instance: DbInstance) => {
    setEditingDbInstanceId(instance.id);
    setDbEditForm(toDbInstanceForm(instance));
    setMessage(null);
    setError(null);
  };

  const handleDbInstanceEditFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingDbInstanceId) {
      return;
    }

    setMessage(null);
    setError(null);

    if (!canSubmitDbInstanceEdit) {
      setError("업무 시스템, 인스턴스명, Host, Port를 입력해주세요.");
      return;
    }

    setDbEditConfirmOpen(true);
  };

  /** 확인 후 DB 인스턴스 정보를 수정합니다. */
  const confirmUpdateDbInstance = async () => {
    if (!editingDbInstanceId || !canSubmitDbInstanceEdit || isUpdatingDbInstance) {
      return;
    }

    setIsUpdatingDbInstance(true);
    setMessage(null);
    setError(null);

    try {
      await requestJson<DbInstance>(`/api/db-instances/${editingDbInstanceId}`, {
        method: "PATCH",
        body: JSON.stringify(toDbInstancePayload(dbEditForm)),
      });
      setDbEditConfirmOpen(false);
      setEditingDbInstanceId(null);
      setDbEditForm(defaultDbInstanceForm);
      setMessage(`"${dbEditConfirmSummary.instanceName}" DB 인스턴스 정보를 수정했습니다.`);
      await refresh();
    } catch (updateError) {
      setError(
        resolveUserFacingErrorMessage(
          updateError,
          "DB 인스턴스 정보를 수정하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.",
        ),
      );
    } finally {
      setIsUpdatingDbInstance(false);
    }
  };

  /** 확인 다이얼로그에서 삭제를 실행합니다. */
  const confirmDeleteDbInstance = async () => {
    if (!deleteConfirmInstance || deletingDbInstanceId) {
      return;
    }

    const target = deleteConfirmInstance;
    setDeletingDbInstanceId(target.id);
    setMessage(null);
    setError(null);

    try {
      await requestJson(`/api/db-instances/${target.id}`, { method: "DELETE" });
      if (editingDbInstanceId === target.id) {
        setEditingDbInstanceId(null);
        setDbEditForm(defaultDbInstanceForm);
      }
      if (secretTargetId === target.id) {
        setSecretTargetId(null);
        setSecretForm(defaultConnectionSecretForm);
      }
      setDeleteConfirmInstance(null);
      setMessage(`"${target.instanceName}" DB 인스턴스를 삭제했습니다.`);
      await refresh();
    } catch (deleteError) {
      setError(
        resolveUserFacingErrorMessage(
          deleteError,
          "DB 인스턴스를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.",
        ),
      );
    } finally {
      setDeletingDbInstanceId(null);
    }
  };

  const updateCollectionSettings = async (instance: DbInstance) => {
    setMessage(null);
    setError(null);

    try {
      await requestJson<DbInstance>(
        `/api/db-instances/${instance.id}/collection-settings`,
        {
          method: "PATCH",
          body: JSON.stringify({
            collectorId: instance.collectorId,
            collectIntervalSec: instance.collectIntervalSec,
            sqlAggregateIntervalSec: instance.sqlAggregateIntervalSec,
            isActive: !instance.isActive,
          }),
        },
      );
      setMessage("수집 활성화 상태를 변경했습니다.");
      await refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "수집 설정 변경에 실패했습니다.",
      );
    }
  };

  const openSecretForm = (instance: DbInstance) => {
    setSecretTargetId(instance.id);
    setSecretForm({
      ...defaultConnectionSecretForm,
      serviceName: instance.serviceName ?? "",
    });
    setMessage(null);
    setError(null);
  };

  const saveConnectionSecret = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!secretTargetId) {
      return;
    }

    const instance = dbInstances.find((item) => item.id === secretTargetId);

    if (!instance) {
      return;
    }

    setSavingSecretId(secretTargetId);
    setMessage(null);
    setError(null);

    try {
      const result = await requestJson<{
        connectionSecretRef: string;
      }>(`/api/db-instances/${secretTargetId}/connection-secret`, {
        method: "POST",
        body: JSON.stringify({
          username: secretForm.username,
          password: secretForm.password,
          encrypt: secretForm.encrypt,
          trustServerCertificate: secretForm.trustServerCertificate,
          connectString:
            instance.dbmsType === "ORACLE" ? secretForm.connectString : undefined,
          serviceName:
            instance.dbmsType === "ORACLE" ? secretForm.serviceName : undefined,
        }),
      });

      setSecretForm(defaultConnectionSecretForm);
      setSecretTargetId(null);
      setMessage(
        `접속 Secret을 Vault에 저장했습니다. ref: ${result.connectionSecretRef}`,
      );
      await refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "접속 Secret 저장에 실패했습니다.",
      );
    } finally {
      setSavingSecretId(null);
    }
  };

  const testConnection = async (instanceId: string) => {
    setTestingId(instanceId);
    setMessage(null);
    setError(null);

    try {
      await requestJson(`/api/db-instances/${instanceId}/test-connection`, {
        method: "POST",
      });
      setMessage("DB 연결 테스트에 성공했습니다.");
      await refresh();
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "DB 연결 테스트에 실패했습니다.",
      );
      await refresh();
    } finally {
      setTestingId(null);
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="DB 인스턴스 관리"
        description="업무 시스템, DB 인스턴스, 수집 설정과 연결 테스트를 관리합니다."
        actions={<Button onClick={() => void refresh()}>새로고침</Button>}
      />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {message ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700">
            <AlertDescription className="text-emerald-700">{message}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <ErrorState
            title="요청 처리 실패"
            description={error}
            onRetry={() => void refresh()}
          />
        ) : null}
        <div className="grid gap-3 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>업무 시스템 등록</CardTitle>
              <CardDescription>
                DB 인스턴스를 업무 시스템과 담당자 기준으로 묶습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-2"
                onSubmit={handleBusinessRegisterFormSubmit}
              >
                <fieldset disabled={isRegisteringBusinessSystem} className="contents">
                <div className="space-y-1.5">
                  <Label htmlFor="business-code">업무 코드</Label>
                  <Input
                    id="business-code"
                    value={businessForm.code}
                    onChange={(event) =>
                      setBusinessForm((current) => ({
                        ...current,
                        code: event.target.value,
                      }))
                    }
                    placeholder="ERP"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="business-name">업무명</Label>
                  <Input
                    id="business-name"
                    value={businessForm.name}
                    onChange={(event) =>
                      setBusinessForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="ERP 테스트"
                  />
                </div>
                <SelectField
                  id="business-importance"
                  label="중요도"
                  value={businessForm.importance}
                  onChange={(importance) =>
                    setBusinessForm((current) => ({ ...current, importance }))
                  }
                  options={[
                    { label: "낮음", value: "LOW" },
                    { label: "보통", value: "MEDIUM" },
                    { label: "높음", value: "HIGH" },
                    { label: "중요", value: "CRITICAL" },
                  ]}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="owner-dept">담당 부서</Label>
                  <Input
                    id="owner-dept"
                    value={businessForm.ownerDept}
                    onChange={(event) =>
                      setBusinessForm((current) => ({
                        ...current,
                        ownerDept: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="owner-name">담당자</Label>
                  <Input
                    id="owner-name"
                    value={businessForm.ownerName}
                    onChange={(event) =>
                      setBusinessForm((current) => ({
                        ...current,
                        ownerName: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="owner-email">담당자 이메일</Label>
                  <Input
                    id="owner-email"
                    type="email"
                    value={businessForm.ownerEmail}
                    onChange={(event) =>
                      setBusinessForm((current) => ({
                        ...current,
                        ownerEmail: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={!canSubmitBusinessSystem || isRegisteringBusinessSystem}>
                    {isRegisteringBusinessSystem ? (
                      <>
                        <Spinner className="size-4" />
                        등록 중…
                      </>
                    ) : (
                      "업무 시스템 등록"
                    )}
                  </Button>
                </div>
                </fieldset>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>DB 인스턴스 등록</CardTitle>
              <CardDescription>
                Secret Ref는 자동 생성되며 실제 비밀번호는 Vault에만 저장합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={handleRegisterFormSubmit}>
                <fieldset disabled={isRegisteringDbInstance} className="contents">
                <SelectField
                  id="db-business-system"
                  label="업무 시스템"
                  value={dbForm.businessSystemId}
                  onChange={(businessSystemId) =>
                    setDbForm((current) => ({ ...current, businessSystemId }))
                  }
                  options={businessSystemOptions}
                  placeholder={
                    businessSystemOptions.length === 0
                      ? "먼저 업무 시스템을 등록해주세요"
                      : "업무 시스템을 선택해주세요"
                  }
                />
                <SelectField
                  id="db-dbms"
                  label="DBMS"
                  value={dbForm.dbmsType}
                  onChange={(dbmsType) => setDbForm((current) => ({ ...current, dbmsType }))}
                  options={[
                    { label: "MSSQL", value: "MSSQL" },
                    { label: "Oracle", value: "ORACLE" },
                    { label: "Azure SQL", value: "AZURE_SQL" },
                  ]}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="instance-name">인스턴스명</Label>
                  <Input
                    id="instance-name"
                    value={dbForm.instanceName}
                    onChange={(event) =>
                      setDbForm((current) => ({
                        ...current,
                        instanceName: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db-host">Host</Label>
                  <Input
                    id="db-host"
                    value={dbForm.host}
                    onChange={(event) =>
                      setDbForm((current) => ({
                        ...current,
                        host: event.target.value,
                      }))
                    }
                    placeholder="ERP_TEST_DB_HOST"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db-port">Port</Label>
                  <Input
                    id="db-port"
                    type="number"
                    value={dbForm.port}
                    onChange={(event) =>
                      setDbForm((current) => ({ ...current, port: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db-name">Database</Label>
                  <Input
                    id="db-name"
                    value={dbForm.databaseName}
                    onChange={(event) =>
                      setDbForm((current) => ({
                        ...current,
                        databaseName: event.target.value,
                      }))
                    }
                  />
                </div>
                <SelectField
                  id="db-env"
                  label="환경"
                  value={dbForm.envType}
                  onChange={(envType) => setDbForm((current) => ({ ...current, envType }))}
                  options={[
                    { label: "운영", value: "PROD" },
                    { label: "개발", value: "DEV" },
                    { label: "스테이징", value: "STG" },
                    { label: "DR", value: "DR" },
                  ]}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="collector-id">Collector ID</Label>
                  <Input
                    id="collector-id"
                    value={dbForm.collectorId}
                    onChange={(event) =>
                      setDbForm((current) => ({
                        ...current,
                        collectorId: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="collect-interval">수집 주기(초)</Label>
                  <Input
                    id="collect-interval"
                    type="number"
                    min={5}
                    max={60}
                    value={dbForm.collectIntervalSec}
                    onChange={(event) =>
                      setDbForm((current) => ({
                        ...current,
                        collectIntervalSec: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sql-interval">SQL 집계 주기(초)</Label>
                  <Input
                    id="sql-interval"
                    type="number"
                    min={10}
                    max={300}
                    value={dbForm.sqlAggregateIntervalSec}
                    onChange={(event) =>
                      setDbForm((current) => ({
                        ...current,
                        sqlAggregateIntervalSec: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="pt-6">
                  <CheckboxField
                    id="is-active"
                    label="수집 활성화"
                    checked={dbForm.isActive}
                    onChange={(isActive) =>
                      setDbForm((current) => ({
                        ...current,
                        isActive,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="registration-secret-username">DB 사용자</Label>
                  <Input
                    id="registration-secret-username"
                    value={registrationSecretForm.username}
                    onChange={(event) =>
                      setRegistrationSecretForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="registration-secret-password">DB 비밀번호</Label>
                  <Input
                    id="registration-secret-password"
                    type="password"
                    autoComplete="new-password"
                    value={registrationSecretForm.password}
                    onChange={(event) =>
                      setRegistrationSecretForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                  />
                </div>
                {dbForm.dbmsType === "ORACLE" ? (
                  <>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="registration-secret-connect-string">
                        Oracle Connect String
                      </Label>
                      <Input
                        id="registration-secret-connect-string"
                        value={registrationSecretForm.connectString}
                        onChange={(event) =>
                          setRegistrationSecretForm((current) => ({
                            ...current,
                            connectString: event.target.value,
                          }))
                        }
                        placeholder="host:1521/service"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <CheckboxField
                      id="registration-secret-encrypt"
                      label="TLS encrypt"
                      checked={registrationSecretForm.encrypt}
                      onChange={(encrypt) =>
                        setRegistrationSecretForm((current) => ({
                          ...current,
                          encrypt,
                        }))
                      }
                    />
                    <CheckboxField
                      id="registration-secret-trust-cert"
                      label="인증서 신뢰"
                      checked={registrationSecretForm.trustServerCertificate}
                      onChange={(trustServerCertificate) =>
                        setRegistrationSecretForm((current) => ({
                          ...current,
                          trustServerCertificate,
                        }))
                      }
                    />
                  </>
                )}
                <div className="md:col-span-2 space-y-2">
                  {!canTestDbInstance ? (
                    <p className="text-muted-foreground text-sm">
                      업무 시스템, 인스턴스명, Host, Port, DB 사용자, 비밀번호를 입력한
                      뒤 연결 테스트를 진행해주세요.
                    </p>
                  ) : null}
                  {registrationTestNeedsRefresh ? (
                    <p className="text-amber-700 text-sm">
                      연결 테스트 이후 입력값이 변경되었습니다. 다시 연결 테스트를
                      진행해주세요.
                    </p>
                  ) : null}
                  {registrationTest.message ? (
                    <p
                      className={
                        registrationTest.status === "success"
                          ? "text-emerald-700 text-sm"
                          : "text-destructive text-sm"
                      }
                    >
                      {registrationTest.message}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canTestDbInstance || isRegistrationBusy}
                      onClick={() => void testRegistrationConnection()}
                    >
                      {registrationTest.status === "testing" ? (
                        <>
                          <Spinner className="size-3" />
                          확인 중…
                        </>
                      ) : (
                        "연결 테스트"
                      )}
                    </Button>
                    <Button
                      type="button"
                      disabled={!canSubmitDbInstance || isRegistrationBusy}
                      onClick={requestRegisterDbInstance}
                    >
                      {isRegisteringDbInstance ? (
                        <>
                          <Spinner className="size-3" />
                          등록 중…
                        </>
                      ) : (
                        "DB 인스턴스 등록"
                      )}
                    </Button>
                  </div>
                </div>
                </fieldset>
              </form>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>업무 시스템 목록</CardTitle>
            <CardDescription>
              업무 코드는 Key 값이므로 수정할 수 없고, 나머지 운영 정보만 수정합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {editingBusinessSystemId ? (
              <form
                className="mb-4 grid gap-3 rounded-lg border p-4 md:grid-cols-2"
                onSubmit={handleBusinessEditFormSubmit}
              >
                <fieldset disabled={isUpdatingBusinessSystem} className="contents">
                <div className="space-y-1.5">
                  <Label htmlFor="business-edit-code">업무 코드</Label>
                  <Input id="business-edit-code" value={businessEditForm.code} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="business-edit-name">업무명</Label>
                  <Input
                    id="business-edit-name"
                    value={businessEditForm.name}
                    onChange={(event) =>
                      setBusinessEditForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <SelectField
                  id="business-edit-importance"
                  label="중요도"
                  value={businessEditForm.importance}
                  onChange={(importance) =>
                    setBusinessEditForm((current) => ({ ...current, importance }))
                  }
                  options={[
                    { label: "낮음", value: "LOW" },
                    { label: "보통", value: "MEDIUM" },
                    { label: "높음", value: "HIGH" },
                    { label: "중요", value: "CRITICAL" },
                  ]}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="business-edit-owner-dept">담당 부서</Label>
                  <Input
                    id="business-edit-owner-dept"
                    value={businessEditForm.ownerDept}
                    onChange={(event) =>
                      setBusinessEditForm((current) => ({
                        ...current,
                        ownerDept: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="business-edit-owner-name">담당자</Label>
                  <Input
                    id="business-edit-owner-name"
                    value={businessEditForm.ownerName}
                    onChange={(event) =>
                      setBusinessEditForm((current) => ({
                        ...current,
                        ownerName: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="business-edit-owner-email">담당자 이메일</Label>
                  <Input
                    id="business-edit-owner-email"
                    type="email"
                    value={businessEditForm.ownerEmail}
                    onChange={(event) =>
                      setBusinessEditForm((current) => ({
                        ...current,
                        ownerEmail: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex gap-2 md:col-span-2">
                  <Button type="submit" disabled={isUpdatingBusinessSystem}>
                    {isUpdatingBusinessSystem ? (
                      <>
                        <Spinner className="size-4" />
                        저장 중…
                      </>
                    ) : (
                      "수정 저장"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUpdatingBusinessSystem}
                    onClick={() => {
                      setEditingBusinessSystemId(null);
                      setBusinessEditForm(defaultBusinessSystemForm);
                    }}
                  >
                    취소
                  </Button>
                </div>
                </fieldset>
              </form>
            ) : null}
            {businessSystems.length === 0 ? (
              <EmptyState title="등록된 업무 시스템이 없습니다" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>업무 코드</TableHead>
                    <TableHead>업무명</TableHead>
                    <TableHead>중요도</TableHead>
                    <TableHead>담당</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {businessSystems.map((system) => (
                    <TableRow key={system.id}>
                      <TableCell className="font-medium">{system.code}</TableCell>
                      <TableCell>{system.name}</TableCell>
                      <TableCell>{system.importance}</TableCell>
                      <TableCell>
                        <div>{system.ownerDept ?? "-"}</div>
                        <div className="text-muted-foreground text-xs">
                          {system.ownerName ?? "-"} / {system.ownerEmail ?? "-"}
                        </div>
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => startBusinessSystemEdit(system)}
                        >
                          수정
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteConfirmBusinessSystem(system)}
                          disabled={deletingBusinessSystemId === system.id}
                        >
                          {deletingBusinessSystemId === system.id ? (
                            <>
                              <Spinner className="size-3" />
                              삭제 중
                            </>
                          ) : (
                            "삭제"
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {secretTargetId ? (
          <Card>
            <CardHeader>
              <CardTitle>접속 Secret 등록</CardTitle>
              <CardDescription>
                비밀번호는 Supabase Vault에만 저장되며 API 응답에는 secret ref만
                반환됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={saveConnectionSecret}>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>대상 인스턴스</Label>
                  <div className="text-sm font-medium">
                    {dbInstances.find((item) => item.id === secretTargetId)?.instanceName ??
                      secretTargetId}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="secret-username">DB 사용자</Label>
                  <Input
                    id="secret-username"
                    value={secretForm.username}
                    onChange={(event) =>
                      setSecretForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="secret-password">DB 비밀번호</Label>
                  <Input
                    id="secret-password"
                    type="password"
                    autoComplete="new-password"
                    value={secretForm.password}
                    onChange={(event) =>
                      setSecretForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                  />
                </div>
                {dbInstances.find((item) => item.id === secretTargetId)?.dbmsType ===
                "ORACLE" ? (
                  <>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="secret-connect-string">Connect String</Label>
                      <Input
                        id="secret-connect-string"
                        value={secretForm.connectString}
                        onChange={(event) =>
                          setSecretForm((current) => ({
                            ...current,
                            connectString: event.target.value,
                          }))
                        }
                        placeholder="host:1521/service"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="secret-service-name">Service Name</Label>
                      <Input
                        id="secret-service-name"
                        value={secretForm.serviceName}
                        onChange={(event) =>
                          setSecretForm((current) => ({
                            ...current,
                            serviceName: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <CheckboxField
                      id="secret-encrypt"
                      label="TLS encrypt"
                      checked={secretForm.encrypt}
                      onChange={(encrypt) =>
                        setSecretForm((current) => ({
                          ...current,
                          encrypt,
                        }))
                      }
                    />
                    <CheckboxField
                      id="secret-trust-cert"
                      label="인증서 신뢰"
                      checked={secretForm.trustServerCertificate}
                      onChange={(trustServerCertificate) =>
                        setSecretForm((current) => ({
                          ...current,
                          trustServerCertificate,
                        }))
                      }
                    />
                  </>
                )}
                <div className="flex gap-2 md:col-span-2">
                  <Button type="submit" disabled={savingSecretId === secretTargetId}>
                    {savingSecretId === secretTargetId ? "저장 중" : "Vault에 저장"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSecretTargetId(null);
                      setSecretForm(defaultConnectionSecretForm);
                    }}
                  >
                    취소
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>DB 인스턴스 목록</CardTitle>
            <CardDescription>
              등록된 인스턴스의 연결 상태와 수집 설정을 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {editingDbInstanceId ? (
              <form
                className="mb-4 grid gap-3 rounded-lg border p-4 md:grid-cols-2"
                onSubmit={handleDbInstanceEditFormSubmit}
              >
                <fieldset disabled={isUpdatingDbInstance} className="contents">
                <SelectField
                  id="db-edit-business-system"
                  label="업무 시스템"
                  value={dbEditForm.businessSystemId}
                  onChange={(businessSystemId) =>
                    setDbEditForm((current) => ({ ...current, businessSystemId }))
                  }
                  options={businessSystemOptions}
                />
                <SelectField
                  id="db-edit-dbms"
                  label="DBMS"
                  value={dbEditForm.dbmsType}
                  onChange={(dbmsType) =>
                    setDbEditForm((current) => ({ ...current, dbmsType }))
                  }
                  options={[
                    { label: "MSSQL", value: "MSSQL" },
                    { label: "Oracle", value: "ORACLE" },
                    { label: "Azure SQL", value: "AZURE_SQL" },
                  ]}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="db-edit-instance-name">인스턴스명</Label>
                  <Input
                    id="db-edit-instance-name"
                    value={dbEditForm.instanceName}
                    onChange={(event) =>
                      setDbEditForm((current) => ({
                        ...current,
                        instanceName: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db-edit-host">Host</Label>
                  <Input
                    id="db-edit-host"
                    value={dbEditForm.host}
                    onChange={(event) =>
                      setDbEditForm((current) => ({ ...current, host: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db-edit-port">Port</Label>
                  <Input
                    id="db-edit-port"
                    type="number"
                    value={dbEditForm.port}
                    onChange={(event) =>
                      setDbEditForm((current) => ({ ...current, port: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db-edit-name">Database</Label>
                  <Input
                    id="db-edit-name"
                    value={dbEditForm.databaseName}
                    onChange={(event) =>
                      setDbEditForm((current) => ({
                        ...current,
                        databaseName: event.target.value,
                      }))
                    }
                  />
                </div>
                <SelectField
                  id="db-edit-importance"
                  label="중요도"
                  value={dbEditForm.importance}
                  onChange={(importance) =>
                    setDbEditForm((current) => ({ ...current, importance }))
                  }
                  options={[
                    { label: "낮음", value: "LOW" },
                    { label: "보통", value: "MEDIUM" },
                    { label: "높음", value: "HIGH" },
                    { label: "중요", value: "CRITICAL" },
                  ]}
                />
                <SelectField
                  id="db-edit-env"
                  label="환경"
                  value={dbEditForm.envType}
                  onChange={(envType) =>
                    setDbEditForm((current) => ({ ...current, envType }))
                  }
                  options={[
                    { label: "운영", value: "PROD" },
                    { label: "개발", value: "DEV" },
                    { label: "스테이징", value: "STG" },
                    { label: "DR", value: "DR" },
                  ]}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="db-edit-collector-id">Collector ID</Label>
                  <Input
                    id="db-edit-collector-id"
                    value={dbEditForm.collectorId}
                    onChange={(event) =>
                      setDbEditForm((current) => ({
                        ...current,
                        collectorId: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db-edit-collect-interval">수집 주기(초)</Label>
                  <Input
                    id="db-edit-collect-interval"
                    type="number"
                    min={5}
                    max={60}
                    value={dbEditForm.collectIntervalSec}
                    onChange={(event) =>
                      setDbEditForm((current) => ({
                        ...current,
                        collectIntervalSec: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="db-edit-sql-interval">SQL 집계 주기(초)</Label>
                  <Input
                    id="db-edit-sql-interval"
                    type="number"
                    min={10}
                    max={300}
                    value={dbEditForm.sqlAggregateIntervalSec}
                    onChange={(event) =>
                      setDbEditForm((current) => ({
                        ...current,
                        sqlAggregateIntervalSec: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="pt-6">
                  <CheckboxField
                    id="db-edit-is-active"
                    label="수집 활성화"
                    checked={dbEditForm.isActive}
                    onChange={(isActive) =>
                      setDbEditForm((current) => ({ ...current, isActive }))
                    }
                  />
                </div>
                <div className="flex gap-2 md:col-span-2">
                  <Button type="submit" disabled={!canSubmitDbInstanceEdit || isUpdatingDbInstance}>
                    {isUpdatingDbInstance ? (
                      <>
                        <Spinner className="size-4" />
                        저장 중…
                      </>
                    ) : (
                      "수정 저장"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUpdatingDbInstance}
                    onClick={() => {
                      setEditingDbInstanceId(null);
                      setDbEditForm(defaultDbInstanceForm);
                    }}
                  >
                    취소
                  </Button>
                </div>
                </fieldset>
              </form>
            ) : null}
            {loading ? (
              <LoadingSkeleton rows={5} />
            ) : dbInstances.length === 0 ? (
              <EmptyState
                title="등록된 DB 인스턴스가 없습니다"
                description="업무 시스템 등록 후 DB 인스턴스를 추가해주세요."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>인스턴스</TableHead>
                    <TableHead>DBMS</TableHead>
                    <TableHead>업무 시스템</TableHead>
                    <TableHead>수집</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dbInstances.map((instance) => {
                    const system = businessSystems.find(
                      (item) => item.id === instance.businessSystemId,
                    );

                    return (
                      <TableRow key={instance.id}>
                        <TableCell>
                          <div className="font-medium">{instance.instanceName}</div>
                          <div className="text-muted-foreground text-xs">
                            {instance.host}:{instance.port} /{" "}
                            {instance.databaseName ?? "-"}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            ref: {instance.connectionSecretRef}
                          </div>
                        </TableCell>
                        <TableCell>{instance.dbmsType}</TableCell>
                        <TableCell>{system?.name ?? "-"}</TableCell>
                        <TableCell>
                          <div>{instance.collectIntervalSec}s</div>
                          <div className="text-muted-foreground text-xs">
                            SQL {instance.sqlAggregateIntervalSec}s /{" "}
                            {instance.collectorId ?? "미할당"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {instance.lastConnectionTestStatus ? (
                            <StatusBadge
                              kind="connection"
                              value={instance.lastConnectionTestStatus}
                            />
                          ) : instance.lastCollectStatus ? (
                            <StatusBadge
                              kind="collect"
                              value={instance.lastCollectStatus}
                            />
                          ) : (
                            <span className="text-muted-foreground text-sm">미확인</span>
                          )}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startDbInstanceEdit(instance)}
                          >
                            수정
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSecretForm(instance)}
                          >
                            Secret 등록
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void updateCollectionSettings(instance)}
                          >
                            {instance.isActive ? "수집 중지" : "수집 활성화"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void testConnection(instance.id)}
                            disabled={testingId === instance.id}
                          >
                            {testingId === instance.id ? "확인 중" : "연결 테스트"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteConfirmInstance(instance)}
                            disabled={deletingDbInstanceId === instance.id}
                          >
                            {deletingDbInstanceId === instance.id ? (
                              <>
                                <Spinner className="size-3" />
                                삭제 중
                              </>
                            ) : (
                              "삭제"
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={businessRegisterConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isRegisteringBusinessSystem) {
            setBusinessRegisterConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 시스템을 등록할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-muted-foreground">
                <p>아래 정보로 업무 시스템을 등록합니다.</p>
                <ul className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs text-foreground">
                  <li>업무 코드: {businessRegisterConfirmSummary.code}</li>
                  <li>업무명: {businessRegisterConfirmSummary.name}</li>
                  <li>중요도: {businessRegisterConfirmSummary.importance}</li>
                  <li>담당 부서: {businessRegisterConfirmSummary.ownerDept}</li>
                  <li>
                    담당자: {businessRegisterConfirmSummary.ownerName} /{" "}
                    {businessRegisterConfirmSummary.ownerEmail}
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRegisteringBusinessSystem}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRegisteringBusinessSystem}
              onClick={(event) => {
                event.preventDefault();
                void confirmRegisterBusinessSystem();
              }}
            >
              {isRegisteringBusinessSystem ? (
                <>
                  <Spinner className="size-4" />
                  등록 중…
                </>
              ) : (
                "등록"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={businessUpdateConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isUpdatingBusinessSystem) {
            setBusinessUpdateConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 시스템 정보를 수정할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-muted-foreground">
                <p>아래 내용으로 업무 시스템 정보를 저장합니다.</p>
                <ul className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs text-foreground">
                  <li>업무 코드: {businessEditConfirmSummary.code}</li>
                  <li>업무명: {businessEditConfirmSummary.name}</li>
                  <li>중요도: {businessEditConfirmSummary.importance}</li>
                  <li>담당 부서: {businessEditConfirmSummary.ownerDept}</li>
                  <li>
                    담당자: {businessEditConfirmSummary.ownerName} /{" "}
                    {businessEditConfirmSummary.ownerEmail}
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingBusinessSystem}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={isUpdatingBusinessSystem}
              onClick={(event) => {
                event.preventDefault();
                void confirmUpdateBusinessSystem();
              }}
            >
              {isUpdatingBusinessSystem ? (
                <>
                  <Spinner className="size-4" />
                  저장 중…
                </>
              ) : (
                "수정"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteConfirmBusinessSystem !== null}
        onOpenChange={(open) => {
          if (!open && !deletingBusinessSystemId) {
            setDeleteConfirmBusinessSystem(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 시스템을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmBusinessSystem ? (
                <>
                  <span className="font-medium text-foreground">
                    {deleteConfirmBusinessSystem.name} ({deleteConfirmBusinessSystem.code})
                  </span>
                  을(를) 삭제합니다. 연결된 DB 인스턴스가 있으면 삭제할 수 없으며, 이 작업은
                  되돌릴 수 없습니다.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusinessSystemId !== null}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingBusinessSystemId !== null}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteBusinessSystem();
              }}
            >
              {deletingBusinessSystemId ? (
                <>
                  <Spinner className="size-4" />
                  삭제 중…
                </>
              ) : (
                "삭제"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dbEditConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isUpdatingDbInstance) {
            setDbEditConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>DB 인스턴스 정보를 수정할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-muted-foreground">
                <p>아래 내용으로 DB 인스턴스 설정을 저장합니다.</p>
                <ul className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs text-foreground">
                  <li>인스턴스: {dbEditConfirmSummary.instanceName}</li>
                  <li>업무 시스템: {dbEditConfirmSummary.businessSystemName}</li>
                  <li>
                    DBMS: {dbEditConfirmSummary.dbmsType} / {dbEditConfirmSummary.host}:
                    {dbEditConfirmSummary.port}
                  </li>
                  <li>Database: {dbEditConfirmSummary.databaseName}</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingDbInstance}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={isUpdatingDbInstance}
              onClick={(event) => {
                event.preventDefault();
                void confirmUpdateDbInstance();
              }}
            >
              {isUpdatingDbInstance ? (
                <>
                  <Spinner className="size-4" />
                  저장 중…
                </>
              ) : (
                "수정"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={registerConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isRegisteringDbInstance) {
            setRegisterConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>DB 인스턴스를 등록할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-muted-foreground">
                <p>아래 정보로 DB 인스턴스를 등록하고 접속 Secret을 Vault에 저장합니다.</p>
                <ul className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs text-foreground">
                  <li>인스턴스: {registerConfirmSummary.instanceName}</li>
                  <li>업무 시스템: {registerConfirmSummary.businessSystemName}</li>
                  <li>
                    DBMS: {registerConfirmSummary.dbmsType} / {registerConfirmSummary.host}:
                    {registerConfirmSummary.port}
                  </li>
                  <li>Database: {registerConfirmSummary.databaseName}</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRegisteringDbInstance}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRegisteringDbInstance}
              onClick={(event) => {
                event.preventDefault();
                void confirmRegisterDbInstance();
              }}
            >
              {isRegisteringDbInstance ? (
                <>
                  <Spinner className="size-4" />
                  등록 중…
                </>
              ) : (
                "등록"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteConfirmInstance !== null}
        onOpenChange={(open) => {
          if (!open && !deletingDbInstanceId) {
            setDeleteConfirmInstance(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>DB 인스턴스를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmInstance ? (
                <>
                  <span className="font-medium text-foreground">
                    {deleteConfirmInstance.instanceName}
                  </span>
                  을(를) 삭제하면 수집 이력·지표·세션 데이터와 접속 Secret 설정이 함께
                  제거됩니다. 이 작업은 되돌릴 수 없습니다.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDbInstanceId !== null}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingDbInstanceId !== null}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteDbInstance();
              }}
            >
              {deletingDbInstanceId ? (
                <>
                  <Spinner className="size-4" />
                  삭제 중…
                </>
              ) : (
                "삭제"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};
