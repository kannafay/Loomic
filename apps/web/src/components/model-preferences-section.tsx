"use client";

import { groupModelsByProvider } from "@/lib/model-groups";
import {
  type ModelInfo,
  type ModelKind,
  type ModelPreferences,
  modelPreferenceKinds,
} from "@loomic/shared";
import { AudioLines, Image, MessageSquare, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "./toast";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const labels = {
  text: "默认对话模型",
  audio: "默认语音模型",
  image: "默认图片模型",
  video: "默认视频模型",
};
const icons = {
  text: MessageSquare,
  audio: AudioLines,
  image: Image,
  video: Video,
};
const automatic = "__automatic__";
type Catalog = Record<ModelKind, ModelInfo[]>;

type ModelPreferencesSectionProps = {
  preferences: ModelPreferences;
  onSave: (preferences: ModelPreferences) => Promise<void>;
  fetchModels: (kind: ModelKind) => Promise<{ models: ModelInfo[] }>;
};

export function ModelPreferencesSection({
  preferences,
  onSave,
  fetchModels,
}: ModelPreferencesSectionProps) {
  const { success, error } = useToast();
  const [draft, setDraft] = useState(preferences);
  const [catalog, setCatalog] = useState<Catalog>({
    text: [],
    audio: [],
    image: [],
    video: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(preferences), [preferences]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry the same catalog request when revision changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    Promise.all(
      modelPreferenceKinds.map(
        async (kind) => [kind, (await fetchModels(kind)).models] as const,
      ),
    )
      .then((entries) => {
        if (!cancelled) setCatalog(Object.fromEntries(entries) as Catalog);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchModels, revision]);

  const hasChanges = modelPreferenceKinds.some(
    (kind) => draft[kind] !== preferences[kind],
  );
  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!hasChanges || saving || loading || loadError) return;
      setSaving(true);
      try {
        await onSave(draft);
        success("模型偏好已更新。");
      } catch {
        error("模型偏好保存失败，请重试。");
      } finally {
        setSaving(false);
      }
    },
    [hasChanges, saving, loading, loadError, onSave, draft, success, error],
  );

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">模型偏好</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        设置你的默认模型。未指定时，按列表顺序自动选择第一个可用模型。
      </p>
      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 text-sm text-destructive"
        >
          模型列表加载失败，请重试。
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            重新加载
          </Button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        {modelPreferenceKinds.map((kind) => {
          const models = catalog[kind];
          const selected = draft[kind];
          const current = models.find((model) => model.id === selected);
          const unavailable = !!selected && !current && !loading && !loadError;
          const Icon = icons[kind];
          const valueLabel = selected
            ? (current?.name ?? "所选模型不可用")
            : models.length
              ? "自动（按列表顺序）"
              : "暂无可用模型";
          return (
            <div key={kind} className="space-y-2">
              <Label
                htmlFor={`default-${kind}-model`}
                className="flex items-center gap-2"
              >
                <Icon
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                {labels[kind]}
              </Label>
              <Select
                value={selected ?? automatic}
                onValueChange={(value) => {
                  if (value)
                    setDraft((previous) => ({
                      ...previous,
                      [kind]: value === automatic ? null : value,
                    }));
                }}
                disabled={
                  loading ||
                  saving ||
                  loadError ||
                  (!models.length && !selected)
                }
                items={[
                  { value: automatic, label: "自动（按列表顺序）" },
                  ...models.map((model) => ({
                    value: model.id,
                    label: model.name,
                  })),
                ]}
              >
                <SelectTrigger
                  id={`default-${kind}-model`}
                  className="w-full"
                  aria-describedby={`default-${kind}-help`}
                >
                  <SelectValue>
                    {loading
                      ? "正在加载模型…"
                      : loadError
                        ? "模型列表加载失败"
                        : valueLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  className="max-h-80"
                >
                  <SelectGroup>
                    <SelectItem value={automatic}>
                      自动（按列表顺序）
                    </SelectItem>
                  </SelectGroup>
                  {groupModelsByProvider(models).map((group) => (
                    <SelectGroup key={group.key}>
                      <SelectLabel>{group.name}</SelectLabel>
                      {group.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p
                id={`default-${kind}-help`}
                className={`text-xs ${unavailable ? "text-destructive" : "text-muted-foreground"}`}
              >
                {loading
                  ? "正在读取可用模型。"
                  : loadError
                    ? "重新加载后即可选择模型。"
                    : unavailable
                      ? "所选模型已停用或不存在，使用前请重新选择。"
                      : !selected && models[0]
                        ? `当前自动选择：${models[0].name}`
                        : !models.length
                          ? "该类型暂无可用模型。"
                          : "优先使用此模型，已有画布框保留自己的选择。"}
              </p>
            </div>
          );
        })}
        <Button
          type="submit"
          size="sm"
          disabled={saving || loading || loadError || !hasChanges}
        >
          {saving ? "正在保存…" : "保存偏好"}
        </Button>
      </form>
    </section>
  );
}
