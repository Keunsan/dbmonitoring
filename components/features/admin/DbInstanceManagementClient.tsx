"use client";

/** DB 인스턴스 관리 화면의 등록·조회·연결 테스트 클라이언트 컴포넌트입니다. */

import { useMemo, useState } from "react";
import { Cog, XIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout";
import { EmptyState, LoadingSkeleton, StatusBadge } from "@/components/shared";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
  envType: "PROD",
  collectorType: "AGENTLESS",
  collectorId: "local-dev-collector",
  collectIntervalSec: "60",
  sqlAggregateIntervalSec: "60",
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

const IMPORTANCE_OPTIONS = [
  { label: "낮음", value: "LOW" },
  { label: "보통", value: "MEDIUM" },
  { label: "높음", value: "HIGH" },
  { label: "중요", value: "CRITICAL" },
];

/** 중요도 코드를 화면 표시명으로 변환합니다. */
const formatImportanceLabel = (importance: string) =>
  IMPORTANCE_OPTIONS.find((option) => option.value === importance)?.label ?? importance;

/** 확인 다이얼로그 기본 너비(max-w-xs/sm) 대비 약 15% 넓게 표시합니다. */
const CONFIRM_ALERT_DIALOG_CLASS =
  "data-[size=default]:max-w-[23rem] data-[size=default]:sm:max-w-[27.6rem]";

/** 목록 패널 내 테이블 헤더 고정 스타일입니다. */
const STICKY_TABLE_HEADER_CLASS =
  "sticky top-0 z-10 bg-card [&_th]:bg-card [&_tr]:border-b [&_tr]:shadow-sm";

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
  const [testingId, setTestingId] = useState<string | null>(null);
  const [registrationSecretForm, setRegistrationSecretForm] =
    useState<ConnectionSecretForm>(defaultConnectionSecretForm);
  const [registrationTest, setRegistrationTest] =
    useState<RegistrationConnectionTestState>(defaultRegistrationTestState);
  const [dbEditSecretForm, setDbEditSecretForm] = useState<ConnectionSecretForm>(
    defaultConnectionSecretForm,
  );
  const [isEditTesting, setIsEditTesting] = useState(false);
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
  const [selectedBusinessSystemId, setSelectedBusinessSystemId] = useState<string | null>(
    null,
  );
  const [selectedDbInstanceId, setSelectedDbInstanceId] = useState<string | null>(null);
  const [businessManagementDialogOpen, setBusinessManagementDialogOpen] = useState(false);
  const [businessRegisterDialogOpen, setBusinessRegisterDialogOpen] = useState(false);
  const [businessEditDialogOpen, setBusinessEditDialogOpen] = useState(false);
  const [dbRegisterDialogOpen, setDbRegisterDialogOpen] = useState(false);
  const [dbEditDialogOpen, setDbEditDialogOpen] = useState(false);

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
      username: registrationSecretForm.username.trim(),
      businessSystemName: businessSystem?.name ?? "미지정",
    };
  }, [businessSystems, dbForm, registrationSecretForm.username]);

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
      isActive: dbEditForm.isActive,
      willUpdateConnectionSecret: Boolean(dbEditSecretForm.password.trim()),
      connectionUsername: dbEditSecretForm.username.trim() || "-",
    };
  }, [businessSystems, dbEditForm, dbEditSecretForm.password, dbEditSecretForm.username]);

  const canSubmitDbInstanceEdit = Boolean(
    dbEditForm.businessSystemId &&
      dbEditForm.instanceName.trim() &&
      dbEditForm.host.trim() &&
      dbEditForm.port.trim(),
  );

  const dbEditInstancePayload = useMemo(
    () => toDbInstancePayload(dbEditForm),
    [dbEditForm],
  );

  const dbEditCredentialPayload = useMemo(
    () => ({
      username: dbEditSecretForm.username,
      password: dbEditSecretForm.password,
      encrypt: dbEditSecretForm.encrypt,
      trustServerCertificate: dbEditSecretForm.trustServerCertificate,
      connectString:
        dbEditForm.dbmsType === "ORACLE" ? dbEditSecretForm.connectString : undefined,
      serviceName:
        dbEditForm.dbmsType === "ORACLE"
          ? dbEditSecretForm.serviceName || dbEditForm.databaseName
          : undefined,
    }),
    [dbEditForm.databaseName, dbEditForm.dbmsType, dbEditSecretForm],
  );

  const hasEditConnectionPassword = Boolean(dbEditSecretForm.password.trim());
  const canTestEditWithFormCredentials = Boolean(
    hasEditConnectionPassword &&
      dbEditSecretForm.username.trim() &&
      (dbEditForm.dbmsType !== "ORACLE" ||
        dbEditSecretForm.connectString.trim() ||
        dbEditForm.databaseName.trim()),
  );
  const canTestEditConnection = Boolean(
    editingDbInstanceId &&
      canSubmitDbInstanceEdit &&
      (canTestEditWithFormCredentials || !hasEditConnectionPassword),
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

  /** 오류 토스트를 하단에 잠시 표시합니다. */
  const showErrorToast = (description: string, title = "요청 처리 실패") => {
    toast.error(title, {
      description,
      duration: 4000,
      classNames: {
        toast: "!border-destructive/40 !bg-destructive/10 !text-destructive",
        title: "!text-destructive font-medium",
        description: "!text-destructive/90",
      },
    });
  };

  const refresh = async () => {
    setLoading(true);
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
      showErrorToast(
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
    if (!canSubmitBusinessSystem) {
      showErrorToast("업무 코드와 업무명을 입력해주세요.");
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
    try {
      await requestJson<BusinessSystem>("/api/business-systems", {
        method: "POST",
        body: JSON.stringify(businessForm),
      });
      setBusinessRegisterConfirmOpen(false);
      setBusinessRegisterDialogOpen(false);
      setBusinessForm(defaultBusinessSystemForm);
      setMessage(
        `"${businessRegisterConfirmSummary.name}" 업무 시스템을 등록했습니다.`,
      );
      await refresh();
    } catch (submitError) {
      showErrorToast(
        resolveUserFacingErrorMessage(
          submitError,
          "업무 시스템을 등록하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.",
        ),
      );
    } finally {
      setIsRegisteringBusinessSystem(false);
    }
  };

  const openBusinessRegisterDialog = () => {
    setBusinessForm(defaultBusinessSystemForm);
    setBusinessRegisterDialogOpen(true);
  };

  const startBusinessSystemEdit = (system: BusinessSystem) => {
    setEditingBusinessSystemId(system.id);
    setSelectedBusinessSystemId(system.id);
    setBusinessEditForm(toBusinessSystemForm(system));
    setBusinessEditDialogOpen(true);
    setMessage(null);
  };

  const requestBusinessEditFromToolbar = () => {
    const system = businessSystems.find((item) => item.id === selectedBusinessSystemId);

    if (!system) {
      showErrorToast("수정할 업무 시스템을 목록에서 선택해주세요.");
      return;
    }

    startBusinessSystemEdit(system);
  };

  const requestBusinessDeleteFromToolbar = () => {
    const system = businessSystems.find((item) => item.id === selectedBusinessSystemId);

    if (!system) {
      showErrorToast("삭제할 업무 시스템을 목록에서 선택해주세요.");
      return;
    }

    setDeleteConfirmBusinessSystem(system);
  };

  const handleBusinessEditFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingBusinessSystemId) {
      return;
    }

    setMessage(null);
    if (!businessEditForm.name.trim()) {
      showErrorToast("업무명을 입력해주세요.");
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
    try {
      await requestJson<BusinessSystem>(`/api/business-systems/${editingBusinessSystemId}`, {
        method: "PATCH",
        body: JSON.stringify(businessEditForm),
      });
      setBusinessUpdateConfirmOpen(false);
      setBusinessEditDialogOpen(false);
      setEditingBusinessSystemId(null);
      setBusinessEditForm(defaultBusinessSystemForm);
      setMessage(`"${businessEditConfirmSummary.name}" 업무 시스템 정보를 수정했습니다.`);
      await refresh();
    } catch (updateError) {
      showErrorToast(
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
      showErrorToast(
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
    if (!canSubmitDbInstance) {
      showErrorToast("DB 연결 테스트에 성공한 후 DB 인스턴스를 등록할 수 있습니다.");
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
      setDbRegisterDialogOpen(false);
      setDbForm((current) => ({
        ...defaultDbInstanceForm,
        businessSystemId: current.businessSystemId,
      }));
      setRegistrationSecretForm(defaultConnectionSecretForm);
      setRegistrationTest(defaultRegistrationTestState);
      setMessage(`"${registerConfirmSummary.instanceName}" DB 인스턴스를 등록했습니다.`);
      await refresh();
    } catch (submitError) {
      showErrorToast(
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
      toast.success("등록 전 DB 연결 테스트에 성공했습니다.", { duration: 3000 });
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
      showErrorToast(testMessage);
    }
  };

  const openDbRegisterDialog = () => {
    setDbForm((current) => ({
      ...defaultDbInstanceForm,
      businessSystemId: current.businessSystemId || businessSystems[0]?.id || "",
    }));
    setRegistrationSecretForm(defaultConnectionSecretForm);
    setRegistrationTest(defaultRegistrationTestState);
    setDbRegisterDialogOpen(true);
  };

  const startDbInstanceEdit = (instance: DbInstance) => {
    setEditingDbInstanceId(instance.id);
    setSelectedDbInstanceId(instance.id);
    setDbEditForm(toDbInstanceForm(instance));
    setDbEditSecretForm({
      ...defaultConnectionSecretForm,
      username: instance.connectionUsername ?? "",
      serviceName: instance.serviceName ?? "",
    });
    setIsEditTesting(false);
    setDbEditDialogOpen(true);
    setMessage(null);
  };

  const requestDbInstanceEditFromToolbar = () => {
    const instance = dbInstances.find((item) => item.id === selectedDbInstanceId);

    if (!instance) {
      showErrorToast("수정할 DB 인스턴스를 목록에서 선택해주세요.");
      return;
    }

    startDbInstanceEdit(instance);
  };

  const requestDbInstanceDeleteFromToolbar = () => {
    const instance = dbInstances.find((item) => item.id === selectedDbInstanceId);

    if (!instance) {
      showErrorToast("삭제할 DB 인스턴스를 목록에서 선택해주세요.");
      return;
    }

    setDeleteConfirmInstance(instance);
  };

  const requestTestConnectionFromToolbar = () => {
    const instance = dbInstances.find((item) => item.id === selectedDbInstanceId);

    if (!instance) {
      showErrorToast("연결 테스트할 DB 인스턴스를 목록에서 선택해주세요.");
      return;
    }

    void testConnection(instance.id);
  };

  const handleDbInstanceEditFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingDbInstanceId) {
      return;
    }

    setMessage(null);
    if (!canSubmitDbInstanceEdit) {
      showErrorToast("업무 시스템, 인스턴스명, Host, Port를 입력해주세요.");
      return;
    }

    if (dbEditSecretForm.password.trim() && !dbEditSecretForm.username.trim()) {
      showErrorToast("접속 정보를 변경하려면 DB 사용자를 입력해주세요.");
      return;
    }

    setDbEditConfirmOpen(true);
  };

  /** 수정 다이얼로그에서 현재 입력값 또는 저장된 접속 정보로 연결을 테스트합니다. */
  const testEditConnection = async () => {
    if (!editingDbInstanceId || !canTestEditConnection || isEditTesting) {
      return;
    }

    setIsEditTesting(true);
    setMessage(null);
    try {
      if (hasEditConnectionPassword) {
        await requestJson("/api/db-instances/test-connection", {
          method: "POST",
          body: JSON.stringify({
            instance: dbEditInstancePayload,
            credential: dbEditCredentialPayload,
          }),
        });
      } else {
        await requestJson(`/api/db-instances/${editingDbInstanceId}/test-connection`, {
          method: "POST",
        });
      }

      toast.success("DB 연결 테스트에 성공했습니다.", { duration: 3000 });
      await refresh();
    } catch (testError) {
      showErrorToast(
        resolveUserFacingErrorMessage(
          testError,
          hasEditConnectionPassword
            ? "입력한 접속 정보로 연결 테스트에 실패했습니다. Host·Port·계정 정보를 확인해주세요."
            : "DB 연결 테스트에 실패했습니다.",
        ),
      );
      await refresh();
    } finally {
      setIsEditTesting(false);
    }
  };

  /** 확인 후 DB 인스턴스 정보를 수정합니다. */
  const confirmUpdateDbInstance = async () => {
    if (!editingDbInstanceId || !canSubmitDbInstanceEdit || isUpdatingDbInstance) {
      return;
    }

    setIsUpdatingDbInstance(true);
    setMessage(null);
    try {
      await requestJson<DbInstance>(`/api/db-instances/${editingDbInstanceId}`, {
        method: "PATCH",
        body: JSON.stringify(toDbInstancePayload(dbEditForm)),
      });
      if (dbEditSecretForm.password.trim()) {
        await requestJson(`/api/db-instances/${editingDbInstanceId}/connection-secret`, {
          method: "POST",
          body: JSON.stringify({
            username: dbEditSecretForm.username,
            password: dbEditSecretForm.password,
            encrypt: dbEditSecretForm.encrypt,
            trustServerCertificate: dbEditSecretForm.trustServerCertificate,
            connectString:
              dbEditForm.dbmsType === "ORACLE" ? dbEditSecretForm.connectString : undefined,
            serviceName:
              dbEditForm.dbmsType === "ORACLE" ? dbEditSecretForm.serviceName : undefined,
          }),
        });
      }

      setDbEditConfirmOpen(false);
      setDbEditDialogOpen(false);
      setEditingDbInstanceId(null);
      setDbEditForm(defaultDbInstanceForm);
      setDbEditSecretForm(defaultConnectionSecretForm);
      toast.success(`"${dbEditConfirmSummary.instanceName}" DB 인스턴스 정보를 수정했습니다.`, {
        duration: 3000,
      });
      await refresh();
    } catch (updateError) {
      showErrorToast(
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
    try {
      await requestJson(`/api/db-instances/${target.id}`, { method: "DELETE" });
      if (editingDbInstanceId === target.id) {
        setEditingDbInstanceId(null);
        setDbEditForm(defaultDbInstanceForm);
      }
      setDeleteConfirmInstance(null);
      setMessage(`"${target.instanceName}" DB 인스턴스를 삭제했습니다.`);
      await refresh();
    } catch (deleteError) {
      showErrorToast(
        resolveUserFacingErrorMessage(
          deleteError,
          "DB 인스턴스를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.",
        ),
      );
    } finally {
      setDeletingDbInstanceId(null);
    }
  };

  const testConnection = async (instanceId: string) => {
    setTestingId(instanceId);
    setMessage(null);
    try {
      await requestJson(`/api/db-instances/${instanceId}/test-connection`, {
        method: "POST",
      });
      toast.success("DB 연결 테스트에 성공했습니다.", { duration: 3000 });
      await refresh();
    } catch (testError) {
      showErrorToast(
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
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        {message ? (
          <Alert className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
            <AlertDescription className="text-emerald-700">{message}</AlertDescription>
          </Alert>
        ) : null}
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">DB 인스턴스</CardTitle>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setBusinessManagementDialogOpen(true)}
                  >
                    업무시스템 관리
                  </Button>
                  <Button type="button" size="sm" onClick={openDbRegisterDialog}>
                    등록
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={requestDbInstanceEditFromToolbar}
                  >
                    수정
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={requestTestConnectionFromToolbar}
                    disabled={
                      testingId !== null && testingId === selectedDbInstanceId
                    }
                  >
                    {testingId !== null && testingId === selectedDbInstanceId ? (
                      <span className="inline-flex items-center gap-1.5">
                        확인 중
                        <Cog className="size-3.5 shrink-0 animate-spin" aria-hidden />
                      </span>
                    ) : (
                      "연결 테스트"
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={requestDbInstanceDeleteFromToolbar}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3">
              <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                {loading ? (
                  <LoadingSkeleton rows={5} />
                ) : dbInstances.length === 0 ? (
                  <EmptyState
                    title="등록된 DB 인스턴스가 없습니다"
                    description="업무 시스템 등록 후 DB 인스턴스를 추가해주세요."
                  />
                ) : (
                  <Table>
                    <TableHeader className={STICKY_TABLE_HEADER_CLASS}>
                      <TableRow>
                        <TableHead>인스턴스</TableHead>
                        <TableHead>DBMS</TableHead>
                        <TableHead>업무 시스템</TableHead>
                        <TableHead>수집</TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dbInstances.map((instance) => {
                        const system = businessSystems.find(
                          (item) => item.id === instance.businessSystemId,
                        );

                        return (
                          <TableRow
                            key={instance.id}
                            className="cursor-pointer"
                            data-state={selectedDbInstanceId === instance.id ? "selected" : undefined}
                            onClick={() => setSelectedDbInstanceId(instance.id)}
                          >
                            <TableCell>
                              <div className="font-medium">{instance.instanceName}</div>
                              <div className="text-muted-foreground text-xs">
                                {instance.host}:{instance.port} / {instance.databaseName ?? "-"} /{" "}
                                {instance.connectionUsername ?? "-"}
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
                                <StatusBadge kind="collect" value={instance.lastCollectStatus} />
                              ) : (
                                <span className="text-muted-foreground text-sm">미확인</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
        </Card>
      </div>

      <Dialog
        open={businessManagementDialogOpen}
        onOpenChange={setBusinessManagementDialogOpen}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[85vh] flex-col gap-2 sm:max-w-2xl"
        >
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>업무 시스템 관리</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm" className="size-6 shrink-0">
                <XIcon className="size-3.5" />
                <span className="sr-only">닫기</span>
              </Button>
            </DialogClose>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            {businessSystems.length === 0 ? (
              <EmptyState title="등록된 업무 시스템이 없습니다" />
            ) : (
              <Table>
                <TableHeader className={STICKY_TABLE_HEADER_CLASS}>
                  <TableRow>
                    <TableHead>업무 코드</TableHead>
                    <TableHead>업무명</TableHead>
                    <TableHead>중요도</TableHead>
                    <TableHead>담당</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {businessSystems.map((system) => (
                    <TableRow
                      key={system.id}
                      className="cursor-pointer"
                      data-state={
                        selectedBusinessSystemId === system.id ? "selected" : undefined
                      }
                      onClick={() => setSelectedBusinessSystemId(system.id)}
                    >
                      <TableCell className="font-medium">{system.code}</TableCell>
                      <TableCell>{system.name}</TableCell>
                      <TableCell>{formatImportanceLabel(system.importance)}</TableCell>
                      <TableCell>
                        <div>{system.ownerDept ?? "-"}</div>
                        <div className="text-muted-foreground text-xs">
                          {system.ownerName ?? "-"} / {system.ownerEmail ?? "-"}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="flex items-center justify-end gap-1">
            <Button type="button" size="sm" onClick={openBusinessRegisterDialog}>
              등록
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={requestBusinessEditFromToolbar}
            >
              수정
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={requestBusinessDeleteFromToolbar}
            >
              삭제
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={businessRegisterDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isRegisteringBusinessSystem) {
            setBusinessRegisterDialogOpen(false);
            setBusinessForm(defaultBusinessSystemForm);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>업무 시스템 등록</DialogTitle>
            <DialogDescription>
              DB 인스턴스를 업무 시스템과 담당자 기준으로 묶습니다.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleBusinessRegisterFormSubmit}>
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
                onChange={(importance) => setBusinessForm((current) => ({ ...current, importance }))}
                options={IMPORTANCE_OPTIONS}
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
              <DialogFooter className="md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isRegisteringBusinessSystem}
                  onClick={() => {
                    setBusinessRegisterDialogOpen(false);
                    setBusinessForm(defaultBusinessSystemForm);
                  }}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmitBusinessSystem || isRegisteringBusinessSystem}
                >
                  {isRegisteringBusinessSystem ? (
                    <>
                      <Spinner className="size-4" />
                      등록 중…
                    </>
                  ) : (
                    "업무 시스템 등록"
                  )}
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={businessEditDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isUpdatingBusinessSystem) {
            setBusinessEditDialogOpen(false);
            setEditingBusinessSystemId(null);
            setBusinessEditForm(defaultBusinessSystemForm);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>업무 시스템 수정</DialogTitle>
            <DialogDescription>선택한 업무 시스템의 운영 정보를 수정합니다.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleBusinessEditFormSubmit}>
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
                options={IMPORTANCE_OPTIONS}
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
              <DialogFooter className="md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUpdatingBusinessSystem}
                  onClick={() => {
                    setBusinessEditDialogOpen(false);
                    setEditingBusinessSystemId(null);
                    setBusinessEditForm(defaultBusinessSystemForm);
                  }}
                >
                  취소
                </Button>
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
              </DialogFooter>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dbRegisterDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isRegisteringDbInstance) {
            setDbRegisterDialogOpen(false);
            setRegistrationTest(defaultRegistrationTestState);
            setRegistrationSecretForm(defaultConnectionSecretForm);
            setDbForm((current) => ({
              ...defaultDbInstanceForm,
              businessSystemId: current.businessSystemId || businessSystems[0]?.id || "",
            }));
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>DB 인스턴스 등록</DialogTitle>
            <DialogDescription>
              접속 정보는 MSSQL DB에 암호화되어 저장됩니다.
            </DialogDescription>
          </DialogHeader>
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
              <div className="space-y-2 md:col-span-2">
                {!canTestDbInstance ? (
                  <p className="text-muted-foreground text-sm">
                    업무 시스템, 인스턴스명, Host, Port, DB 사용자, 비밀번호를 입력한 뒤
                    연결 테스트를 진행해주세요.
                  </p>
                ) : null}
                {registrationTestNeedsRefresh ? (
                  <p className="text-amber-700 text-sm">
                    연결 테스트 이후 입력값이 변경되었습니다. 다시 연결 테스트를 진행해주세요.
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
                <DialogFooter className="justify-start md:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isRegistrationBusy}
                    onClick={() => {
                      setDbRegisterDialogOpen(false);
                      setRegistrationTest(defaultRegistrationTestState);
                      setRegistrationSecretForm(defaultConnectionSecretForm);
                    }}
                  >
                    취소
                  </Button>
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
                </DialogFooter>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dbEditDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isUpdatingDbInstance) {
            setDbEditDialogOpen(false);
            setEditingDbInstanceId(null);
            setDbEditForm(defaultDbInstanceForm);
            setDbEditSecretForm(defaultConnectionSecretForm);
            setIsEditTesting(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>DB 인스턴스 수정</DialogTitle>
            <DialogDescription>
              인스턴스 설정, 수집 활성화, 접속 정보를 함께 수정합니다. 비밀번호는 변경할 때만
              입력하세요.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleDbInstanceEditFormSubmit}>
            <fieldset disabled={isUpdatingDbInstance || isEditTesting} className="contents">
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
                onChange={(dbmsType) => setDbEditForm((current) => ({ ...current, dbmsType }))}
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
                onChange={(importance) => setDbEditForm((current) => ({ ...current, importance }))}
                options={IMPORTANCE_OPTIONS}
              />
              <SelectField
                id="db-edit-env"
                label="환경"
                value={dbEditForm.envType}
                onChange={(envType) => setDbEditForm((current) => ({ ...current, envType }))}
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
                  onChange={(isActive) => setDbEditForm((current) => ({ ...current, isActive }))}
                />
              </div>
              <div className="md:col-span-2 border-t pt-3">
                <p className="text-sm font-medium">접속 정보</p>
                <p className="text-muted-foreground text-xs">
                  비밀번호를 입력하면 접속 정보가 함께 저장됩니다.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="db-edit-secret-username">DB 사용자</Label>
                <Input
                  id="db-edit-secret-username"
                  value={dbEditSecretForm.username}
                  onChange={(event) =>
                    setDbEditSecretForm((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="db-edit-secret-password">DB 비밀번호</Label>
                <Input
                  id="db-edit-secret-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="변경 시에만 입력"
                  value={dbEditSecretForm.password}
                  onChange={(event) =>
                    setDbEditSecretForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                />
              </div>
              {dbEditForm.dbmsType === "ORACLE" ? (
                <>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="db-edit-secret-connect-string">Connect String</Label>
                    <Input
                      id="db-edit-secret-connect-string"
                      value={dbEditSecretForm.connectString}
                      onChange={(event) =>
                        setDbEditSecretForm((current) => ({
                          ...current,
                          connectString: event.target.value,
                        }))
                      }
                      placeholder="host:1521/service"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="db-edit-secret-service-name">Service Name</Label>
                    <Input
                      id="db-edit-secret-service-name"
                      value={dbEditSecretForm.serviceName}
                      onChange={(event) =>
                        setDbEditSecretForm((current) => ({
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
                    id="db-edit-secret-encrypt"
                    label="TLS encrypt"
                    checked={dbEditSecretForm.encrypt}
                    onChange={(encrypt) =>
                      setDbEditSecretForm((current) => ({
                        ...current,
                        encrypt,
                      }))
                    }
                  />
                  <CheckboxField
                    id="db-edit-secret-trust-cert"
                    label="인증서 신뢰"
                    checked={dbEditSecretForm.trustServerCertificate}
                    onChange={(trustServerCertificate) =>
                      setDbEditSecretForm((current) => ({
                        ...current,
                        trustServerCertificate,
                      }))
                    }
                  />
                </>
              )}
              <DialogFooter className="md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUpdatingDbInstance || isEditTesting}
                  onClick={() => {
                    setDbEditDialogOpen(false);
                    setEditingDbInstanceId(null);
                    setDbEditForm(defaultDbInstanceForm);
                    setDbEditSecretForm(defaultConnectionSecretForm);
                    setIsEditTesting(false);
                  }}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canTestEditConnection || isUpdatingDbInstance || isEditTesting}
                  onClick={() => void testEditConnection()}
                >
                  {isEditTesting ? (
                    <span className="inline-flex items-center gap-1.5">
                      확인 중
                      <Cog className="size-3.5 shrink-0 animate-spin" aria-hidden />
                    </span>
                  ) : (
                    "연결 테스트"
                  )}
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmitDbInstanceEdit || isUpdatingDbInstance || isEditTesting}
                >
                  {isUpdatingDbInstance ? (
                    <>
                      <Spinner className="size-4" />
                      저장 중…
                    </>
                  ) : (
                    "수정 저장"
                  )}
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={businessRegisterConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isRegisteringBusinessSystem) {
            setBusinessRegisterConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent className={CONFIRM_ALERT_DIALOG_CLASS}>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 시스템을 등록할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="w-full space-y-2 text-left text-sm text-muted-foreground">
                <p>아래 정보로 업무 시스템을 등록합니다.</p>
                <ul className="w-full space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs text-foreground">
                  <li>업무 코드: {businessRegisterConfirmSummary.code}</li>
                  <li>업무명: {businessRegisterConfirmSummary.name}</li>
                  <li>
                    중요도: {formatImportanceLabel(businessRegisterConfirmSummary.importance)}
                  </li>
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
        <AlertDialogContent className={CONFIRM_ALERT_DIALOG_CLASS}>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 시스템 정보를 수정할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="w-full space-y-2 text-left text-sm text-muted-foreground">
                <p>아래 내용으로 업무 시스템 정보를 저장합니다.</p>
                <ul className="w-full space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs text-foreground">
                  <li>업무 코드: {businessEditConfirmSummary.code}</li>
                  <li>업무명: {businessEditConfirmSummary.name}</li>
                  <li>중요도: {formatImportanceLabel(businessEditConfirmSummary.importance)}</li>
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
        <AlertDialogContent className={CONFIRM_ALERT_DIALOG_CLASS}>
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
        <AlertDialogContent className={CONFIRM_ALERT_DIALOG_CLASS}>
          <AlertDialogHeader>
            <AlertDialogTitle>DB 인스턴스 정보를 수정할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="w-full space-y-2 text-left text-sm text-muted-foreground">
                <p>아래 내용으로 DB 인스턴스 설정을 저장합니다.</p>
                <ul className="w-full space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs text-foreground">
                  <li>인스턴스: {dbEditConfirmSummary.instanceName}</li>
                  <li>업무 시스템: {dbEditConfirmSummary.businessSystemName}</li>
                  <li>
                    DBMS: {dbEditConfirmSummary.dbmsType} / {dbEditConfirmSummary.host}:
                    {dbEditConfirmSummary.port}
                  </li>
                  <li>Database: {dbEditConfirmSummary.databaseName}</li>
                  <li>
                    수집: {dbEditConfirmSummary.isActive ? "활성화" : "중지"}
                  </li>
                  {dbEditConfirmSummary.willUpdateConnectionSecret ? (
                    <li>접속 정보: {dbEditConfirmSummary.connectionUsername} (변경)</li>
                  ) : (
                    <li>접속 정보: 변경 없음</li>
                  )}
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
        <AlertDialogContent className={CONFIRM_ALERT_DIALOG_CLASS}>
          <AlertDialogHeader>
            <AlertDialogTitle>DB 인스턴스를 등록할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="w-full space-y-2 text-left text-sm text-muted-foreground">
                <p>아래 정보로 DB 인스턴스를 등록하고 접속 정보를 저장합니다.</p>
                <ul className="w-full space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs text-foreground">
                  <li>인스턴스: {registerConfirmSummary.instanceName}</li>
                  <li>업무 시스템: {registerConfirmSummary.businessSystemName}</li>
                  <li>
                    DBMS: {registerConfirmSummary.dbmsType} / {registerConfirmSummary.host}:
                    {registerConfirmSummary.port}
                  </li>
                  <li>Database: {registerConfirmSummary.databaseName}</li>
                  <li>DB 사용자: {registerConfirmSummary.username}</li>
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
        <AlertDialogContent className={CONFIRM_ALERT_DIALOG_CLASS}>
          <AlertDialogHeader>
            <AlertDialogTitle>DB 인스턴스를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmInstance ? (
                <>
                  <span className="font-medium text-foreground">
                    {deleteConfirmInstance.instanceName}
                  </span>
                  을(를) 삭제하면 수집 이력·지표·세션 데이터와 접속 정보가 함께
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
