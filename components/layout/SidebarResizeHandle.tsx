"use client";

/** 고정된 사이드바 너비를 드래그로 조절합니다. */

import { useCallback, useEffect } from "react";

import {
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  usePortalSidebar,
} from "@/components/layout/portal-sidebar-context";
import { cn } from "@/lib/utils";

/**
 * 사이드바 우측 가장자리 리사이즈 핸들입니다.
 */
export const SidebarResizeHandle = () => {
  const { pinned, widthPx, setWidthPx, setIsResizing } = usePortalSidebar();

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pinned) {
        return;
      }

      event.preventDefault();
      const startX = event.clientX;
      const startWidth = widthPx;

      setIsResizing(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const next = Math.min(
          SIDEBAR_MAX_WIDTH_PX,
          Math.max(SIDEBAR_MIN_WIDTH_PX, startWidth + delta),
        );
        setWidthPx(next);
      };

      const handlePointerUp = () => {
        setIsResizing(false);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [pinned, setIsResizing, setWidthPx, widthPx],
  );

  useEffect(() => {
    if (!pinned) {
      setIsResizing(false);
    }
  }, [pinned, setIsResizing]);

  if (!pinned) {
    return null;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="사이드바 너비 조절"
      onPointerDown={handlePointerDown}
      className={cn(
        "absolute top-0 right-0 z-30 hidden h-full w-1.5 cursor-col-resize md:block",
        "hover:bg-primary/25 active:bg-primary/35",
      )}
    />
  );
};
