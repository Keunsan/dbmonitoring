/** 운영 포털 메뉴·라우트 상수 (화면 §2 메뉴 구조 기준)입니다. */

export type PortalNavItem = {
  label: string;
  href: string;
  /** 2차 이후 메뉴는 MVP에서 비활성 표시 */
  mvp?: boolean;
};

export type PortalNavGroup = {
  label: string;
  items: PortalNavItem[];
};

/** 사이드바 메뉴 골격 — T-006 AppShell에서 사용 */
export const PORTAL_NAV_GROUPS: PortalNavGroup[] = [
  {
    label: "대시보드",
    items: [
      { label: "통합 현황", href: "/dashboard", mvp: true },
      { label: "통합 현황_v1", href: "/dashboard/v1", mvp: true },
      { label: "업무 시스템별 현황", href: "/dashboard/by-business", mvp: false },
    ],
  },
  {
    label: "실시간 모니터링",
    items: [
      { label: "DB 실시간 현황", href: "/monitoring/realtime", mvp: true },
      { label: "실시간 세션", href: "/monitoring/sessions", mvp: true },
      { label: "락 및 Blocking", href: "/monitoring/blocking", mvp: true },
      { label: "교착상태", href: "/monitoring/deadlocks", mvp: true },
      { label: "Wait 현황", href: "/monitoring/waits", mvp: true },
    ],
  },
  {
    label: "성능 분석",
    items: [
      { label: "Top SQL 분석", href: "/analysis/top-sql", mvp: true },
      { label: "실행 계획 변경", href: "/analysis/plan-changes", mvp: true },
      { label: "성능 회귀 탐지", href: "/analysis/regressions", mvp: true },
    ],
  },
  {
    label: "알림 및 이슈",
    items: [
      { label: "실시간 알림", href: "/alerts/live", mvp: true },
      { label: "알림 이력", href: "/alerts/history", mvp: true },
    ],
  },
  {
    label: "시스템 관리",
    items: [
      { label: "DB 인스턴스 관리", href: "/admin/db-instances", mvp: true },
      { label: "임계치 정책 관리", href: "/admin/threshold-policies", mvp: true },
      { label: "사용자 관리", href: "/admin/users", mvp: false },
      { label: "역할 및 권한", href: "/admin/roles", mvp: false },
    ],
  },
];
