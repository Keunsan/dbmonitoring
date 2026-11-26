/** Vite 포털 공통 레이아웃 (AppShell)입니다. */
import { AppShell } from "@/components/layout/AppShell";
import type { ReactNode } from "react";

type PortalLayoutProps = {
  children: ReactNode;
};

export const PortalLayout = ({ children }: PortalLayoutProps) => (
  <AppShell>{children}</AppShell>
);