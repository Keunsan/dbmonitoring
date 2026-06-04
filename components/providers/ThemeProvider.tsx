"use client";

/** 다크·화이트 테마 전환을 위한 next-themes 프로바이더입니다. */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

type ThemeProviderProps = {
  children: ReactNode;
};

/**
 * 포털 화이트·다크 테마를 class 기준으로 적용합니다.
 */
export const ThemeProvider = ({ children }: ThemeProviderProps) => (
  <NextThemesProvider
    attribute="class"
    defaultTheme="dark"
    enableSystem={false}
    themes={["dark", "light"]}
    storageKey="dbmonitoring-theme"
  >
    {children}
  </NextThemesProvider>
);
