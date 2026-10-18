"use client";

import { Button } from "@/components/ui/button";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Separator } from "./ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

type SettingsSection = "profile" | "agent";

interface SettingsLayoutProps {
  children: (activeSection: SettingsSection) => React.ReactNode;
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("profile");

  const sections: Array<{ id: SettingsSection; label: string }> = [
    { id: "profile", label: "个人资料" },
    { id: "agent", label: "智能助手" },
  ];

  return (
    <Tabs
      value={activeSection}
      onValueChange={(value) => setActiveSection(value as SettingsSection)}
      orientation="vertical"
      className="min-h-screen flex-row gap-0"
    >
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r bg-secondary p-4">
        <Button
          variant="ghost"
          type="button"
          onClick={() => router.push("/projects")}
          className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1"
        >
          <span aria-hidden>&larr;</span> 返回项目列表
        </Button>

        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          个人中心
        </div>

        <TabsList
          aria-label="个人中心栏目"
          variant="line"
          className="w-full items-stretch gap-0.5"
        >
          {sections.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              className="h-8 flex-none justify-start px-2 after:hidden data-active:bg-muted"
            >
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Separator className="my-4" />
      </aside>

      {/* Content */}
      <main className="flex-1 p-8">
        <TabsContent value={activeSection} className="max-w-xl">
          {children(activeSection)}
        </TabsContent>
      </main>
    </Tabs>
  );
}
