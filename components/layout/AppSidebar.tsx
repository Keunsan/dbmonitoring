"use client";

/** 운영 포털 좌측 사이드바 메뉴 컴포넌트입니다. */

import {
  Activity,
  Bell,
  Database,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { PORTAL_NAV_GROUPS } from "@/lib/constants/routes";
import { cn } from "@/lib/utils";

const NAV_GROUP_ICONS: Record<string, LucideIcon> = {
  대시보드: LayoutDashboard,
  "실시간 모니터링": Activity,
  "성능 분석": Database,
  "알림 및 이슈": Bell,
  "시스템 관리": Settings,
};

const isActiveRoute = (pathname: string, href: string) => {
  return pathname === href || pathname.startsWith(`${href}/`);
};

/**
 * 화면 구성안의 메뉴 구조를 기반으로 MVP 메뉴를 렌더링합니다.
 */
export const AppSidebar = () => {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border/80">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 rounded-lg px-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_16px_-4px] shadow-primary/50 ring-1 ring-primary/30">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate font-mono text-sm font-semibold tracking-tight">
              DB Monitoring
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              운영 통합 관제
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {PORTAL_NAV_GROUPS.map((group) => {
          const Icon = NAV_GROUP_ICONS[group.label] ?? LayoutDashboard;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>
                <Icon className="size-4" />
                <span>{group.label}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = isActiveRoute(pathname, item.href);

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild={item.mvp}
                          isActive={isActive}
                          tooltip={item.label}
                          aria-disabled={!item.mvp}
                          className={cn(
                            isActive &&
                              "shadow-[0_0_14px_-5px] shadow-primary/45 ring-1 ring-primary/20",
                            !item.mvp &&
                              "cursor-not-allowed opacity-55 hover:bg-transparent",
                          )}
                        >
                          {item.mvp ? (
                            <Link href={item.href}>
                              <span>{item.label}</span>
                            </Link>
                          ) : (
                            <span>
                              <span>{item.label}</span>
                              <Badge
                                variant="outline"
                                className="ml-auto group-data-[collapsible=icon]:hidden"
                              >
                                후속
                              </Badge>
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <div className="rounded-lg border border-sidebar-border/80 bg-sidebar-accent/50 p-3 text-xs group-data-[collapsible=icon]:hidden">
          <p className="font-mono font-medium text-sidebar-foreground">MVP 구축 단계</p>
          <p className="mt-1 text-sidebar-foreground/65">
            실시간 MSSQL 모니터링 구축 중
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
