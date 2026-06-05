"use client";

/** 수동 Collector 실행 버튼과 수집 중·완료 피드백을 제공합니다. */

import { Cog } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type CollectRunButtonProps = {
  onCollect: () => Promise<void>;
  onFailed?: (message: string) => void;
  label?: string;
  size?: "default" | "sm";
};

/**
 * Manual 수집 실행 버튼입니다. 수집 중에는 비활성화되고 완료 시 토스트로 안내합니다.
 */
export const CollectRunButton = ({
  onCollect,
  onFailed,
  label = "Manual",
  size = "default",
}: CollectRunButtonProps) => {
  const [running, setRunning] = useState(false);
  const collectingRef = useRef(false);

  const handleClick = useCallback(async () => {
    if (collectingRef.current) {
      return;
    }

    collectingRef.current = true;
    setRunning(true);

    try {
      await onCollect();
      toast.success("실시간 정보수집이 완료됐습니다.", { duration: 3000 });
    } catch (collectError) {
      const message =
        collectError instanceof Error
          ? collectError.message
          : "실시간 정보 수집에 실패했습니다.";
      toast.error(message, { duration: 4000 });
      onFailed?.(message);
    } finally {
      collectingRef.current = false;
      setRunning(false);
    }
  }, [onCollect, onFailed]);

  return (
    <Button
      type="button"
      size={size}
      className={size === "sm" ? "px-2.5" : undefined}
      onClick={() => void handleClick()}
      disabled={running}
      aria-busy={running}
    >
      {running ? (
        <span className="inline-flex items-center gap-1.5">
          {label}
          <Cog className="size-3.5 shrink-0 animate-spin" aria-hidden />
        </span>
      ) : (
        label
      )}
    </Button>
  );
};
