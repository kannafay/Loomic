"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useAuth } from "@/lib/auth-context";
import {
  type AdminUser,
  createProviderWithModels,
  fetchAdminUsers,
  fetchModelAdmin,
  importPresetModels,
  saveConfiguredModel,
  saveProviderConfig,
  setDefaultConfiguredModel,
  testProviderConnection,
  updateSystemRole,
} from "@/lib/model-admin-api";
import type {
  ConfiguredModel,
  ConfiguredModelWrite,
  ModelAdminResponse,
  ModelKind,
  ProviderConfig,
  ProviderConnectionTest,
  ProviderWrite,
} from "@loomic/shared";
import { useCallback, useEffect, useState } from "react";
import { NetworkSettingsPanel } from "./network-settings-panel";
import { ProviderModelDiscovery } from "./provider-model-discovery";

const KINDS: Array<{ id: ModelKind; name: string }> = [
  { id: "text", name: "文本" },
  { id: "audio", name: "语音" },
  { id: "image", name: "图片" },
  { id: "video", name: "视频生成" },
];
const CATEGORIES = [
  { id: "manufacturer", name: "模型厂商" },
  { id: "third_party", name: "第三方" },
  { id: "cloud", name: "云服务商" },
  { id: "custom", name: "自定义" },
] as const;
const EMPTY_PROVIDER: ProviderWrite = {
  name: "",
  category: "manufacturer",
  preset: "google",
  protocol: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  apiKey: "",
  enabled: true,
};
type ModelDraft = {
  id?: string;
  value: ConfiguredModelWrite;
  optionsText: string;
};
const DRAFT_PROVIDER_ID = "00000000-0000-4000-8000-000000000000";
function stagedModel(
  value: Omit<ConfiguredModelWrite, "providerId">,
  id = crypto.randomUUID(),
): ConfiguredModel {
  return {
    ...value,
    providerId: DRAFT_PROVIDER_ID,
    id,
    key: `draft/${id}`,
    isDefault: false,
  };
}

export default function AdminPage() {
  const { session, role, roleLoading, loading, refreshRole } = useAuth();
  const token = session?.access_token;
  const [tab, setTab] = useState<"models" | "users" | "network">("models");
  const [data, setData] = useState<ModelAdminResponse | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [providerDraft, setProviderDraft] =
    useState<ProviderWrite>(EMPTY_PROVIDER);
  const [kind, setKind] = useState<ModelKind>("text");
  const [modelDraft, setModelDraft] = useState<ModelDraft | null>(null);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [pendingModels, setPendingModels] = useState<ConfiguredModel[]>([]);
  const [connectionTest, setConnectionTest] = useState<
    (ProviderConnectionTest & { signature: string }) | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const chooseProvider = useCallback((provider: ProviderConfig) => {
    setSelectedId(provider.id);
    setAdding(false);
    setModelDraft(null);
    setShowDiscovery(false);
    setPendingModels([]);
    setConnectionTest(null);
    setError("");
    setNotice("");
    setProviderDraft({
      name: provider.name,
      category: provider.category,
      preset: provider.preset,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      apiKey: "",
    });
  }, []);
  const load = useCallback(async () => {
    if (!token) return;
    const result = await fetchModelAdmin(token);
    setData(result);
    return result;
  }, [token]);
  useEffect(() => {
    if (!token || role !== "admin") return;
    let canceled = false;
    void fetchModelAdmin(token)
      .then((result) => {
        if (canceled) return;
        setData(result);
        if (result.providers[0]) chooseProvider(result.providers[0]);
        else setAdding(true);
      })
      .catch((err) => {
        if (!canceled) setError(err.message);
      });
    return () => {
      canceled = true;
    };
  }, [token, role, chooseProvider]);
  useEffect(() => {
    if (tab !== "users" || !token || role !== "admin") return;
    void fetchAdminUsers(token)
      .then((result) => setUsers(result.users))
      .catch((err) => setError(err.message));
  }, [tab, token, role]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  const selected = data?.providers.find(
    (provider) => provider.id === selectedId,
  );
  const providerModels = adding
    ? pendingModels
    : (data?.models.filter((model) => model.providerId === selectedId) ?? []);
  const visibleModels = providerModels.filter((model) => model.kind === kind);
  const connectionSignature = JSON.stringify([
    providerDraft,
    selectedId,
    adding,
  ]);
  const currentConnectionTest =
    connectionTest?.signature === connectionSignature ? connectionTest : null;

  function usePreset(presetId: string) {
    const preset = data?.presets.find((item) => item.id === presetId);
    if (!preset) return;
    setPendingModels(
      preset.models.map((model) => stagedModel({ ...model, enabled: false })),
    );
    setModelDraft(null);
    setShowDiscovery(false);
    setProviderDraft({
      name: preset.id === "custom" ? "" : preset.name,
      category: preset.category,
      preset: preset.id,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl,
      apiKey: "",
      enabled: true,
    });
  }
  function editModel(model?: ConfiguredModel) {
    if (!adding && !selectedId) return;
    const options =
      model?.options ??
      (kind === "video"
        ? {
            capabilities: {
              textToVideo: true,
              imageToVideo: false,
              videoToVideo: false,
              audio: false,
            },
            limits: {
              maxDuration: 8,
              maxResolution: "720p",
              maxInputImages: 0,
            },
          }
        : {});
    setModelDraft({
      ...(model ? { id: model.id } : {}),
      value: model
        ? {
            providerId: model.providerId,
            kind: model.kind,
            apiModel: model.apiModel,
            name: model.name,
            description: model.description,
            adapter: model.adapter,
            enabled: model.enabled,
            options,
          }
        : {
            providerId: selectedId ?? DRAFT_PROVIDER_ID,
            kind,
            apiModel: "",
            name: "",
            description: "",
            adapter:
              providerDraft.preset === "agnes" && kind !== "text"
                ? "agnes"
                : "auto",
            enabled: false,
            options,
          },
      optionsText: JSON.stringify(options, null, 2),
    });
  }

  if (loading || roleLoading)
    return (
      <div className="p-8 text-sm text-muted-foreground">正在读取权限…</div>
    );
  if (role !== "admin")
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">管理后台</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          只有管理员可以访问后台。你仍可使用全部创作功能。
        </p>
      </div>
    );

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as typeof tab);
        setError("");
      }}
      className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:p-8"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">管理后台</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            统一管理内部使用的模型与账号权限。
          </p>
        </div>
        <TabsList aria-label="后台栏目">
          <TabsTrigger value="models" disabled={busy}>
            模型配置
          </TabsTrigger>
          <TabsTrigger value="users" disabled={busy}>
            用户管理
          </TabsTrigger>
          <TabsTrigger value="network" disabled={busy}>
            网络设置
          </TabsTrigger>
        </TabsList>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <output className="mb-4 block rounded-lg bg-accent/15 px-4 py-3 text-sm">
          {notice}
        </output>
      )}
      <TabsContent value="models">
        <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">提供商</h2>
              <Button
                size="icon"
                variant="ghost"
                type="button"
                aria-label="添加提供商"
                disabled={busy || !data}
                onClick={() => {
                  setAdding(true);
                  setSelectedId(null);
                  setProviderDraft(EMPTY_PROVIDER);
                  const preset = data?.presets.find(
                    (item) => item.id === "google",
                  );
                  setPendingModels(
                    preset?.models.map((model) =>
                      stagedModel({ ...model, enabled: false }),
                    ) ?? [],
                  );
                  setModelDraft(null);
                  setShowDiscovery(false);
                  setNotice("");
                }}
                className="h-8 w-8 rounded-md text-lg hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                +
              </Button>
            </div>
            <div className="flex gap-1 overflow-x-auto lg:flex-col">
              {data?.providers.map((provider) => (
                <Button
                  variant="ghost"
                  key={provider.id}
                  type="button"
                  disabled={busy}
                  onClick={() => chooseProvider(provider)}
                  aria-pressed={selectedId === provider.id && !adding}
                  className={`h-auto min-w-[150px] flex-col items-stretch whitespace-normal px-3 py-2.5 text-left ${selectedId === provider.id && !adding ? "bg-accent/15" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    {provider.name}
                    <span
                      aria-label={
                        provider.enabled ? "提供商已启用" : "提供商已停用"
                      }
                      className={`h-1.5 w-1.5 rounded-full ${provider.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                    />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {CATEGORIES.find((c) => c.id === provider.category)?.name} ·{" "}
                    {
                      data.models.filter(
                        (m) => m.providerId === provider.id && m.enabled,
                      ).length
                    }{" "}
                    个启用模型
                  </span>
                </Button>
              ))}
              {!data && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  正在加载配置…
                </p>
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold">
                  {adding ? "添加提供商" : (selected?.name ?? "提供商配置")}
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {adding
                    ? "选择预设填入默认值，也可以从空白配置开始。"
                    : "配置由管理员维护，启用的模型供所有用户使用。"}
                </p>
              </div>
              {adding && (
                <Tabs
                  className="mb-5"
                  value={providerDraft.category}
                  onValueChange={(value) => {
                    const category = CATEGORIES.find(
                      (item) => item.id === value,
                    );
                    if (!category) return;
                    const first = data?.presets.find(
                      (preset) => preset.category === category.id,
                    );
                    if (first) usePreset(first.id);
                    else
                      setProviderDraft({
                        ...EMPTY_PROVIDER,
                        category: category.id,
                        preset: "custom",
                      });
                  }}
                >
                  <TabsList
                    className="h-auto flex-wrap"
                    aria-label="提供商分类"
                  >
                    {CATEGORIES.map((category) => (
                      <TabsTrigger key={category.id} value={category.id}>
                        {category.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent
                    value={providerDraft.category}
                    className="flex flex-wrap gap-2"
                  >
                    {data?.presets
                      .filter(
                        (preset) => preset.category === providerDraft.category,
                      )
                      .map((preset) => (
                        <Button
                          variant="ghost"
                          key={preset.id}
                          type="button"
                          onClick={() => usePreset(preset.id)}
                          aria-pressed={providerDraft.preset === preset.id}
                          className={`${providerDraft.preset === preset.id ? "border-accent bg-accent/10" : ""}`}
                        >
                          {preset.name}
                        </Button>
                      ))}
                  </TabsContent>
                </Tabs>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!token) return;
                  void perform(async () => {
                    const provider = adding
                      ? await createProviderWithModels(token, {
                          provider: providerDraft,
                          models: pendingModels.map(
                            ({
                              providerId: _provider,
                              id: _id,
                              key: _key,
                              isDefault: _default,
                              ...model
                            }) => model,
                          ),
                        })
                      : await saveProviderConfig(
                          token,
                          providerDraft,
                          selectedId ?? undefined,
                        );
                    await load();
                    chooseProvider(provider);
                    setNotice("提供商已保存。勾选下方模型即可启用到前台。");
                  });
                }}
                className="space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label
                    htmlFor="page-provider-draft-name"
                    className="space-y-1.5 text-sm"
                  >
                    <span>配置名称</span>
                    <Input
                      id="page-provider-draft-name"
                      required
                      value={providerDraft.name}
                      maxLength={100}
                      onChange={(event) =>
                        setProviderDraft({
                          ...providerDraft,
                          name: event.target.value,
                        })
                      }
                      placeholder="例如：团队 Agnes"
                    />
                  </label>
                  <label htmlFor="page-1" className="space-y-1.5 text-sm">
                    <span>接口类型</span>
                    <Select
                      items={[
                        { value: "openai", label: "OpenAI 兼容" },
                        { value: "anthropic", label: "Anthropic Messages" },
                        { value: "gemini", label: "Gemini 原生" },
                      ]}
                      value={providerDraft.protocol}
                      onValueChange={(value) =>
                        setProviderDraft({
                          ...providerDraft,
                          protocol: value as ProviderWrite["protocol"],
                        })
                      }
                    >
                      <SelectTrigger
                        id="page-1"
                        aria-label="接口类型"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI 兼容</SelectItem>
                        <SelectItem value="anthropic">
                          Anthropic Messages
                        </SelectItem>
                        <SelectItem value="gemini">Gemini 原生</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <label
                  htmlFor="page-provider-draft-base-url"
                  className="block space-y-1.5 text-sm"
                >
                  <span>接口地址</span>
                  <Input
                    id="page-provider-draft-base-url"
                    type="url"
                    required
                    value={providerDraft.baseUrl}
                    onChange={(event) =>
                      setProviderDraft({
                        ...providerDraft,
                        baseUrl: event.target.value,
                      })
                    }
                    placeholder="https://api.example.com/v1"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label htmlFor="page-2" className="block space-y-1.5 text-sm">
                  <span>
                    API Key{" "}
                    {selected?.hasApiKey && !adding && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        已保存
                      </span>
                    )}
                    {providerDraft.category === "custom" && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        本地服务可留空
                      </span>
                    )}
                  </span>
                  <Input
                    id="page-2"
                    type="password"
                    required={
                      providerDraft.category !== "custom" &&
                      (adding || !selected?.hasApiKey)
                    }
                    value={providerDraft.apiKey ?? ""}
                    onChange={(event) =>
                      setProviderDraft({
                        ...providerDraft,
                        apiKey: event.target.value,
                      })
                    }
                    placeholder={
                      !adding && selected?.hasApiKey
                        ? "留空保持现有 Key"
                        : "填写提供商的 API Key"
                    }
                    autoComplete="new-password"
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <label
                    htmlFor="provider-enabled"
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id="provider-enabled"
                      aria-label="启用此提供商"
                      checked={providerDraft.enabled}
                      onCheckedChange={(checked) =>
                        setProviderDraft({
                          ...providerDraft,
                          enabled: checked,
                        })
                      }
                    />
                    启用此提供商
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      disabled={busy || !data}
                      onClick={() => {
                        if (!token) return;
                        const signature = connectionSignature;
                        setConnectionTest(null);
                        void perform(async () => {
                          const result = await testProviderConnection(token, {
                            ...providerDraft,
                            ...(!adding && selectedId
                              ? { providerId: selectedId }
                              : {}),
                          });
                          setConnectionTest({ ...result, signature });
                        });
                      }}
                    >
                      测试连通性
                    </Button>
                    <Button
                      variant="default"
                      type="submit"
                      disabled={busy || !data}
                    >
                      保存提供商
                    </Button>
                  </div>
                </div>
                {currentConnectionTest && (
                  <output
                    className={`block rounded-lg px-3 py-2 text-sm ${currentConnectionTest.status === "connected" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
                  >
                    {currentConnectionTest.message} 用时{" "}
                    {currentConnectionTest.latencyMs} ms。
                  </output>
                )}
                <p className="text-xs text-muted-foreground">
                  测试仅检查接口和鉴权，使用全局代理，不执行生成任务。
                </p>
              </form>
            </section>

            {(adding || selected) && (
              <section className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold">可用模型</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {adding
                        ? "可先获取或添加模型，保存提供商时一起生效。"
                        : "只有勾选启用的模型，才会出现在前台。"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setNotice("");
                        setModelDraft(null);
                        setShowDiscovery(true);
                      }}
                    >
                      获取模型列表
                    </Button>
                    {providerDraft.preset !== "custom" && (
                      <Button
                        variant="outline"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (token)
                            void perform(async () => {
                              if (adding) {
                                const preset = data?.presets.find(
                                  (item) => item.id === providerDraft.preset,
                                );
                                const missing =
                                  preset?.models.filter(
                                    (model) =>
                                      !pendingModels.some(
                                        (existing) =>
                                          existing.apiModel ===
                                            model.apiModel &&
                                          existing.kind === model.kind,
                                      ),
                                  ) ?? [];
                                setPendingModels((current) => [
                                  ...current,
                                  ...missing.map((model) =>
                                    stagedModel({ ...model, enabled: false }),
                                  ),
                                ]);
                              } else if (selected) {
                                await importPresetModels(token, selected.id);
                                await load();
                              }
                              setNotice("预设模型已补充，已有配置保持不变。");
                            });
                        }}
                      >
                        补充预设
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      type="button"
                      disabled={busy}
                      onClick={() => editModel()}
                    >
                      添加模型
                    </Button>
                  </div>
                </div>
                {showDiscovery && token && (
                  <ProviderModelDiscovery
                    key={selected?.id ?? "new-provider"}
                    token={token}
                    {...(adding
                      ? {
                          connection: providerDraft,
                          onStage: async (models) => {
                            const identities = new Set(
                              pendingModels.map(
                                (model) => `${model.kind}:${model.apiModel}`,
                              ),
                            );
                            const additions = models
                              .filter(
                                (model) =>
                                  !identities.has(
                                    `${model.kind}:${model.apiModel}`,
                                  ),
                              )
                              .map((model) => {
                                const known = data?.presets
                                  .find(
                                    (preset) =>
                                      preset.id === providerDraft.preset,
                                  )
                                  ?.models.find(
                                    (item) =>
                                      item.apiModel === model.apiModel &&
                                      item.kind === model.kind,
                                  );
                                return stagedModel({
                                  ...model,
                                  enabled: false,
                                  adapter:
                                    known?.adapter ??
                                    (providerDraft.preset === "agnes" &&
                                    (model.kind === "image" ||
                                      model.kind === "video")
                                      ? "agnes"
                                      : "auto"),
                                  options: known?.options ?? {},
                                });
                              });
                            setPendingModels((current) => [
                              ...current,
                              ...additions,
                            ]);
                            return {
                              imported: additions.length,
                              skipped: models.length - additions.length,
                            };
                          },
                        }
                      : selected
                        ? { providerId: selected.id }
                        : {})}
                    existingModels={providerModels}
                    busy={busy}
                    onBusyChange={setBusy}
                    onClose={() => setShowDiscovery(false)}
                    onImported={async (result) => {
                      if (!adding) await load();
                      setNotice(
                        adding
                          ? `已加入 ${result.imported} 个待保存模型。保存提供商时一起生效。`
                          : `已导入 ${result.imported} 个模型${result.skipped ? `，跳过 ${result.skipped} 个已有模型` : ""}。请在对应标签中勾选启用。`,
                      );
                      setShowDiscovery(false);
                    }}
                  />
                )}
                <Tabs
                  value={kind}
                  onValueChange={(value) => {
                    setKind(value as ModelKind);
                    setModelDraft(null);
                  }}
                  className="gap-0"
                >
                  <div className="overflow-x-auto border-b border-border px-5 py-2">
                    <TabsList variant="line" aria-label="模型类型">
                      {KINDS.map((item) => (
                        <TabsTrigger
                          key={item.id}
                          value={item.id}
                          className="px-4"
                        >
                          {item.name}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {
                              providerModels.filter(
                                (model) => model.kind === item.id,
                              ).length
                            }
                          </span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                  <TabsContent value={kind} className="divide-y divide-border">
                    {visibleModels.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center gap-3 px-5 py-4"
                      >
                        <Checkbox
                          aria-label={`启用 ${model.name}`}
                          checked={model.enabled}
                          disabled={busy}
                          onCheckedChange={(enabled) => {
                            if (adding) {
                              setPendingModels((current) =>
                                current.map((item) =>
                                  item.id === model.id
                                    ? { ...item, enabled }
                                    : item,
                                ),
                              );
                              return;
                            }
                            if (token)
                              void perform(async () => {
                                await saveConfiguredModel(
                                  token,
                                  { ...model, enabled },
                                  model.id,
                                );
                                await load();
                                setNotice(
                                  enabled
                                    ? "模型已启用，前台可以选择。"
                                    : "模型已停用。",
                                );
                              });
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {model.name}
                            </span>
                            {model.isDefault && (
                              <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px]">
                                默认
                              </span>
                            )}
                          </div>
                          <p
                            className="mt-1 truncate text-xs text-muted-foreground"
                            title={model.apiModel}
                          >
                            {model.apiModel}
                          </p>
                        </div>
                        {!adding && model.enabled && !model.isDefault && (
                          <Button
                            variant="ghost"
                            type="button"
                            disabled={busy}
                            className="hidden shrink-0 text-xs text-muted-foreground hover:text-foreground sm:block"
                            onClick={() => {
                              if (token)
                                void perform(async () => {
                                  await setDefaultConfiguredModel(
                                    token,
                                    model.id,
                                  );
                                  await load();
                                  setNotice("默认模型已更新。");
                                });
                            }}
                          >
                            设为默认
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          type="button"
                          aria-label={`编辑 ${model.name}`}
                          disabled={busy}
                          onClick={() => editModel(model)}
                        >
                          编辑
                        </Button>
                      </div>
                    ))}
                    {visibleModels.length === 0 && (
                      <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                        暂无{KINDS.find((item) => item.id === kind)?.name}
                        模型，可添加预设或自定义模型。
                      </p>
                    )}
                  </TabsContent>
                  {modelDraft && (
                    <form
                      className="space-y-4 border-t border-border bg-muted/25 p-5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!token) return;
                        void perform(async () => {
                          let options: unknown;
                          try {
                            options = JSON.parse(modelDraft.optionsText);
                          } catch {
                            throw new Error("高级参数必须是有效的 JSON 对象。");
                          }
                          if (
                            !options ||
                            typeof options !== "object" ||
                            Array.isArray(options)
                          )
                            throw new Error("高级参数必须是 JSON 对象。");
                          if (adding) {
                            const value = stagedModel(
                              {
                                ...modelDraft.value,
                                options: options as Record<string, unknown>,
                              },
                              modelDraft.id,
                            );
                            if (
                              pendingModels.some(
                                (model) =>
                                  model.id !== value.id &&
                                  model.kind === value.kind &&
                                  model.apiModel === value.apiModel,
                              )
                            )
                              throw new Error("该类型下已添加这个模型 ID。");
                            setPendingModels((current) =>
                              modelDraft.id
                                ? current.map((model) =>
                                    model.id === modelDraft.id ? value : model,
                                  )
                                : [...current, value],
                            );
                            setModelDraft(null);
                            setNotice(
                              "模型已加入待保存列表，保存提供商后生效。",
                            );
                            return;
                          }
                          await saveConfiguredModel(
                            token,
                            {
                              ...modelDraft.value,
                              options: options as Record<string, unknown>,
                            },
                            modelDraft.id,
                          );
                          await load();
                          setModelDraft(null);
                          setNotice("模型配置已保存。");
                        });
                      }}
                    >
                      <h3 className="text-sm font-semibold">
                        {modelDraft.id ? "编辑模型" : "添加模型"}
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label
                          htmlFor="page-model-draft-value-name"
                          className="space-y-1.5 text-sm"
                        >
                          <span>显示名称</span>
                          <Input
                            id="page-model-draft-value-name"
                            required
                            value={modelDraft.value.name}
                            onChange={(event) =>
                              setModelDraft({
                                ...modelDraft,
                                value: {
                                  ...modelDraft.value,
                                  name: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label
                          htmlFor="page-model-draft-value-api-model"
                          className="space-y-1.5 text-sm"
                        >
                          <span>模型 ID</span>
                          <Input
                            id="page-model-draft-value-api-model"
                            required
                            value={modelDraft.value.apiModel}
                            onChange={(event) =>
                              setModelDraft({
                                ...modelDraft,
                                value: {
                                  ...modelDraft.value,
                                  apiModel: event.target.value,
                                },
                              })
                            }
                            placeholder="接口实际接受的模型名称"
                            spellCheck={false}
                          />
                        </label>
                      </div>
                      <label
                        htmlFor="page-model-draft-value-description"
                        className="block space-y-1.5 text-sm"
                      >
                        <span>说明</span>
                        <Input
                          id="page-model-draft-value-description"
                          value={modelDraft.value.description}
                          onChange={(event) =>
                            setModelDraft({
                              ...modelDraft,
                              value: {
                                ...modelDraft.value,
                                description: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      {(kind === "image" || kind === "video") && (
                        <label
                          htmlFor="page-3"
                          className="block space-y-1.5 text-sm"
                        >
                          <span>媒体接口</span>
                          <Select
                            items={[
                              { value: "auto", label: "跟随提供商接口类型" },
                              { value: "agnes", label: "Agnes 图片／视频接口" },
                              ...(kind === "video"
                                ? [{ value: "veo", label: "Gemini Veo 接口" }]
                                : []),
                            ]}
                            value={modelDraft.value.adapter}
                            onValueChange={(value) =>
                              setModelDraft({
                                ...modelDraft,
                                value: {
                                  ...modelDraft.value,
                                  adapter:
                                    value as ConfiguredModelWrite["adapter"],
                                },
                              })
                            }
                          >
                            <SelectTrigger
                              id="page-3"
                              aria-label="媒体接口"
                              className="w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">
                                跟随提供商接口类型
                              </SelectItem>
                              <SelectItem value="agnes">
                                Agnes 图片／视频接口
                              </SelectItem>
                              {kind === "video" && (
                                <SelectItem value="veo">
                                  Gemini Veo 接口
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </label>
                      )}
                      <label
                        htmlFor="page-model-draft-options-text"
                        className="block space-y-1.5 text-sm"
                      >
                        <span>高级参数（JSON）</span>
                        <Textarea
                          id="page-model-draft-options-text"
                          className={"min-h-28 font-mono text-xs"}
                          value={modelDraft.optionsText}
                          onChange={(event) =>
                            setModelDraft({
                              ...modelDraft,
                              optionsText: event.target.value,
                            })
                          }
                          spellCheck={false}
                        />
                        <span className="block text-xs text-muted-foreground">
                          文本支持 temperature、maxTokens；视频支持
                          capabilities、limits。
                        </span>
                      </label>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label
                          htmlFor="model-enabled"
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            id="model-enabled"
                            aria-label="启用到前台"
                            checked={modelDraft.value.enabled}
                            onCheckedChange={(checked) =>
                              setModelDraft({
                                ...modelDraft,
                                value: {
                                  ...modelDraft.value,
                                  enabled: checked,
                                },
                              })
                            }
                          />
                          启用到前台
                        </label>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            type="button"
                            disabled={busy}
                            onClick={() => setModelDraft(null)}
                          >
                            取消
                          </Button>
                          <Button
                            variant="default"
                            type="submit"
                            disabled={busy}
                          >
                            {adding ? "加入待保存模型" : "保存模型"}
                          </Button>
                        </div>
                      </div>
                    </form>
                  )}
                </Tabs>
              </section>
            )}
          </div>
        </div>
      </TabsContent>
      <TabsContent value="network">
        {token && <NetworkSettingsPanel token={token} />}
      </TabsContent>
      <TabsContent value="users">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">用户角色</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              管理员与普通用户的创作功能相同，只有管理员能配置后台。
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">用户</th>
                  <th className="px-5 py-3 font-medium">邮箱</th>
                  <th className="px-5 py-3 font-medium">角色</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="whitespace-nowrap px-5 py-4">
                      {user.name}
                      {user.id === session?.user.id && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          当前账号
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {user.email}
                    </td>
                    <td className="px-5 py-4">
                      <Select
                        items={[
                          { value: "user", label: "普通用户" },
                          { value: "admin", label: "管理员" },
                        ]}
                        value={user.role}
                        disabled={busy}
                        onValueChange={(value) => {
                          if (token)
                            void perform(async () => {
                              await updateSystemRole(
                                token,
                                user.id,
                                value as AdminUser["role"],
                              );
                              setUsers((await fetchAdminUsers(token)).users);
                              await refreshRole();
                              setNotice("用户角色已更新。");
                            });
                        }}
                      >
                        <SelectTrigger
                          className="min-w-28"
                          aria-label={`${user.name} 的角色`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">普通用户</SelectItem>
                          <SelectItem value="admin">管理员</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </TabsContent>
    </Tabs>
  );
}
