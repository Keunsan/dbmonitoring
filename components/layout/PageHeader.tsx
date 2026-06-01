/** 포털 페이지 상단 제목과 보조 액션을 표시하는 컴포넌트입니다. */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

/**
 * 각 업무 화면의 제목, 설명, 우측 액션 영역을 일관된 간격으로 렌더링합니다.
 */
export const PageHeader = ({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) => {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-border/60 bg-background/40 px-4 py-3 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-mono text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
};
