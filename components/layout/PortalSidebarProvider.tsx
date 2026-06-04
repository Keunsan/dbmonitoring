"use client";

/** 사이드바 고정·리사이즈·호버 펼침을 제어하는 프로바이더입니다. */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  PortalSidebarContext,
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_PIN_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from "@/components/layout/portal-sidebar-context";
import { SidebarProvider } from "@/components/ui/sidebar";

const clampWidth = (width: number) =>
  Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, width));

const readStoredPinned = () => {
  if (typeof window === "undefined") {
    return true;
  }
  const stored = window.localStorage.getItem(SIDEBAR_PIN_STORAGE_KEY);
  return stored !== "false";
};

const readStoredWidth = () => {
  if (typeof window === "undefined") {
    return SIDEBAR_DEFAULT_WIDTH_PX;
  }
  const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
  return Number.isFinite(parsed) ? clampWidth(parsed) : SIDEBAR_DEFAULT_WIDTH_PX;
};

type PortalSidebarProviderProps = {
  children: ReactNode;
};

/**
 * SidebarProvider에 고정·너비·호버 상태를 연결합니다.
 */
export const PortalSidebarProvider = ({ children }: PortalSidebarProviderProps) => {
  const [pinned, setPinnedState] = useState(true);
  const [widthPx, setWidthPxState] = useState(SIDEBAR_DEFAULT_WIDTH_PX);
  const [hovering, setHovering] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPinnedState(readStoredPinned());
    setWidthPxState(readStoredWidth());
    setHydrated(true);
  }, []);

  const setPinned = useCallback((value: boolean) => {
    setPinnedState(value);
    window.localStorage.setItem(SIDEBAR_PIN_STORAGE_KEY, String(value));
    if (value) {
      setHovering(false);
    }
  }, []);

  const setWidthPx = useCallback((value: number) => {
    const next = clampWidth(value);
    setWidthPxState(next);
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
  }, []);

  const open = pinned || hovering;

  useEffect(() => {
    if (pinned || !hydrated) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const edgePx = open ? widthPx + 12 : 56;
      setHovering(event.clientX <= edgePx);
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [hydrated, open, pinned, widthPx]);

  const contextValue = useMemo(
    () => ({
      pinned,
      setPinned,
      widthPx,
      setWidthPx,
      hovering,
      setHovering,
      isResizing,
      setIsResizing,
    }),
    [hovering, isResizing, pinned, setPinned, setWidthPx, widthPx],
  );

  return (
    <PortalSidebarContext.Provider value={contextValue}>
      <SidebarProvider
        open={hydrated ? open : true}
        onOpenChange={() => {
          /* 포털은 고정·호버로만 열림 상태를 제어합니다. */
        }}
        style={
          {
            "--sidebar-width": `${widthPx}px`,
          } as CSSProperties
        }
        className={isResizing ? "[&_[data-slot=sidebar-gap]]:transition-none [&_[data-slot=sidebar-container]]:transition-none" : undefined}
      >
        {children}
      </SidebarProvider>
    </PortalSidebarContext.Provider>
  );
};
