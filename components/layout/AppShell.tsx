"use client";

/** 운영 포털 전체 레이아웃을 구성하는 AppShell 컴포넌트입니다. */

import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { PortalSidebarProvider } from "@/components/layout/PortalSidebarProvider";
import { SidebarInset } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

type AppShellProps = {
  children: ReactNode;
};

/**
 * 사이드바, 헤더, 본문 영역을 하나의 운영 포털 레이아웃으로 묶습니다.
 */
export const AppShell = ({ children }: AppShellProps) => {
  return (
    <TooltipProvider>
      <PortalSidebarProvider>
        <AppSidebar />
        <SidebarInset className="max-h-svh min-h-svh overflow-hidden bg-background">
          <AppHeader />
          <div className="portal-surface flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </SidebarInset>
      </PortalSidebarProvider>
      <Toaster position="bottom-center" duration={2000} />
    </TooltipProvider>
  );
};
