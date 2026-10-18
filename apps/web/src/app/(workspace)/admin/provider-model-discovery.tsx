"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  discoverDraftProviderModels,
  fetchProviderModels,
  importDiscoveredModels,
} from "@/lib/model-admin-api";
import type {
  ConfiguredModel,
  DiscoveredModel,
  DiscoveredModelImport,
  ModelKind,
  ProviderConnection,
} from "@loomic/shared";
import {
  AlertCircleIcon,
  CheckIcon,
  DownloadIcon,
  LoaderCircleIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const KINDS: Array<{ id: ModelKind; name: string }> = [
  { id: "text", name: "文本" },
  { id: "audio", name: "语音" },
  { id: "image", name: "图片" },
  { id: "video", name: "视频生成" },
];
type ModelChoice = DiscoveredModel & { selected: boolean };
type ModelFilter = ModelKind | "all" | "unknown";

export function ProviderModelDiscovery({
  token,
  providerId,
  providerName,
  connection,
  onStage,
  existingModels,
  busy,
  onBusyChange,
  onClose,
  onManualAdd,
  onImported,
}: {
  token: string;
  providerId?: string;
  providerName: string;
  connection?: ProviderConnection;
  onStage?: (
    models: DiscoveredModelImport["models"],
  ) => Promise<{ imported: number; skipped: number }>;
  existingModels: ConfiguredModel[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onManualAdd: () => void;
  onImported: (result: { imported: number; skipped: number }) => Promise<void>;
}) {
  const { error: showError } = useToast();
  const [open, setOpen] = useState(true);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ModelFilter>("all");
  const [revision, setRevision] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const manualRequested = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers an explicit retry of the same saved connection.
  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError("");
    setModels([]);
    setFilter("all");
    const request = providerId
      ? fetchProviderModels(token, providerId)
      : connection
        ? discoverDraftProviderModels(token, connection)
        : Promise.reject(new Error("请先填写提供商接口。"));
    void request
      .then((result) => {
        if (canceled) return;
        setModels(
          result.models.map((model) => ({ ...model, selected: false })),
        );
        setTruncated(result.truncated);
      })
      .catch((err) => {
        if (!canceled)
          setError(err instanceof Error ? err.message : "获取模型列表失败。");
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [token, providerId, connection, revision]);

  const isExisting = (model: ModelChoice) =>
    existingModels.some(
      (existing) =>
        existing.apiModel === model.apiModel && existing.kind === model.kind,
    );
  const matches = (model: ModelChoice) =>
    (filter === "all" ||
      (filter === "unknown" ? !model.kind : model.kind === filter)) &&
    `${model.name} ${model.apiModel}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  const visible = models.filter(matches);
  const selected = models.filter(
    (model): model is ModelChoice & { kind: ModelKind } =>
      model.selected && model.kind !== null && !isExisting(model),
  );
  const selectable = visible.filter(
    (model) => model.kind && !isExisting(model),
  );
  const filters: Array<{ id: ModelFilter; name: string; count: number }> = [
    { id: "all", name: "全部", count: models.length },
    ...KINDS.map((kind) => ({
      ...kind,
      name: kind.id === "video" ? "视频" : kind.name,
      count: models.filter((model) => model.kind === kind.id).length,
    })),
    {
      id: "unknown",
      name: "待分类",
      count: models.filter((model) => !model.kind).length,
    },
  ];
  function update(id: string, patch: Partial<ModelChoice>) {
    setModels((current) =>
      current.map((model) =>
        model.apiModel === id ? { ...model, ...patch } : model,
      ),
    );
  }
  async function importSelection() {
    if (busy || importing || !selected.length) return;
    setImporting(true);
    setError("");
    onBusyChange(true);
    try {
      const choices = selected.map(({ apiModel, name, description, kind }) => ({
        apiModel,
        name,
        description,
        kind,
      }));
      const result = onStage
        ? await onStage(choices)
        : providerId
          ? await importDiscoveredModels(token, providerId, { models: choices })
          : { imported: 0, skipped: 0 };
      await onImported(result);
    } catch (err) {
      showError(err instanceof Error ? err.message : "模型导入失败，请重试。");
    } finally {
      setImporting(false);
      onBusyChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !importing) setOpen(false);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (nextOpen) return;
        if (manualRequested.current) onManualAdd();
        else onClose();
      }}
    >
      <DialogContent
        scrollable={false}
        className="flex h-[min(42rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={!importing}
        initialFocus={searchInput}
        finalFocus={() => !manualRequested.current}
      >
        <section
          className="flex min-h-0 flex-1 flex-col"
          aria-label="获取的模型列表"
        >
          <header className="shrink-0 border-b border-border px-5 py-4 pr-12">
            <DialogTitle className="text-base">获取模型列表</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5">
              {providerName}：
              {providerId
                ? "勾选需要的模型，添加后可在模型列表中启用。"
                : "使用当前连接获取，保存提供商时一起生效。"}
            </DialogDescription>
          </header>
          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(value as ModelFilter)}
            className="min-h-0 flex-1 gap-0"
          >
            <div className="shrink-0 space-y-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    ref={searchInput}
                    aria-label="搜索模型"
                    placeholder="搜索模型名称或 ID"
                    value={query}
                    disabled={busy}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-9 pl-9"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={busy || loading}
                  onClick={() => setRevision((value) => value + 1)}
                  className="h-9 shrink-0"
                >
                  <RefreshCwIcon aria-hidden="true" className="size-3.5" />
                  <span className="sr-only sm:not-sr-only">重新获取</span>
                </Button>
              </div>
              <TabsList aria-label="筛选模型类型" className="h-8 w-full">
                {filters.map((item) => (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    disabled={busy || loading}
                    className="min-w-0 gap-1 px-1.5 text-xs sm:px-3"
                  >
                    {item.name}
                    {!loading && (
                      <span className="hidden text-[10px] tabular-nums text-muted-foreground sm:inline">
                        {item.count}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4 text-xs sm:px-5">
              <p className="text-muted-foreground" aria-live="polite">
                {loading
                  ? "正在获取…"
                  : `显示 ${visible.length} / ${models.length} 个模型`}
              </p>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="h-7 px-2 text-xs"
                disabled={busy || loading || !selectable.length}
                onClick={() =>
                  setModels((current) =>
                    current.map((model) =>
                      matches(model) && model.kind && !isExisting(model)
                        ? { ...model, selected: true }
                        : model,
                    ),
                  )
                }
              >
                全选当前结果
              </Button>
            </div>
            <TabsContent
              render={<ScrollArea orientation="vertical" />}
              value={filter}
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
            >
              {loading ? (
                <output className="flex min-h-full flex-col items-center justify-center gap-3 px-5 py-10 text-sm text-muted-foreground">
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="size-5 motion-safe:animate-spin"
                  />
                  正在获取模型列表…
                </output>
              ) : error ? (
                <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <AlertCircleIcon
                    aria-hidden="true"
                    className="mb-1 size-5 text-muted-foreground"
                  />
                  <p role="alert" className="max-w-md text-sm text-destructive">
                    {error}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    检查连接后重新获取，或直接手动添加。
                  </p>
                </div>
              ) : models.length ? (
                visible.length ? (
                  visible.map((model) => {
                    const exists = isExisting(model);
                    return (
                      <div
                        key={model.apiModel}
                        className={`flex min-h-16 items-center gap-3 border-b border-border/70 px-4 py-2.5 last:border-0 sm:px-5 ${
                          model.selected && !exists
                            ? "bg-accent-soft text-accent-soft-foreground"
                            : "hover:bg-muted/30"
                        }`}
                      >
                        <Checkbox
                          aria-label={`导入 ${model.apiModel}`}
                          title={!model.kind ? "请先选择模型类型" : undefined}
                          checked={!exists && !!model.kind && model.selected}
                          disabled={busy || exists || !model.kind}
                          onCheckedChange={(checked) =>
                            update(model.apiModel, { selected: checked })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-[13px] font-medium leading-5"
                            title={model.name}
                          >
                            {model.name}
                          </p>
                          {model.apiModel !== model.name && (
                            <p
                              className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground"
                              title={model.apiModel}
                            >
                              {model.apiModel}
                            </p>
                          )}
                          {!exists && !model.kind && (
                            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                              请选择模型类型后添加
                            </p>
                          )}
                        </div>
                        {exists ? (
                          <div className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                            <p>
                              {
                                KINDS.find((kind) => kind.id === model.kind)
                                  ?.name
                              }
                            </p>
                            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] leading-4">
                              <CheckIcon
                                aria-hidden="true"
                                className="size-3"
                              />
                              已添加
                            </span>
                          </div>
                        ) : (
                          <Select
                            items={KINDS.map((kind) => ({
                              value: kind.id,
                              label: kind.name,
                            }))}
                            value={model.kind}
                            disabled={busy}
                            onValueChange={(value) =>
                              update(model.apiModel, {
                                kind: value,
                                selected: false,
                              })
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              className="w-24 shrink-0 text-xs"
                              aria-label={`${model.apiModel} 模型类型`}
                            >
                              <SelectValue placeholder="选择类型" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {KINDS.map((kind) => (
                                  <SelectItem key={kind.id} value={kind.id}>
                                    {kind.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex min-h-full flex-col items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
                    <SearchIcon aria-hidden="true" className="size-5" />
                    <p>没有匹配的模型。</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                    >
                      清除筛选
                    </Button>
                  </div>
                )
              ) : (
                <div className="flex min-h-full items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
                  提供商没有返回可获取的模型，可继续手动添加。
                </div>
              )}
            </TabsContent>
          </Tabs>
          {truncated && !loading && (
            <output className="shrink-0 border-t border-border px-5 py-2 text-xs text-muted-foreground">
              本次仅获取了部分模型，其他模型可手动添加。
            </output>
          )}
          <footer className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-3 border-t border-border bg-muted/20 px-4 py-3 sm:flex sm:px-5">
            <div className="min-w-0 sm:flex-1">
              <div className="flex h-6 items-center gap-2">
                <p className="text-xs font-medium" aria-live="polite">
                  已选 {selected.length} 个模型
                </p>
                {!!selected.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-6 px-1 text-xs text-muted-foreground"
                    disabled={busy}
                    onClick={() =>
                      setModels((current) =>
                        current.map((model) => ({ ...model, selected: false })),
                      )
                    }
                  >
                    清空选择
                  </Button>
                )}
              </div>
              <p className="hidden text-[11px] leading-4 text-muted-foreground sm:block">
                新模型默认不启用
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={busy || importing}
              onClick={() => {
                manualRequested.current = true;
                setOpen(false);
              }}
            >
              <PencilIcon aria-hidden="true" className="size-3.5" />
              手动添加
            </Button>
            <div className="col-span-2 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
              <Button
                variant="default"
                size="sm"
                type="button"
                disabled={busy || loading || !selected.length}
                onClick={() => void importSelection()}
              >
                {importing ? (
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="size-3.5 motion-safe:animate-spin"
                  />
                ) : (
                  <DownloadIcon aria-hidden="true" className="size-3.5" />
                )}
                {importing ? "正在添加…" : `添加所选模型（${selected.length}）`}
              </Button>
            </div>
          </footer>
        </section>
      </DialogContent>
    </Dialog>
  );
}
