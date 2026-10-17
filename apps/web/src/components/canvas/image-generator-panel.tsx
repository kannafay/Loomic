"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { ImageUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useGenerationErrorHandler } from "../../hooks/use-generation-error-handler";
import {
  createExcalidrawImageElement,
  fetchAsDataURL,
} from "../../lib/canvas-elements";
import {
  type ImageGeneratorData,
  resizeImageGeneratorElement,
  updateImageGeneratorElement,
} from "../../lib/canvas-image-generator";
import type { ImageModelInfo } from "../../lib/server-api";
import { fetchImageModels, generateImageDirect } from "../../lib/server-api";

type ImageGeneratorPanelProps = {
  hidden?: boolean;
  elementId: string;
  elementBounds: { x: number; y: number; width: number; height: number };
  data: ImageGeneratorData;
  excalidrawApi: any;
  accessToken: string;
  canvasScrollZoom: { scrollX: number; scrollY: number; zoom: number };
  onClose: () => void;
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
  onClose,
}: ImageGeneratorPanelProps) {
  const [prompt, setPrompt] = useState(data.prompt);
  const [model, setModel] = useState(data.model);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio);
  const [quality, setQuality] = useState(data.quality);
  const [loading, setLoading] = useState(data.status === "generating");
  const [error, setError] = useState<string | null>(data.errorMessage ?? null);
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [refImages, setRefImages] = useState<
    Array<{ id: string; dataUrl: string; file: File }>
  >([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const { handleGenerationError } = useGenerationErrorHandler();
  // AbortController for in-flight generation requests so we can cancel on unmount
  const abortRef = useRef<AbortController | null>(null);

  // Fetch available models with error logging
  useEffect(() => {
    let cancelled = false;
    fetchImageModels()
      .then((r) => {
        if (!cancelled) setModels(r.models);
      })
      .catch((err) => {
        console.warn("[image-gen] Failed to fetch models:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cancel in-flight generation on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [prompt]);

  // Calculate panel screen position from canvas coordinates
  const { scrollX, scrollY, zoom } = canvasScrollZoom;
  const screenX = (elementBounds.x + scrollX) * zoom;
  const screenY = (elementBounds.y + elementBounds.height + scrollY) * zoom + 8;

  const currentModel = models.find((m) => m.id === model);

  const handleAspectRatioChange = useCallback(
    (ratio: string) => {
      setAspectRatio(ratio);
      resizeImageGeneratorElement(excalidrawApi, elementId, ratio);
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
    if (!prompt.trim() || loading) return;

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    updateImageGeneratorElement(excalidrawApi, elementId, {
      status: "generating",
      prompt: prompt.trim(),
      model,
      aspectRatio,
      quality,
    });

    try {
      const result = await generateImageDirect(
        accessTokenRef.current,
        prompt.trim(),
        { model, aspectRatio, quality },
      );

      // Check if this generation was cancelled while awaiting
      if (controller.signal.aborted) return;

      // Download and insert as real image element at same position
      const dataURL = await fetchAsDataURL(result.url);
      if (controller.signal.aborted) return;

      const fileId = generateId();
      excalidrawApi.addFiles([
        {
          id: fileId,
          dataURL,
          mimeType: result.mimeType,
          created: Date.now(),
        },
      ]);

      const imageElement = createExcalidrawImageElement({
        fileId,
        x: elementBounds.x,
        y: elementBounds.y,
        width: elementBounds.width,
        height: elementBounds.height,
        title: prompt.trim().slice(0, 60),
      });

      // Replace: delete placeholder, add image
      const elements = excalidrawApi.getSceneElements().map((el: any) => {
        if (el.id === elementId) return { ...el, isDeleted: true };
        return el;
      });
      excalidrawApi.updateScene({
        elements: [...elements, imageElement],
        captureUpdate: "IMMEDIATELY",
      });

      onClose();
    } catch (err) {
      // Ignore aborted requests (user cancelled or component unmounted)
      if (controller.signal.aborted) return;

      console.error("[image-gen] Generation error:", err);
      const handled = handleGenerationError(err);
      if (!handled) {
        setError("图片生成失败，请重试或更换模型。");
      }
      setLoading(false);
      updateImageGeneratorElement(excalidrawApi, elementId, {
        status: "error",
        errorMessage: "生成失败",
      });
    }
  }, [
    prompt,
    loading,
    model,
    aspectRatio,
    quality,
    excalidrawApi,
    elementId,
    elementBounds,
    onClose,
    handleGenerationError,
  ]);

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
            disabled={loading || !models.length}
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
              <SelectValue>
                {currentModel?.displayName ?? model.split("/").pop()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              alignItemWithTrigger={false}
              className="w-64 p-1"
            >
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
              Array.from(files).forEach((file) => {
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
              });
              e.target.value = "";
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            type="button"
            onClick={() => refInputRef.current?.click()}
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
              className="min-w-24 p-1"
            >
              {QUALITIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
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
              className="min-w-24 p-1"
            >
              {ASPECT_RATIOS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Generate button */}
          <Button
            size="icon"
            variant="default"
            type="button"
            onClick={() => void handleGenerate()}
            aria-label={loading ? "正在生成图片" : "生成图片"}
            disabled={!prompt.trim() || loading}
            className="flex h-8 min-w-12 items-center justify-center gap-1 rounded-full bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/80 hover:accent-glow disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {loading ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
            ) : (
              <svg
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
