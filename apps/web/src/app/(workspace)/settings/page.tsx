"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ModelPreferencesSection } from "@/components/model-preferences-section";
import { ProfileSection } from "@/components/profile-section";
import { SettingsSkeleton } from "@/components/skeletons/settings-skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { usePageDataState } from "@/lib/page-data-context";
import {
  ApiAuthError,
  fetchModelPreferences,
  fetchModels,
  fetchViewer,
  updateModelPreferences,
  updateProfile,
} from "@/lib/server-api";
import { type ModelPreferences, modelPreferencesSchema } from "@loomic/shared";

type SettingsTab = "profile" | "models";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "profile", label: "个人资料" },
  { id: "models", label: "模型偏好" },
];

export default function SettingsPage() {
  const { session } = useAuth();
  const searchParams = useSearchParams();

  const requestedTab = searchParams.get("tab");
  const initialTab =
    requestedTab === "agent" ? "models" : (requestedTab ?? "profile");
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabs.some((t) => t.id === initialTab)
      ? (initialTab as SettingsTab)
      : "profile",
  );
  const [profile, setProfile, hasProfile] = usePageDataState<{
    displayName: string;
    email: string;
  } | null>("settings:profile", null);
  const [preferences, setPreferences, hasPreferences] =
    usePageDataState<ModelPreferences>(
      "settings:model-preferences",
      modelPreferencesSchema.parse({}),
    );
  const [pageLoading, setPageLoading] = useState(
    !hasProfile || !hasPreferences,
  );
  const [pageError, setPageError] = useState(false);

  // Ref pattern: prevent token refresh from cascading through dependency arrays
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;
  const hasInitialized = useRef(false);

  const getToken = useCallback(() => accessTokenRef.current, []);

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setPageLoading(!hasProfile || !hasPreferences);
    setPageError(false);

    try {
      const [viewer, settings] = await Promise.all([
        fetchViewer(token),
        fetchModelPreferences(token),
      ]);

      setProfile({
        displayName: viewer.profile.displayName,
        email: viewer.profile.email,
      });
      setPreferences(settings.preferences);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        // Workspace layout handles auth redirect
        return;
      }
      setPageError(true);
    } finally {
      setPageLoading(false);
    }
  }, [getToken, hasProfile, hasPreferences, setProfile, setPreferences]);

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

  const handlePreferencesSave = useCallback(
    async (value: ModelPreferences) => {
      const token = getToken();
      if (!token) throw new Error("请重新登录。");
      const result = await updateModelPreferences(token, value);
      setPreferences(result.preferences);
    },
    [getToken, setPreferences],
  );

  if (pageLoading) {
    return <SettingsSkeleton />;
  }

  if (pageError)
    return (
      <div className="p-8" role="alert">
        <p className="mb-4 text-sm">个人中心加载失败，请重试。</p>
        <Button variant="outline" onClick={() => void loadData()}>
          重新加载
        </Button>
      </div>
    );
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
          <TabsContent value="models">
            <ModelPreferencesSection
              preferences={preferences}
              onSave={handlePreferencesSave}
              fetchModels={fetchModels}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
