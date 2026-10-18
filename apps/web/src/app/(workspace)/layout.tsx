"use client";

import { useRouter } from "next/navigation";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { LoadingScreen } from "@/components/loading-screen";
import { PageTransition } from "@/components/page-transition";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";

export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof document === "undefined") return true;
    const savedState = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("sidebar_state="))
      ?.split("=")[1];
    return savedState !== "false";
  });

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return null;
  }

  return (
    <TooltipProvider delay={150}>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        className="h-dvh min-h-0 overflow-hidden"
        style={
          {
            "--sidebar-width": "220px",
            "--sidebar-width-icon": "64px",
          } as CSSProperties
        }
      >
        {/* Skip navigation link -- visible only on keyboard focus for a11y */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:rounded-md focus:shadow-lg"
        >
          跳到主内容
        </a>
        <AppSidebar />
        <OverlayScrollbarsComponent
          element="main"
          id="main"
          className="relative h-full min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
          options={{
            scrollbars: {
              theme: "os-theme-loomic",
              autoHide: "leave",
              autoHideDelay: 600,
              clickScroll: "instant",
            },
          }}
          defer
        >
          <PageTransition>{children}</PageTransition>
        </OverlayScrollbarsComponent>
      </SidebarProvider>
    </TooltipProvider>
  );
}
