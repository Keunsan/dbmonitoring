/** 포털 페이지 상단 제목과 보조 액션을 표시하는 컴포넌트입니다. */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** true이면 설명을 제목 오른쪽에 작은 글씨로 표시합니다. */
  descriptionBesideTitle?: boolean;
  actions?: ReactNode;
  /** actions 아래 우측에 표시하는 보조 영역(수집 기준 시각 등) */
  actionsMeta?: ReactNode;
  className?: string;
};

/**
 * 각 업무 화면의 제목, 설명, 우측 액션 영역을 일관된 간격으로 렌더링합니다.
 */
export const PageHeader = ({
  title,
  description,
  descriptionBesideTitle = false,
  actions,
  actionsMeta,
  className,
}: PageHeaderProps) => {
  const hasStackedActions = Boolean(actions && actionsMeta);

  return (
    <div
      className={cn(
        "border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70",
        hasStackedActions
          ? "grid gap-x-4 gap-y-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[2rem_auto] lg:items-center"
          : "flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div
        className={cn(
          "min-w-0",
          hasStackedActions
            ? "flex h-8 items-center lg:row-start-1 lg:col-start-1"
            : "flex-1",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="shrink-0 font-mono text-xl font-semibold leading-8 tracking-tight">
            {title}
          </h1>
          {description && descriptionBesideTitle ? (
            <p className="text-muted-foreground min-w-0 text-xs leading-8">{description}</p>
          ) : null}
        </div>
        {description && !descriptionBesideTitle ? (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-end gap-2",
            hasStackedActions
              ? "h-8 lg:row-start-1 lg:col-start-2 lg:self-center"
              : "items-end",
          )}
        >
          {actions}
        </div>
      ) : null}
      {actionsMeta ? (
        <div
          className={cn(
            "flex justify-end",
            hasStackedActions ? "lg:row-start-2 lg:col-start-2" : "mt-1",
          )}
        >
          {actionsMeta}
        </div>
      ) : null}
    </div>
  );
};
