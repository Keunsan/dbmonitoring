"use client";

/** 사이드바 고정·너비·호버 펼침 상태를 공유합니다. */

import { createContext, useContext } from "react";

export const SIDEBAR_PIN_STORAGE_KEY = "dbmonitoring-sidebar-pinned";
export const SIDEBAR_WIDTH_STORAGE_KEY = "dbmonitoring-sidebar-width";
export const SIDEBAR_DEFAULT_WIDTH_PX = 256;
export const SIDEBAR_MIN_WIDTH_PX = 208;
export const SIDEBAR_MAX_WIDTH_PX = 400;

export type PortalSidebarContextValue = {
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  widthPx: number;
  setWidthPx: (width: number) => void;
  hovering: boolean;
  setHovering: (hovering: boolean) => void;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
};

export const PortalSidebarContext = createContext<PortalSidebarContextValue | null>(
  null,
);

/** 포털 사이드바 레이아웃 컨텍스트를 반환합니다. */
export const usePortalSidebar = () => {
  const context = useContext(PortalSidebarContext);
  if (!context) {
    throw new Error("usePortalSidebar must be used within PortalSidebarProvider.");
  }
  return context;
};
