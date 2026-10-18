"use client";

import { type ReactNode, ViewTransition } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      name="workspace-page"
      default="none"
      update="workspace-page"
    >
      {children}
    </ViewTransition>
  );
}
