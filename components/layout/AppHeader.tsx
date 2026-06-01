"use client";

/** 운영 포털 상단 헤더 컴포넌트입니다. */

import { Bell, CircleUserRound, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * 사이드바 토글, 검색 진입점, 알림/사용자 상태를 표시합니다.
 */
export const AppHeader = () => {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-medium tracking-tight text-foreground">
          통합 DB 모니터링 운영 포털
        </p>
        <p className="text-muted-foreground hidden text-xs sm:block">
          실시간 상태, 알림, 운영 설정을 한 곳에서 관리합니다.
        </p>
      </div>
      <Button variant="outline" size="sm" className="hidden gap-2 md:inline-flex">
        <Search className="size-4" />
        검색
      </Button>
      <Button variant="ghost" size="icon" aria-label="알림 보기">
        <Bell className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="사용자 메뉴">
        <CircleUserRound className="size-4" />
      </Button>
    </header>
  );
};
