"use client";

import type { ProjectSummary, WorkspaceSummary } from "@loomic/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { LoadingScreen } from "@/components/loading-screen";
import { ProjectList } from "@/components/project-list";
import { ProjectsSkeleton } from "@/components/skeletons/projects-skeleton";
import { Button } from "@/components/ui/button";
import { useCreateProject } from "@/hooks/use-create-project";
import { useAuth } from "@/lib/auth-context";
import { usePageDataState } from "@/lib/page-data-context";
import { ApiAuthError, fetchProjects, fetchViewer } from "@/lib/server-api";

export default function ProjectsPage() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const { create: createNewProject, creating } = useCreateProject();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [projects, setProjects, hasProjects] = usePageDataState<
    ProjectSummary[]
  >("projects", []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(!hasProjects);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Ref pattern: prevent token refresh from cascading through dependency arrays
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const routerRef = useRef(router);
  routerRef.current = router;
  const hasInitialized = useRef(false);

  const getToken = useCallback(() => accessTokenRef.current, []);

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setPageLoading(!hasProjects);
    setLoadError(null);

    try {
      const [viewer, data] = await Promise.all([
        fetchViewer(token),
        fetchProjects(token),
      ]);
      setWorkspace(viewer.workspace);
      setProjects(data.projects);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        await signOutRef.current();
        routerRef.current.replace("/login");
        return;
      }
      setLoadError("数据加载失败，请重试。");
    } finally {
      setPageLoading(false);
    }
  }, [getToken, hasProjects, setProjects]);

  useEffect(() => {
    if (hasInitialized.current) return;
    if (!session?.access_token) return;
    hasInitialized.current = true;
    loadData();
  }, [loadData, session?.access_token]);

  const handleDeleted = useCallback(
    (projectId: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    },
    [setProjects],
  );

  if (creating) {
    return <LoadingScreen />;
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={loadData}>
            重试
          </Button>
        </div>
      </div>
    );
  }

  if (pageLoading) {
    return <ProjectsSkeleton />;
  }

  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      <ProjectList
        projects={projects}
        highlightId={highlightId}
        onCreateClick={() => createNewProject()}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
