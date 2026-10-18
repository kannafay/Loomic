"use client";

import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
import { DownloadIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const KINDS: Array<{ id: ModelKind; name: string }> = [
  { id: "text", name: "文本" },
  { id: "audio", name: "语音" },
  { id: "image", name: "图片" },
  { id: "video", name: "视频生成" },
];
type ModelChoice = DiscoveredModel & { selected: boolean };

export function ProviderModelDiscovery({
  token,
  providerId,
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
  const [revision, setRevision] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const manualRequested = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers an explicit retry of the same saved connection.
  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError("");
    setModels([]);
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
  function update(id: string, patch: Partial<ModelChoice>) {
    setModels((current) =>
      current.map((model) =>
        model.apiModel === id ? { ...model, ...patch } : model,
      ),
    );
  }
  async function importSelection() {
    if (!selected.length) return;
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
        className="max-h-[85vh] overflow-y-auto p-0 sm:max-w-3xl"
        showCloseButton={!importing}
        finalFocus={() => !manualRequested.current}
      >
        <section className="px-6 py-5" aria-label="获取的模型列表">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle>添加模型</DialogTitle>
              <DialogDescription className="mt-2 pr-4 text-xs">
                {providerId
                  ? "获取已保存提供商的模型列表，勾选添加后可在对应标签中启用。"
                  : "使用当前填写的接口和 Key 获取列表。勾选的模型将在保存提供商时一起添加。"}
              </DialogDescription>
            </div>
            <div className="flex gap-2 pr-6">
              <Button
                variant="outline"
                type="button"
                disabled={busy || loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                <RefreshCwIcon aria-hidden="true" className="size-3.5" />
                重新获取
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {loading ? (
            <output className="block py-6 text-sm text-muted-foreground">
              正在获取模型列表…
            </output>
          ) : models.length ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Input
                  aria-label="搜索模型"
                  placeholder="搜索模型名称或 ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy || !selectable.length}
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
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy || !selected.length}
                  onClick={() =>
                    setModels((current) =>
                      current.map((model) => ({ ...model, selected: false })),
                    )
                  }
                >
                  清空选择
                </Button>
              </div>
              <p className="my-2 text-xs text-muted-foreground">
                共获取 {models.length} 个模型
                {query.trim() ? `，匹配 ${visible.length} 个` : ""}
                。类型为建议值，可自行修改。
              </p>
              {truncated && (
                <p className="mb-2 text-xs text-amber-700">
                  本次仅获取了部分模型，其他模型可手动添加。
                </p>
              )}
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background">
                {visible.map((model) => {
                  const exists = isExisting(model);
                  return (
                    <div
                      key={model.apiModel}
                      className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0"
                    >
                      <Checkbox
                        aria-label={`导入 ${model.apiModel}`}
                        title={!model.kind ? "请先选择模型类型" : undefined}
                        checked={!exists && !!model.kind && model.selected}
                        disabled={busy || exists || !model.kind}
                        onCheckedChange={(checked) =>
                          update(model.apiModel, {
                            selected: checked,
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-medium"
                          title={model.name}
                        >
                          {model.name}
                        </p>
                        <p
                          className="mt-0.5 truncate text-xs text-muted-foreground"
                          title={model.apiModel}
                        >
                          {model.apiModel}
                        </p>
                      </div>
                      {exists && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          已添加
                        </span>
                      )}
                      <Select
                        items={KINDS.map((kind) => ({
                          value: kind.id,
                          label: kind.name,
                        }))}
                        value={model.kind}
                        disabled={busy || exists}
                        onValueChange={(value) =>
                          update(model.apiModel, {
                            kind: value,
                            selected: false,
                          })
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-28 shrink-0"
                          aria-label={`${model.apiModel} 模型类型`}
                        >
                          <SelectValue placeholder="请选择类型" />
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
                    </div>
                  );
                })}
                {!visible.length && (
                  <p className="px-3 py-6 text-sm text-muted-foreground">
                    没有匹配的模型。
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  已选 {selected.length}{" "}
                  个。已添加的模型会跳过，新模型默认不启用。
                </p>
                <Button
                  variant="default"
                  type="button"
                  disabled={busy || !selected.length}
                  onClick={() => void importSelection()}
                >
                  <DownloadIcon aria-hidden="true" className="size-3.5" />
                  {importing
                    ? "正在添加…"
                    : `添加所选模型（${selected.length}）`}
                </Button>
              </div>
            </>
          ) : (
            !error && (
              <p className="py-6 text-sm text-muted-foreground">
                提供商没有返回可获取的模型，可继续手动添加。
              </p>
            )
          )}
          {!loading && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {error
                  ? "可以重新获取，也可以直接填写模型信息。"
                  : "列表中没有需要的模型？也可以手动添加。"}
              </p>
              <Button
                variant={error || !models.length ? "default" : "outline"}
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
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
