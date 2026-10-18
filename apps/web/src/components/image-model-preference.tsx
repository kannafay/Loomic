"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BoxIcon, LoaderCircleIcon, SearchIcon } from "lucide-react";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { useVideoModelPreference } from "../hooks/use-video-model-preference";
import type { ImageModelInfo, VideoModelInfo } from "../lib/server-api";
import { fetchImageModels, fetchVideoModels } from "../lib/server-api";

type ModelKind = "image" | "video";
type GenerationModel = ImageModelInfo | VideoModelInfo;
type ModelCatalog = {
  status: "loading" | "ready" | "error";
  models: GenerationModel[];
};
type ModelGroup = { key: string; name: string; models: GenerationModel[] };

const PROVIDER_NAMES: Record<string, string> = {
  google: "Google",
  "google-vertex": "Google Vertex AI",
  openai: "OpenAI",
  "openai-official": "OpenAI",
  agnes: "Agnes AI",
  replicate: "Replicate",
  volces: "火山引擎",
};

function useModelCatalog(
  open: boolean,
  loadModels: () => Promise<{ models: GenerationModel[] }>,
) {
  const [catalog, setCatalog] = useState<ModelCatalog>({
    status: "loading",
    models: [],
  });
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setCatalog({ status: "loading", models: [] });
    try {
      const { models } = await loadModels();
      if (currentRequest === requestId.current)
        setCatalog({ status: "ready", models });
    } catch {
      if (currentRequest === requestId.current)
        setCatalog({ status: "error", models: [] });
    }
  }, [loadModels]);

  useEffect(() => {
    if (!open) return;
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [open, load]);

  return { ...catalog, retry: load };
}

function groupModels(models: GenerationModel[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<string, ModelGroup>();
  for (const model of models) {
    const name =
      model.providerName ??
      PROVIDER_NAMES[model.provider] ??
      model.provider ??
      "其他提供商";
    const searchable =
      `${name} ${model.provider} ${model.displayName} ${model.description}`.toLowerCase();
    if (!terms.every((term) => searchable.includes(term))) continue;
    const key = model.providerId
      ? `configured:${model.providerId}`
      : `legacy:${model.provider}`;
    const group: ModelGroup = groups.get(key) ?? { key, name, models: [] };
    group.models.push(model);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function ModelOption({
  model,
  id,
  manual,
  selected,
  onToggle,
}: {
  model: GenerationModel;
  id: string;
  manual: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const content = (
    <>
      <Avatar size="sm" aria-hidden="true">
        {model.iconUrl && <AvatarImage src={model.iconUrl} alt="" />}
        <AvatarFallback>
          <BoxIcon className="size-3.5" />
        </AvatarFallback>
      </Avatar>
      <span
        className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5"
        title={model.displayName}
      >
        {model.displayName}
      </span>
      {manual && (
        <Checkbox
          id={id}
          aria-label={model.displayName}
          checked={selected}
          onCheckedChange={onToggle}
        />
      )}
    </>
  );
  return manual ? (
    <Label
      htmlFor={id}
      className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors ${selected ? "bg-accent-soft text-accent-soft-foreground hover:bg-accent/15 has-[:focus-visible]:bg-accent/15" : "hover:bg-muted has-[:focus-visible]:bg-muted"}`}
    >
      {content}
    </Label>
  ) : (
    <div className="flex min-h-10 items-center gap-3 px-2 py-2">{content}</div>
  );
}

export function ImageModelPreferencePopover({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactElement;
}) {
  const imagePreference = useImageModelPreference();
  const videoPreference = useVideoModelPreference();
  const images = useModelCatalog(open, fetchImageModels);
  const videos = useModelCatalog(open, fetchVideoModels);
  const [activeTab, setActiveTab] = useState<ModelKind>("image");
  const [queries, setQueries] = useState({ image: "", video: "" });
  const controlId = useId();
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const { preference, setMode, setPreference } =
    activeTab === "image" ? imagePreference : videoPreference;
  const catalog = activeTab === "image" ? images : videos;
  const kindLabel = activeTab === "image" ? "图片" : "视频";
  const manual = preference.mode === "manual";
  const selectedModels = catalog.models.filter((model) =>
    preference.models.includes(model.id),
  );
  const unavailableCount = preference.models.filter(
    (id) => !catalog.models.some((model) => model.id === id),
  ).length;
  const groups = groupModels(catalog.models, queries[activeTab]);

  const restoreAuto = () => {
    setMode("auto");
    modeTriggerRef.current?.focus();
  };

  const toggleModel = (id: string) => {
    // An explicit choice replaces hidden selections from disabled models.
    const liveSelection = selectedModels.map((model) => model.id);
    if (liveSelection.includes(id) && liveSelection.length === 1) {
      restoreAuto();
      return;
    }
    setPreference({
      mode: "manual",
      models: liveSelection.includes(id)
        ? liveSelection.filter((key) => key !== id)
        : [...liveSelection, id],
    });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={children} />
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        positionMethod="fixed"
        className="w-[380px] max-w-[calc(100vw-1rem)] max-h-[min(36rem,var(--available-height))] gap-0 overflow-hidden p-0"
      >
        <PopoverTitle className="sr-only">生成模型</PopoverTitle>
        <PopoverDescription className="sr-only">
          用于图片和视频生成，对话模型在输入框左侧选择。
        </PopoverDescription>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === "image" || value === "video") setActiveTab(value);
          }}
          className="min-h-0 gap-0"
        >
          <div className="shrink-0 px-3 pt-3">
            <TabsList aria-label="生成模型类型" className="w-full">
              <TabsTrigger value="image">图片</TabsTrigger>
              <TabsTrigger value="video">视频</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            key={activeTab}
            value={activeTab}
            className="flex min-h-0 flex-col"
          >
            <div className="shrink-0 space-y-2 px-3 py-2">
              <p id={`${controlId}-mode-description`} className="sr-only">
                {manual
                  ? `助手仅从勾选的模型中选择，执行${kindLabel}任务；多选不会同时生成。`
                  : `助手从全部已启用的${kindLabel}模型中自动选择。`}
              </p>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="search"
                    aria-label={`搜索${kindLabel}模型或提供商`}
                    placeholder="搜索模型或提供商"
                    value={queries[activeTab]}
                    onChange={(event) =>
                      setQueries((previous) => ({
                        ...previous,
                        [activeTab]: event.target.value,
                      }))
                    }
                    className="pl-8 text-xs md:text-xs"
                  />
                </div>
                <Select
                  value={preference.mode}
                  onValueChange={(value) => {
                    if (value === "auto" || value === "manual") setMode(value);
                  }}
                  items={[
                    { value: "auto", label: "自动选择" },
                    { value: "manual", label: "指定模型" },
                  ]}
                >
                  <SelectTrigger
                    ref={modeTriggerRef}
                    aria-label={`${kindLabel}模型选择方式`}
                    aria-describedby={`${controlId}-mode-description`}
                    title={
                      manual
                        ? "仅从勾选的模型中挑选，可多选，不会批量生成。"
                        : "从全部已启用模型中自动选择。"
                    }
                    className="h-8 shrink-0 px-2 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="end"
                    alignItemWithTrigger={false}
                    positionMethod="fixed"
                    className="min-w-44"
                  >
                    <SelectGroup>
                      <SelectItem value="auto">自动选择</SelectItem>
                      <SelectItem value="manual">指定模型（可多选）</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {manual && catalog.status === "ready" && unavailableCount > 0 && (
                <p
                  className="px-1 text-xs leading-relaxed text-destructive"
                  role="alert"
                >
                  {unavailableCount} 个已选模型已停用或不可用，请重新选择。
                </p>
              )}
            </div>
            <ScrollArea
              orientation="vertical"
              className="min-h-0 max-h-64 overflow-y-auto overscroll-contain px-2 pb-2"
              aria-busy={catalog.status === "loading"}
            >
              {catalog.status === "loading" ? (
                <output className="flex min-h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                  正在加载{kindLabel}模型…
                </output>
              ) : catalog.status === "error" ? (
                <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
                  <p role="alert">{kindLabel}模型加载失败，请重试。</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={catalog.retry}
                  >
                    重新加载
                  </Button>
                </div>
              ) : catalog.models.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                  暂无可用模型，请管理员先启用。
                </p>
              ) : groups.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                  没有匹配的模型或提供商，试试其他关键词。
                </p>
              ) : (
                groups.map((group) => (
                  <fieldset key={group.key} className="min-w-0 pb-2 last:pb-0">
                    <legend className="w-full px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                      {group.name}
                      <span className="ml-2 font-normal tabular-nums">
                        {group.models.length}
                      </span>
                    </legend>
                    {group.models.map((model) => (
                      <ModelOption
                        key={model.id}
                        model={model}
                        id={`${controlId}-${model.id}`}
                        manual={manual}
                        selected={preference.models.includes(model.id)}
                        onToggle={() => toggleModel(model.id)}
                      />
                    ))}
                  </fieldset>
                ))
              )}
            </ScrollArea>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3 text-xs">
              <output className="font-medium">
                {manual
                  ? catalog.status === "ready"
                    ? `已选 ${selectedModels.length} 个${kindLabel}模型`
                    : `已指定 ${preference.models.length} 个${kindLabel}模型`
                  : `自动选择${kindLabel}模型`}
              </output>
              {manual ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={restoreAuto}
                  title="取消指定，恢复自动选择"
                  className="-my-1 -mr-2 text-muted-foreground"
                >
                  恢复自动
                </Button>
              ) : (
                <span className="text-muted-foreground">
                  {catalog.status === "ready"
                    ? `共 ${catalog.models.length} 个可用`
                    : ""}
                </span>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
