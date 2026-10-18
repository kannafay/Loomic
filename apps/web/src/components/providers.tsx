"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { AuthProvider } from "../lib/auth-context";
import { PageDataProvider } from "../lib/page-data-context";
import { ToastProvider } from "./toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <PageDataProvider>
          <ToastProvider>{children}</ToastProvider>
        </PageDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
