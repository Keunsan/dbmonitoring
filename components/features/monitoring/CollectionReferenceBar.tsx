"use client";

/** 화면 상단에 스냅샷 데이터 수집 기준 시각을 표시합니다. */

import { useMemo } from "react";

type CollectionReferenceItem = {
  instance: { instanceName: string };
  summary: {
    lastRun: {
      finishedAt: string;
    } | null;
  };
};

type CollectionReferenceBarProps = {
  loading: boolean;
  items: CollectionReferenceItem[];
  mode: "dashboard" | "instance";
  selected?: CollectionReferenceItem | null;
  /** compact: PageHeader 액션 아래 우측 정렬 */
  layout?: "bar" | "compact";
};

/** ISO 시각을 화면용 수집 기준 시각 문자열로 변환합니다. */
const formatCollectionReferenceTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

const pickLatestFinishedAt = (finishedAtList: string[]) =>
  finishedAtList.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest,
  );

const buildDashboardCollectionReference = (items: CollectionReferenceItem[]) => {
  const finishedAtList = items
    .map((item) => item.summary.lastRun?.finishedAt)
    .filter((value): value is string => Boolean(value));

  if (finishedAtList.length === 0) {
    return {
      label: "수집 이력이 없습니다.",
      iso: null,
    };
  }

  const latest = pickLatestFinishedAt(finishedAtList);

  return {
    label: formatCollectionReferenceTime(latest),
    iso: latest,
  };
};

const buildInstanceCollectionReference = (
  selected: CollectionReferenceItem | null | undefined,
) => {
  const finishedAt = selected?.summary.lastRun?.finishedAt;
  const instanceName = selected?.instance.instanceName;

  if (!finishedAt) {
    return {
      label: instanceName
        ? `${instanceName} 수집 이력이 없습니다.`
        : "수집 이력이 없습니다.",
      iso: null,
    };
  }

  return {
    label: formatCollectionReferenceTime(finishedAt),
    iso: finishedAt,
  };
};

/**
 * PageHeader 아래에 데이터 수집 기준 시각을 표시합니다.
 */
export const CollectionReferenceBar = ({
  loading,
  items,
  mode,
  selected,
  layout = "bar",
}: CollectionReferenceBarProps) => {
  const collectionReference = useMemo(() => {
    if (mode === "dashboard") {
      return buildDashboardCollectionReference(items);
    }
    return buildInstanceCollectionReference(selected);
  }, [items, mode, selected]);

  const isCompact = layout === "compact";

  const content = loading ? (
    <span>조회 중…</span>
  ) : (
    <>
      {collectionReference.iso ? (
        <time className="font-mono" dateTime={collectionReference.iso}>
          {collectionReference.label}
        </time>
      ) : (
        <span>{collectionReference.label}</span>
      )}
    </>
  );

  if (isCompact) {
    return (
      <div className="max-w-full text-right text-[11px] leading-tight text-foreground/55">
        <div className="flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0">
          <span className="shrink-0">데이터 수집 기준</span>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-background/90 px-4 py-2 text-sm backdrop-blur-sm md:px-5">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
        <span className="text-muted-foreground shrink-0">데이터 수집 기준</span>
        {content}
      </div>
    </div>
  );
};
