"use client";

/** 운영 포털 좌측 사이드바 메뉴 컴포넌트입니다. */

import { Pin, PinOff, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { SidebarResizeHandle } from "@/components/layout/SidebarResizeHandle";
import { usePortalSidebar } from "@/components/layout/portal-sidebar-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  PORTAL_NAV_GROUP_ICONS,
  PORTAL_NAV_ITEM_ICONS,
} from "@/lib/constants/nav-icons";
import { PORTAL_NAV_GROUPS } from "@/lib/constants/routes";
import { cn } from "@/lib/utils";

/** 부모 경로가 하위 메뉴(/dashboard/v1 등)까지 활성으로 남지 않도록 합니다. */
const EXACT_MATCH_HREFS = new Set(["/dashboard"]);

const isActiveRoute = (pathname: string, href: string) => {
  if (EXACT_MATCH_HREFS.has(href)) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
};

/**
 * 화면 구성안의 메뉴 구조를 기반으로 MVP 메뉴를 렌더링합니다.
 */
export const AppSidebar = () => {
  const pathname = usePathname();
  const { pinned, setPinned, hovering } = usePortalSidebar();

  useEffect(() => {
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      focused.closest('[data-sidebar="menu-button"]')
    ) {
      focused.blur();
    }
  }, [pathname]);

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "relative border-sidebar-border/80",
        !pinned && "z-20",
        !pinned && hovering && "shadow-lg ring-1 ring-border/50",
      )}
    >
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 rounded-lg px-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_16px_-4px] shadow-primary/50 ring-1 ring-primary/30">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate font-mono text-sm font-semibold tracking-tight">
              DB Monitoring
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              운영 통합 관제
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 group-data-[collapsible=icon]:hidden"
            aria-label={pinned ? "사이드바 고정 해제" : "사이드바 고정"}
            aria-pressed={pinned}
            onClick={() => setPinned(!pinned)}
          >
            {pinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
          </Button>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {PORTAL_NAV_GROUPS.map((group) => {
          const GroupIcon = PORTAL_NAV_GROUP_ICONS[group.label] ?? Sparkles;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>
                <GroupIcon className="size-4" />
                <span>{group.label}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = isActiveRoute(pathname, item.href);
                    const ItemIcon = PORTAL_NAV_ITEM_ICONS[item.href] ?? GroupIcon;

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild={item.mvp}
                          isActive={isActive}
                          tooltip={item.label}
                          aria-disabled={!item.mvp}
                          className={cn(
                            isActive &&
                              "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent",
                            !item.mvp &&
                              "cursor-not-allowed opacity-55 hover:bg-transparent",
                          )}
                        >
                          {item.mvp ? (
                            <Link
                              href={item.href}
                              className="flex items-center gap-2 outline-none"
                              onClick={(event) => event.currentTarget.blur()}
                            >
                              <ItemIcon className="size-4 shrink-0 opacity-80" />
                              <span className="truncate">{item.label}</span>
                            </Link>
                          ) : (
                            <span className="flex items-center gap-2">
                              <ItemIcon className="size-4 shrink-0 opacity-50" />
                              <span className="truncate">{item.label}</span>
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
      <SidebarFooter className="flex flex-col gap-2 p-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mx-auto hidden size-8 group-data-[collapsible=icon]:inline-flex"
          aria-label={pinned ? "사이드바 고정 해제" : "사이드바 고정"}
          aria-pressed={pinned}
          onClick={() => setPinned(!pinned)}
        >
          {pinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
        </Button>
        <div className="rounded-lg border border-sidebar-border/80 bg-sidebar-accent/50 p-3 text-xs group-data-[collapsible=icon]:hidden">
          <p className="font-mono font-medium text-sidebar-foreground">MVP 구축 단계</p>
          <p className="mt-1 text-sidebar-foreground/65">
            {pinned ? "고정됨 · 우측 가장자리로 너비 조절" : "마우스를 올리면 메뉴가 펼쳐집니다"}
          </p>
        </div>
      </SidebarFooter>
      <SidebarResizeHandle />
    </Sidebar>
  );
};
