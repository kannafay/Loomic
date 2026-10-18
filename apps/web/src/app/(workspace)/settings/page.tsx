"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentSection } from "@/components/agent-section";
import { ProfileSection } from "@/components/profile-section";
import { SettingsSkeleton } from "@/components/skeletons/settings-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { usePageDataState } from "@/lib/page-data-context";
import {
  ApiAuthError,
  fetchModels,
  fetchViewer,
  fetchWorkspaceSettings,
  updateProfile,
  updateWorkspaceSettings,
} from "@/lib/server-api";

type SettingsTab = "profile" | "agent";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "profile", label: "个人资料" },
  { id: "agent", label: "智能助手" },
];

export default function SettingsPage() {
  const { session } = useAuth();
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get("tab") as SettingsTab) ?? "profile";
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabs.some((t) => t.id === initialTab) ? initialTab : "profile",
  );
  const [profile, setProfile, hasProfile] = usePageDataState<{
    displayName: string;
    email: string;
  } | null>("settings:profile", null);
  const [defaultModel, setDefaultModel] = usePageDataState(
    "settings:default-model",
    "gpt-5.4-mini",
  );
  const [pageLoading, setPageLoading] = useState(!hasProfile);

  // Ref pattern: prevent token refresh from cascading through dependency arrays
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;
  const hasInitialized = useRef(false);

  const getToken = useCallback(() => accessTokenRef.current, []);

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setPageLoading(!hasProfile);

    try {
      const [viewer, settings] = await Promise.all([
        fetchViewer(token),
        fetchWorkspaceSettings(token),
      ]);

      setProfile({
        displayName: viewer.profile.displayName,
        email: viewer.profile.email,
      });
      setDefaultModel(settings.settings.defaultModel);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        // Workspace layout handles auth redirect
        return;
      }
    } finally {
      setPageLoading(false);
    }
  }, [getToken, hasProfile, setProfile, setDefaultModel]);

  useEffect(() => {
    if (hasInitialized.current) return;
    if (!session?.access_token) return;
    hasInitialized.current = true;
    loadData();
  }, [session?.access_token, loadData]);

  const handleProfileSave = useCallback(
    async (displayName: string) => {
      const token = getToken();
      if (!token) return;
      const result = await updateProfile(token, { displayName });
      setProfile({
        displayName: result.profile.displayName,
        email: result.profile.email,
      });
    },
    [getToken, setProfile],
  );

  const handleAgentSave = useCallback(
    async (model: string) => {
      const token = getToken();
      if (!token) return;
      const result = await updateWorkspaceSettings(token, {
        defaultModel: model,
      });
      setDefaultModel(result.settings.defaultModel);
    },
    [getToken, setDefaultModel],
  );

  const stableFetchModels = useCallback(() => fetchModels(), []);

  if (pageLoading) {
    return <SettingsSkeleton />;
  }

  if (!profile) return null;

  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      <h1 className="mb-4 text-base font-semibold sm:mb-6 sm:text-lg">
        个人中心
      </h1>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SettingsTab)}
      >
        <ScrollArea
          orientation="horizontal"
          className="mb-6 overflow-x-auto sm:mb-8"
        >
          <TabsList aria-label="个人中心栏目" className="h-11 sm:h-8">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="px-4 sm:px-3">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>

        <div className="max-w-xl">
          <TabsContent value="profile">
            <ProfileSection
              displayName={profile.displayName}
              email={profile.email}
              onSave={handleProfileSave}
            />
          </TabsContent>
          <TabsContent value="agent">
            <AgentSection
              defaultModel={defaultModel}
              onSave={handleAgentSave}
              fetchModels={stableFetchModels}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
