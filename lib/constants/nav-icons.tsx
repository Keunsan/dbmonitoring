/** 사이드바 메뉴별 아이콘 매핑입니다. */

import {
  Activity,
  AlertOctagon,
  BarChart3,
  Bell,
  BellRing,
  Building2,
  Clock,
  Database,
  FileCode2,
  Gauge,
  GitBranch,
  History,
  LayoutDashboard,
  LineChart,
  Lock,
  Server,
  Shield,
  SlidersHorizontal,
  TrendingDown,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/** href 기준 메뉴 아이콘 */
export const PORTAL_NAV_ITEM_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/dashboard/v1": BarChart3,
  "/dashboard/v2": LineChart,
  "/dashboard/by-business": Building2,
  "/monitoring/realtime": Gauge,
  "/monitoring/sessions": Users,
  "/monitoring/blocking": Lock,
  "/monitoring/deadlocks": AlertOctagon,
  "/monitoring/waits": Clock,
  "/analysis/top-sql": FileCode2,
  "/analysis/plan-changes": GitBranch,
  "/analysis/regressions": TrendingDown,
  "/alerts/live": BellRing,
  "/alerts/history": History,
  "/admin/db-instances": Server,
  "/admin/threshold-policies": SlidersHorizontal,
  "/admin/users": UsersRound,
  "/admin/roles": Shield,
};

/** 그룹 라벨 아이콘 */
export const PORTAL_NAV_GROUP_ICONS: Record<string, LucideIcon> = {
  대시보드: LayoutDashboard,
  "실시간 모니터링": Activity,
  "성능 분석": Database,
  "알림 및 이슈": Bell,
  "시스템 관리": Shield,
};
