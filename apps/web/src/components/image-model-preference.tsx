"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ReactElement, useEffect, useId, useState } from "react";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { useVideoModelPreference } from "../hooks/use-video-model-preference";
import type { ImageModelInfo, VideoModelInfo } from "../lib/server-api";
import { fetchImageModels, fetchVideoModels } from "../lib/server-api";

export function ImageModelPreferencePopover({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactElement;
}) {
  const { preference, setMode, setPreference } = useImageModelPreference();
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"image" | "video">("image");
  const videoPreference = useVideoModelPreference();
  const [videoModels, setVideoModels] = useState<VideoModelInfo[]>([]);

  const controlId = useId();
  useEffect(() => {
    if (!open) return;
    let canceled = false;
    fetchImageModels()
      .then((data) => {
        if (!canceled) setModels(data.models);
      })
      .catch(() => {});
    fetchVideoModels()
      .then((data) => {
        if (!canceled) setVideoModels(data.models);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [open]);

  const currentPreference =
    activeTab === "image" ? preference : videoPreference.preference;
  const currentModels = activeTab === "image" ? models : videoModels;
  const currentSetMode =
    activeTab === "image" ? setMode : videoPreference.setMode;
  const currentSetPreference =
    activeTab === "image" ? setPreference : videoPreference.setPreference;
  const unavailableSelection =
    currentPreference.mode === "manual" &&
    currentPreference.models.some(
      (id) => !currentModels.some((model) => model.id === id),
    );
  const currentToggleModel = (id: string) => {
    // A new explicit choice replaces stale selections hidden by admin disablement.
    const liveSelection = currentPreference.models.filter((key) =>
      currentModels.some((model) => model.id === key),
    );
    if (liveSelection.includes(id) && liveSelection.length === 1) return;
    currentSetPreference({
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
        aria-label="生成模型偏好"
        className="w-[380px] max-w-[calc(100vw-1rem)] p-3"
      >
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "image" | "video")}
        >
          <TabsList aria-label="生成模型类型" className="w-full">
            <TabsTrigger value="image">图片</TabsTrigger>
            <TabsTrigger value="video">视频</TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                {activeTab === "image" ? "图片模型" : "视频模型"}
              </span>
              <Label
                className="gap-2 pr-3 text-xs"
                htmlFor={`${controlId}-auto`}
              >
                {currentPreference.mode === "auto" ? "自动" : "手动"}
                <Switch
                  id={`${controlId}-auto`}
                  aria-label="自动选择模型"
                  size="sm"
                  checked={currentPreference.mode === "auto"}
                  onCheckedChange={(checked) =>
                    currentSetMode(checked ? "auto" : "manual")
                  }
                />
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {currentPreference.mode === "auto"
                ? `智能助手会为每次${activeTab === "image" ? "图片" : "视频"}任务自动选择合适的模型`
                : `智能助手会从你选择的模型中执行${activeTab === "image" ? "图片" : "视频"}任务`}
            </p>
            {unavailableSelection && (
              <p className="text-xs text-muted-foreground">
                之前选择的模型已停用，请重新选择。
              </p>
            )}
            <div className="max-h-[300px] space-y-1 overflow-x-hidden overflow-y-auto">
              {currentModels.length === 0 && (
                <p className="px-2 py-4 text-xs text-muted-foreground">
                  暂无可用模型，请管理员先启用。
                </p>
              )}
              {currentModels.map((candidate) => {
                const selected = currentPreference.models.includes(
                  candidate.id,
                );
                const id = `${controlId}-${candidate.id}`;
                return (
                  <Label
                    key={candidate.id}
                    htmlFor={id}
                    className={`flex w-full cursor-pointer gap-3 rounded-lg p-2 pr-4 hover:bg-muted ${selected ? "bg-accent/10" : ""}`}
                  >
                    {candidate.iconUrl && (
                      <img
                        src={candidate.iconUrl}
                        alt=""
                        className="size-5 shrink-0 rounded-full object-cover"
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[13px] font-medium">
                        {candidate.displayName}
                      </span>
                      <span className="text-xs font-normal leading-relaxed text-muted-foreground">
                        {candidate.description}
                      </span>
                    </span>
                    <Checkbox
                      id={id}
                      aria-label={candidate.displayName}
                      checked={selected}
                      onCheckedChange={() => currentToggleModel(candidate.id)}
                    />
                  </Label>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
