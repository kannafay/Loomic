"use client";

import type {
  BrandKitAssetType,
  BrandKitDetail,
  BrandKitSummary,
} from "@loomic/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../../lib/auth-context";
import {
  createBrandKit,
  createBrandKitAsset,
  deleteBrandKit,
  deleteBrandKitAsset,
  duplicateBrandKit,
  fetchBrandKit,
  fetchBrandKits,
  updateBrandKit,
  updateBrandKitAsset,
  uploadBrandKitAsset,
} from "../../lib/brand-kit-api";
import { usePageDataState } from "../../lib/page-data-context";
import { ApiAuthError } from "../../lib/server-api";
import { BrandKitSkeleton } from "../skeletons/brand-kit-skeleton";
import { useToast } from "../toast";
import { BrandKitEditor } from "./brand-kit-editor";
import { BrandKitSidebar } from "./brand-kit-sidebar";
import { EmptyState } from "./empty-state";

export function BrandKitPage() {
  const { session, signOut } = useAuth();
  const { success, error: showError } = useToast();

  const [kits, setKits, hasKits] = usePageDataState<BrandKitSummary[]>(
    "brand-kits:list",
    [],
  );
  const [selectedKit, setSelectedKit, hasSelectedKit] =
    usePageDataState<BrandKitDetail | null>("brand-kits:selected", null);
  const [loading, setLoading] = useState(
    !hasKits || (kits.length > 0 && !hasSelectedKit),
  );

  // Use refs for values that change on token refresh but shouldn't
  // trigger callback/effect cascades (root cause of tab-switch reloads).
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;
  const selectedKitRef = useRef(selectedKit);
  selectedKitRef.current = selectedKit;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const handleAuthError = useCallback(async (err: unknown) => {
    if (err instanceof ApiAuthError) {
      await signOutRef.current();
      return true;
    }
    return false;
  }, []);

  const getToken = useCallback(() => {
    const token = accessTokenRef.current;
    if (!token) throw new ApiAuthError();
    return token;
  }, []);

  // --- Data loading (ref-based, no dependency cascades) ---

  const loadKitDetail = useCallback(
    async (kitId: string) => {
      try {
        const detail = await fetchBrandKit(getToken(), kitId);
        setSelectedKit(detail);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to load brand kit detail:", err);
      }
    },
    [getToken, handleAuthError, setSelectedKit],
  );

  const refreshList = useCallback(async () => {
    try {
      const data = await fetchBrandKits(getToken());
      setKits(data.brandKits);
      return data.brandKits;
    } catch (err) {
      if (await handleAuthError(err)) return [];
      console.error("Failed to load brand kits:", err);
      return [];
    }
  }, [getToken, handleAuthError, setKits]);

  // Initial load — runs exactly once (workspace layout guarantees auth).
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    (async () => {
      try {
        const data = await fetchBrandKits(getToken());
        setKits(data.brandKits);
        const selectionBeforeRefresh = selectedKitRef.current;
        const firstKit =
          data.brandKits.find((kit) => kit.id === selectionBeforeRefresh?.id) ??
          data.brandKits[0];
        if (firstKit) {
          const detail = await fetchBrandKit(getToken(), firstKit.id);
          if (selectedKitRef.current === selectionBeforeRefresh) {
            setSelectedKit(detail);
          }
        } else {
          setSelectedKit(null);
        }
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to load brand kits:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken, handleAuthError, setKits, setSelectedKit]);

  // --- Kit handlers ---

  const handleSelectKit = useCallback(
    async (kitId: string) => {
      await loadKitDetail(kitId);
    },
    [loadKitDetail],
  );

  const handleCreateKit = useCallback(async () => {
    try {
      const newKit = await createBrandKit(getToken());
      success("品牌套件已创建。");
      await refreshList();
      setSelectedKit(newKit);
    } catch (err) {
      if (await handleAuthError(err)) return;
      console.error("Failed to create brand kit:", err);
      showError("品牌套件创建失败，请重试。");
    }
  }, [
    getToken,
    handleAuthError,
    refreshList,
    setSelectedKit,
    success,
    showError,
  ]);

  const handleDuplicateKit = useCallback(async () => {
    const kit = selectedKitRef.current;
    if (!kit) return;
    try {
      const duplicated = await duplicateBrandKit(getToken(), kit.id);
      success("品牌套件已复制。");
      await refreshList();
      setSelectedKit(duplicated);
    } catch (err) {
      if (await handleAuthError(err)) return;
      console.error("Failed to duplicate brand kit:", err);
      showError("品牌套件复制失败，请重试。");
    }
  }, [
    getToken,
    handleAuthError,
    refreshList,
    setSelectedKit,
    success,
    showError,
  ]);

  const handleUpdateKit = useCallback(
    async (data: {
      name?: string;
      guidance_text?: string | null;
      is_default?: boolean;
    }) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        const updated = await updateBrandKit(getToken(), kit.id, data);
        if (data.is_default !== undefined)
          success(
            data.is_default ? "已设为默认品牌套件。" : "已取消默认品牌套件。",
          );
        setSelectedKit(updated);
        await refreshList();
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to update brand kit:", err);
        showError("品牌套件保存失败，请重试。");
      }
    },
    [
      getToken,
      handleAuthError,
      refreshList,
      setSelectedKit,
      success,
      showError,
    ],
  );

  const handleDeleteKit = useCallback(async () => {
    const kit = selectedKitRef.current;
    if (!kit) return;
    try {
      await deleteBrandKit(getToken(), kit.id);
      success("品牌套件已删除。");
      const remaining = await refreshList();
      const nextKit = remaining[0];
      if (nextKit) {
        await loadKitDetail(nextKit.id);
      } else {
        setSelectedKit(null);
      }
    } catch (err) {
      if (await handleAuthError(err)) return;
      console.error("Failed to delete brand kit:", err);
      showError("品牌套件删除失败，请重试。");
    }
  }, [
    getToken,
    handleAuthError,
    refreshList,
    loadKitDetail,
    setSelectedKit,
    success,
    showError,
  ]);

  const handleDeleteKitFromSidebar = useCallback(
    async (kitId: string) => {
      try {
        await deleteBrandKit(getToken(), kitId);
        success("品牌套件已删除。");
        const remaining = await refreshList();
        if (selectedKitRef.current?.id === kitId) {
          const nextKit = remaining[0];
          if (nextKit) {
            await loadKitDetail(nextKit.id);
          } else {
            setSelectedKit(null);
          }
        }
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to delete brand kit:", err);
        showError("品牌套件删除失败，请重试。");
      }
    },
    [
      getToken,
      handleAuthError,
      refreshList,
      loadKitDetail,
      setSelectedKit,
      success,
      showError,
    ],
  );

  // --- Asset handlers ---

  const handleAddAsset = useCallback(
    async (
      type: BrandKitAssetType,
      displayName: string,
      textContent?: string | null,
      metadata?: Record<string, unknown>,
    ) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await createBrandKitAsset(getToken(), kit.id, {
          asset_type: type,
          display_name: displayName,
          text_content: textContent ?? null,
          metadata,
        });
        success("素材已添加。");
        await loadKitDetail(kit.id);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to create asset:", err);
        showError("素材添加失败，请重试。");
      }
    },
    [getToken, handleAuthError, loadKitDetail, success, showError],
  );

  const handleUpdateAsset = useCallback(
    async (
      assetId: string,
      data: { display_name?: string; text_content?: string | null },
    ) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await updateBrandKitAsset(getToken(), kit.id, assetId, data);
        await loadKitDetail(kit.id);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to update asset:", err);
        showError("素材保存失败，请重试。");
      }
    },
    [getToken, handleAuthError, loadKitDetail, showError],
  );

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await deleteBrandKitAsset(getToken(), kit.id, assetId);
        success("素材已删除。");
        await loadKitDetail(kit.id);
        await refreshList();
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to delete asset:", err);
        showError("素材删除失败，请重试。");
      }
    },
    [getToken, handleAuthError, loadKitDetail, refreshList, success, showError],
  );

  const handleUploadAsset = useCallback(
    async (type: "logo" | "image", file: File) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await uploadBrandKitAsset(getToken(), kit.id, type, file);
        success("素材已上传。");
        await loadKitDetail(kit.id);
        await refreshList();
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to upload asset:", err);
        showError("素材上传失败，请重试。");
      }
    },
    [getToken, handleAuthError, loadKitDetail, refreshList, success, showError],
  );

  // --- Render ---

  if (loading) {
    return <BrandKitSkeleton />;
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background md:flex-row">
      {/* Sidebar: full width horizontal on mobile, vertical panel on md+ */}
      <BrandKitSidebar
        kits={kits}
        selectedKitId={selectedKit?.id ?? null}
        onSelectKit={handleSelectKit}
        onCreateKit={handleCreateKit}
        onDeleteKit={handleDeleteKitFromSidebar}
      />

      {selectedKit ? (
        <BrandKitEditor
          kit={selectedKit}
          onUpdateKit={handleUpdateKit}
          onDeleteKit={handleDeleteKit}
          onDuplicateKit={handleDuplicateKit}
          onAddAsset={handleAddAsset}
          onUpdateAsset={handleUpdateAsset}
          onDeleteAsset={handleDeleteAsset}
          onUploadAsset={handleUploadAsset}
        />
      ) : (
        <EmptyState onCreateKit={handleCreateKit} />
      )}
    </div>
  );
}
