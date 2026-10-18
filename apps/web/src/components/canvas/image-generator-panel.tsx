"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { ImageUp, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useGenerationErrorHandler } from "../../hooks/use-generation-error-handler";
import {
  generateCanvasImage,
  isCanvasImageGenerating,
  stopCanvasImageGeneration,
} from "../../lib/canvas-image-generation";
import {
  type ImageGeneratorData,
  resizeImageGeneratorElement,
  updateImageGeneratorElement,
} from "../../lib/canvas-image-generator";
import type { ImageModelInfo } from "../../lib/server-api";
import { fetchImageModels } from "../../lib/server-api";

type ImageGeneratorPanelProps = {
  hidden?: boolean;
  elementId: string;
  elementBounds: { x: number; y: number; width: number; height: number };
  data: ImageGeneratorData;
  excalidrawApi: ExcalidrawImperativeAPI;
  accessToken: string;
  canvasScrollZoom: { scrollX: number; scrollY: number; zoom: number };
};

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
const QUALITIES = [
  { value: "standard", label: "1K" },
  { value: "hd", label: "2K" },
  { value: "ultra", label: "4K" },
] as const;

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

export function ImageGeneratorPanel({
  hidden = false,
  elementId,
  elementBounds,
  data,
  excalidrawApi,
  accessToken,
  canvasScrollZoom,
}: ImageGeneratorPanelProps) {
  const [prompt, setPrompt] = useState(data.prompt);
  const [model, setModel] = useState(data.model);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio);
  const [quality, setQuality] = useState(data.quality);
  const [loading, setLoading] = useState(data.status === "generating");
  const [error, setError] = useState<string | null>(data.errorMessage ?? null);
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsLoadError, setModelsLoadError] = useState(false);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [refImages, setRefImages] = useState<
    Array<{ id: string; dataUrl: string; file: File }>
  >([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const { handleGenerationError } = useGenerationErrorHandler();

  // Fetch available models with error logging
  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    setModelsLoadError(false);
    fetchImageModels()
      .then((r) => {
        if (cancelled) return;
        setModels(r.models);
        const current = modelRef.current;
        if (r.models.some((candidate) => candidate.id === current)) return;
        // Older unconfigured generators used this fixed default; do not replace
        // other saved choices when an administrator disables their model.
        if (current && current !== "google/nano-banana-2") return;
        const initial =
          r.models.find((candidate) => candidate.isDefault) ?? r.models[0];
        if (!initial) return;
        modelRef.current = initial.id;
        setModel(initial.id);
        updateImageGeneratorElement(excalidrawApi, elementId, {
          model: initial.id,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setModelsLoadError(true);
        console.warn("[image-gen] Failed to fetch models:", err);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [excalidrawApi, elementId]);

  useEffect(() => {
    setLoading(data.status === "generating");
    setError(data.errorMessage ?? null);
  }, [data.status, data.errorMessage]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = prompt ? `${Math.min(ta.scrollHeight, 140)}px` : "auto";
  }, [prompt]);

  // Calculate panel screen position from canvas coordinates
  const { scrollX, scrollY, zoom } = canvasScrollZoom;
  const screenX = (elementBounds.x + scrollX) * zoom;
  const screenY = (elementBounds.y + elementBounds.height + scrollY) * zoom + 8;

  const currentModel = models.find((m) => m.id === model);
  const modelLabel = modelsLoading
    ? "正在加载模型…"
    : (currentModel?.displayName ??
      (modelsLoadError
        ? "模型加载失败"
        : models.length
          ? "请选择模型"
          : "暂无可用模型"));

  const handleAspectRatioChange = useCallback(
    (ratio: string) => {
      setAspectRatio(ratio);
      const element = excalidrawApi
        .getSceneElements()
        .find((el) => el.id === elementId);
      if (element?.type !== "image") {
        resizeImageGeneratorElement(excalidrawApi, elementId, ratio);
      }
      updateImageGeneratorElement(excalidrawApi, elementId, {
        aspectRatio: ratio,
      });
    },
    [excalidrawApi, elementId],
  );

  const handleQualityChange = useCallback(
    (q: string) => {
      setQuality(q);
      updateImageGeneratorElement(excalidrawApi, elementId, { quality: q });
    },
    [excalidrawApi, elementId],
  );

  const handleModelChange = useCallback(
    (m: string) => {
      setModel(m);
      updateImageGeneratorElement(excalidrawApi, elementId, { model: m });
    },
    [excalidrawApi, elementId],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading || modelsLoading || !currentModel) return;

    setLoading(true);
    setError(null);
    try {
      await generateCanvasImage(
        excalidrawApi,
        elementId,
        accessTokenRef.current,
        { prompt: prompt.trim(), model, aspectRatio, quality },
      );
    } catch (err) {
      console.error("[image-gen] Generation error:", err);
      handleGenerationError(err, "图片生成失败，请重试或更换模型。");
      setError("生成失败，请重试或更换模型。");
    } finally {
      if (!isCanvasImageGenerating(excalidrawApi, elementId)) setLoading(false);
    }
  }, [
    prompt,
    loading,
    modelsLoading,
    currentModel,
    model,
    aspectRatio,
    quality,
    excalidrawApi,
    elementId,
    handleGenerationError,
  ]);

  const handleStop = () => {
    stopCanvasImageGeneration(excalidrawApi, elementId);
    setLoading(false);
    setError(null);
  };

  return createPortal(
    <div
      ref={panelRef}
      hidden={hidden}
      style={{ left: screenX, top: screenY }}
      className="fixed z-[100] w-[450px] max-w-[calc(100vw-16px)] rounded-xl border-[0.5px] border-border bg-card/95 p-2 shadow-card backdrop-blur-lg"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Prompt textarea */}
      <Textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onBlur={() => {
          const element = excalidrawApi
            .getSceneElements()
            .find((el) => el.id === elementId);
          if (element?.customData?.prompt !== prompt) {
            updateImageGeneratorElement(excalidrawApi, elementId, { prompt });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleGenerate();
          }
        }}
        placeholder="今天我们要创作什么"
        disabled={loading}
        style={{ scrollbarWidth: "none" }}
        className="field-sizing-fixed border-0 shadow-none focus-visible:ring-0 min-h-[74px] max-h-[140px] w-full resize-none border-none bg-transparent p-1 text-[14px] leading-[18px] text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-scrollbar]:hidden"
      />

      {error && (
        <div className="mb-2 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="mt-1 flex items-center justify-between">
        {/* Left: model + ref image */}
        <div className="flex items-center">
          <Select
            value={model}
            onValueChange={(value) => {
              if (value) handleModelChange(value);
            }}
            disabled={loading || modelsLoading || !models.length}
            items={models.map((candidate) => ({
              value: candidate.id,
              label: candidate.displayName,
            }))}
          >
            <SelectTrigger
              aria-label="图片模型"
              className="max-w-[180px] border-transparent px-2 text-xs"
            >
              {currentModel?.iconUrl && (
                <img
                  src={currentModel.iconUrl}
                  alt=""
                  className="size-3.5 rounded-full"
                />
              )}
              <SelectValue>{modelLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              alignItemWithTrigger={false}
              className="w-64"
            >
              <SelectGroup>
                {models.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.iconUrl && (
                      <img
                        src={candidate.iconUrl}
                        alt=""
                        className="size-3.5 rounded-full"
                      />
                    )}
                    {candidate.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* Reference image upload */}
          <input
            ref={refInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (!files) return;
              for (const file of files) {
                const reader = new FileReader();
                reader.onload = () => {
                  setRefImages((prev) => [
                    ...prev,
                    {
                      id: generateId(),
                      dataUrl: reader.result as string,
                      file,
                    },
                  ]);
                };
                reader.readAsDataURL(file);
              }
              e.target.value = "";
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            type="button"
            onClick={() => refInputRef.current?.click()}
            disabled={loading}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted ${
              refImages.length > 0
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="添加参考图片"
          >
            <ImageUp className="h-3.5 w-3.5" />
          </Button>
          {/* Ref image thumbnails */}
          {refImages.length > 0 && (
            <div className="flex items-center gap-1 ml-1">
              {refImages.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.dataUrl}
                    alt="参考图片"
                    className="h-7 w-7 rounded object-cover border border-border"
                  />
                  <Button
                    size="icon"
                    variant="default"
                    type="button"
                    onClick={() =>
                      setRefImages((prev) =>
                        prev.filter((r) => r.id !== img.id),
                      )
                    }
                    className="absolute -top-1 -right-1 hidden group-hover:flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[8px]"
                  >
                    x
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: quality + ratio + generate */}
        <div className="flex items-center gap-1">
          <Select
            value={quality}
            items={QUALITIES}
            disabled={loading}
            onValueChange={(value) => {
              if (value) handleQualityChange(value);
            }}
          >
            <SelectTrigger
              aria-label="图片清晰度"
              className="border-transparent px-2 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              side="top"
              alignItemWithTrigger={false}
              className="min-w-24"
            >
              <SelectGroup>
                {QUALITIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={aspectRatio}
            items={ASPECT_RATIOS.map((value) => ({ value, label: value }))}
            disabled={loading}
            onValueChange={(value) => {
              if (value) handleAspectRatioChange(value);
            }}
          >
            <SelectTrigger
              aria-label="图片比例"
              className="border-transparent px-2 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              side="top"
              alignItemWithTrigger={false}
              className="min-w-24"
            >
              <SelectGroup>
                {ASPECT_RATIOS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* Generate button */}
          <Button
            size="icon"
            variant="default"
            type="button"
            onClick={() => (loading ? handleStop() : void handleGenerate())}
            aria-label={loading ? "停止生成图片" : "生成图片"}
            title={loading ? "停止生成" : "生成图片"}
            disabled={
              !loading && (!prompt.trim() || modelsLoading || !currentModel)
            }
            className="flex h-8 min-w-12 items-center justify-center gap-1 rounded-full bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/80 hover:accent-glow disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {loading ? (
              <Square className="size-3.5" fill="currentColor" />
            ) : (
              <svg
                aria-hidden="true"
                className="h-3.5 w-[9.3px] shrink-0"
                viewBox="0 0 8 10"
                fill="currentColor"
              >
                <path d="M6.9 4.36H5.385V.76c0-.84-.447-1.01-.991-.38L4 .835.677 4.685c-.457.525-.265.955.422.955h1.517v3.6c0 .84.446 1.01.991.38L4 9.165l3.323-3.85c.456-.525.265-.955-.422-.955" />
              </svg>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
