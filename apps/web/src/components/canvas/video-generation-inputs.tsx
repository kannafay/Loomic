"use client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Plus, X } from "lucide-react";
import { useRef } from "react";
import type {
  VideoExtensionSource,
  VideoModelInfo,
} from "../../lib/server-api";
import { AgnesVideoInputs } from "./agnes-video-inputs";

export type VideoInputMode = "text" | "frames" | "reference" | "extend";
export type VideoFrame = { dataUrl: string; name: string };

export function VideoGenerationInputs({
  mode,
  onModeChange,
  model,
  firstFrame,
  lastFrame,
  references,
  onFirstFrame,
  onLastFrame,
  onReferences,
  sources,
  sourceJobId,
  onSourceChange,
  sourcesLoading,
  disabled,
  onError,
  referenceAudios,
  referenceVideo,
  onReferenceAudios,
  onReferenceVideo,
}: {
  mode: VideoInputMode;
  onModeChange: (mode: VideoInputMode) => void;
  model?: VideoModelInfo | undefined;
  firstFrame: VideoFrame | null;
  lastFrame: VideoFrame | null;
  references: VideoFrame[];
  onFirstFrame: (frame: VideoFrame | null) => void;
  onLastFrame: (frame: VideoFrame | null) => void;
  onReferences: (images: VideoFrame[]) => void;
  sources: VideoExtensionSource[];
  sourceJobId: string;
  onSourceChange: (id: string) => void;
  sourcesLoading: boolean;
  disabled: boolean;
  onError: (message: string) => void;
  referenceAudios: string[];
  referenceVideo: string;
  onReferenceAudios: (urls: string[]) => void;
  onReferenceVideo: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<"first" | "last" | "reference">("first");
  const caps = model?.capabilities;
  const maxReferences = model?.limits?.maxInputImages ?? 3;
  const modes: Array<{
    id: VideoInputMode;
    label: string;
    available: boolean;
  }> = [
    { id: "text", label: "文字生成", available: true },
    {
      id: "frames",
      label: caps?.lastFrame ? "首尾帧" : "首帧",
      available: !!caps?.imageToVideo,
    },
    {
      id: "reference",
      label: model?.provider === "agnes" ? "素材参考" : "多图参考",
      available: !!caps?.referenceImages,
    },
    { id: "extend", label: "视频延长", available: !!caps?.videoExtension },
  ];
  const upload = (target: "first" | "last" | "reference") => {
    targetRef.current = target;
    if (inputRef.current) {
      inputRef.current.multiple = target === "reference";
      inputRef.current.click();
    }
  };
  const preview = (
    frame: VideoFrame | null,
    label: string,
    onUpload: (() => void) | null,
    onRemove: () => void,
  ) => (
    <div className="relative shrink-0">
      {frame && !onUpload ? (
        <img
          src={frame.dataUrl}
          alt={label}
          className="h-[68px] w-[56px] rounded-2xl object-cover"
        />
      ) : (
        <Button
          size="icon"
          variant="ghost"
          type="button"
          aria-label={`上传${label}`}
          onClick={onUpload ?? undefined}
          disabled={disabled}
          className="flex h-[68px] w-[56px] flex-col items-center justify-center gap-1 rounded-2xl bg-muted/60 hover:bg-muted disabled:opacity-50"
        >
          {frame ? (
            <img
              src={frame.dataUrl}
              alt={label}
              className="h-full w-full rounded-2xl object-cover"
            />
          ) : (
            <>
              <Plus className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </>
          )}
        </Button>
      )}
      {frame && (
        <Button
          variant="outline"
          type="button"
          aria-label={`移除${label}`}
          onClick={onRemove}
          disabled={disabled}
          className="absolute -right-1 -top-1 rounded-full border border-border bg-card p-0.5"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => onModeChange(value as VideoInputMode)}
      className="gap-3 px-3 pt-3"
    >
      <TabsList aria-label="视频生成模式" className="max-w-full">
        {modes
          .filter((item) => item.available)
          .map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              disabled={disabled}
              className="px-2.5 text-xs"
            >
              {item.label}
            </TabsTrigger>
          ))}
      </TabsList>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="上传视频参考图片"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          const target = targetRef.current;
          event.target.value = "";
          if (!files.length) return;
          if (
            target === "reference" &&
            references.length + files.length > maxReferences
          ) {
            onError(`最多上传 ${maxReferences} 张参考图。`);
            return;
          }
          if (
            files.some(
              (file) =>
                !["image/png", "image/jpeg", "image/webp"].includes(
                  file.type,
                ) || file.size > 8 * 1024 * 1024,
            )
          ) {
            onError("请选择 PNG、JPEG 或 WebP 图片，每张不超过 8 MB。");
            return;
          }
          try {
            const images = await Promise.all(
              files.map(
                (file) =>
                  new Promise<VideoFrame>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onerror = reject;
                    reader.onload = () =>
                      resolve({
                        dataUrl: String(reader.result),
                        name: file.name,
                      });
                    reader.readAsDataURL(file);
                  }),
              ),
            );
            if (target === "reference") {
              const nextImages = [...references, ...images];
              const totalBytes = nextImages.reduce(
                (sum, frame) =>
                  sum +
                  (frame.dataUrl.startsWith("data:")
                    ? (frame.dataUrl.length - frame.dataUrl.indexOf(",") - 1) *
                      0.75
                    : 0),
                0,
              );
              if (totalBytes > 32 * 1024 * 1024) {
                onError("参考图片总大小不能超过 32 MB，请压缩后重试。");
                return;
              }
              onReferences(nextImages);
            } else if (target === "first") onFirstFrame(images[0]!);
            else onLastFrame(images[0]!);
          } catch {
            onError("图片读取失败，请重新选择。");
          }
        }}
      />
      <TabsContent value={mode}>
        {mode === "frames" && (
          <div className="flex items-center gap-2">
            {preview(
              firstFrame,
              "首帧",
              () => upload("first"),
              () => onFirstFrame(null),
            )}
            {caps?.lastFrame &&
              preview(
                lastFrame,
                "尾帧",
                () => upload("last"),
                () => onLastFrame(null),
              )}
            <p className="ml-1 text-[11px] leading-5 text-muted-foreground">
              {model?.provider === "agnes"
                ? "上传首帧、尾帧或两者均可。"
                : caps?.lastFrame
                  ? "首帧必填，尾帧可选。"
                  : "上传图片，让画面动起来。"}
            </p>
          </div>
        )}
        {mode === "reference" && (
          <div className="flex flex-wrap items-center gap-2">
            {references.map((frame, index) => (
              <div key={`${index}-${frame.name}`}>
                {preview(frame, `参考图 ${index + 1}`, null, () =>
                  onReferences(references.filter((_, i) => i !== index)),
                )}
              </div>
            ))}
            {references.length < maxReferences &&
              preview(
                null,
                "参考图",
                () => upload("reference"),
                () => {},
              )}
            <p className="ml-1 text-[11px] leading-5 text-muted-foreground">
              最多 {maxReferences} 张，参考人物、物品或场景。
              <br />
              {model?.provider === "agnes"
                ? "可直接上传本地图片，时长 4–12 秒。"
                : "生成时长为 8 秒。"}
            </p>
          </div>
        )}
        {mode === "extend" && (
          <div className="space-y-2">
            <Select
              value={sourceJobId}
              onValueChange={(value) => onSourceChange(value ?? "")}
              disabled={disabled || sourcesLoading}
              items={[
                {
                  value: "",
                  label: sourcesLoading
                    ? "正在加载视频…"
                    : "选择已有的 Veo 视频",
                },
                ...sources.map((source) => ({
                  value: source.jobId,
                  label: `${source.prompt.slice(0, 40)} · ${source.duration} 秒`,
                })),
              ]}
            >
              <SelectTrigger aria-label="选择要延长的视频" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} className="p-1">
                <SelectItem value="">选择已有的 Veo 视频</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source.jobId} value={source.jobId}>
                    {source.prompt.slice(0, 40)} · {source.duration} 秒
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-5 text-muted-foreground">
              {!sourcesLoading && sources.length === 0
                ? "暂无可延长的视频。请先生成一段 720p 的 Veo 视频。"
                : "每次续写 7 秒，保留原比例，以 720p 输出。"}{" "}
              仅显示最近两天内、不超过 141 秒的视频。
            </p>
          </div>
        )}
        {model?.provider === "agnes" && (
          <AgnesVideoInputs
            key={model.id}
            mode={mode}
            model={model}
            firstFrame={firstFrame}
            lastFrame={lastFrame}
            references={references}
            referenceAudios={referenceAudios}
            referenceVideo={referenceVideo}
            onFirstFrame={onFirstFrame}
            onLastFrame={onLastFrame}
            onReferences={onReferences}
            onReferenceAudios={onReferenceAudios}
            onReferenceVideo={onReferenceVideo}
            disabled={disabled}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
