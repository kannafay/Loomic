"use client";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { VideoResolution } from "@loomic/shared";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useGenerationErrorHandler } from "../../hooks/use-generation-error-handler";
import {
  type VideoGeneratorData,
  resizeVideoGeneratorElement,
  updateVideoGeneratorElement,
} from "../../lib/canvas-video-generator";
import type {
  VideoExtensionSource,
  VideoModelInfo,
} from "../../lib/server-api";
import {
  fetchVideoModels,
  fetchVideoSources,
  generateVideoDirect,
} from "../../lib/server-api";
import {
  type VideoFrame,
  VideoGenerationInputs,
  type VideoInputMode,
} from "./video-generation-inputs";
// No longer needs poster frame extraction -- videos use embeddable elements

type VideoGeneratorPanelProps = {
  hidden?: boolean;
  elementId: string;
  elementBounds: { x: number; y: number; width: number; height: number };
  data: VideoGeneratorData;
  excalidrawApi: any;
  accessToken: string;
  canvasScrollZoom: { scrollX: number; scrollY: number; zoom: number };
  onClose: () => void;
};

const ASPECT_RATIOS = ["16:9", "9:16"] as const;
const DURATIONS = [4, 5, 6, 8] as const;
const VIDEO_RESOLUTIONS = ["720p", "1080p", "4k"] as const;

function supportedResolutions(
  model?: VideoModelInfo,
): readonly VideoResolution[] {
  const max = model?.limits?.maxResolution;
  if (max === "2160p") return VIDEO_RESOLUTIONS;
  if (max === "1080p") return VIDEO_RESOLUTIONS.slice(0, 2);
  return VIDEO_RESOLUTIONS.slice(0, 1);
}

export function VideoGeneratorPanel({
  hidden = false,
  elementId,
  elementBounds,
  data,
  excalidrawApi,
  accessToken,
  canvasScrollZoom,
  onClose,
}: VideoGeneratorPanelProps) {
  const [prompt, setPrompt] = useState(data.prompt);
  const [model, setModel] = useState(data.model);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio);
  const [duration, setDuration] = useState(data.duration);
  const [resolution, setResolution] = useState(data.resolution);
  const [loading, setLoading] = useState(data.status === "generating");
  const [error, setError] = useState<string | null>(data.errorMessage ?? null);
  const [models, setModels] = useState<VideoModelInfo[]>([]);
  const [showParamsPopover, setShowParamsPopover] = useState(false);
  const [mode, setMode] = useState<VideoInputMode>("text");
  const [firstFrame, setFirstFrame] = useState<VideoFrame | null>(null);
  const [lastFrame, setLastFrame] = useState<VideoFrame | null>(null);
  const [references, setReferences] = useState<VideoFrame[]>([]);
  const [referenceAudios, setReferenceAudios] = useState<string[]>([]);
  const [referenceVideo, setReferenceVideo] = useState("");
  const [sources, setSources] = useState<VideoExtensionSource[]>([]);
  const [sourceJobId, setSourceJobId] = useState("");
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ left: 8, top: 8 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const { handleGenerationError } = useGenerationErrorHandler();
  // AbortController for in-flight generation requests so we can cancel on unmount
  const abortRef = useRef<AbortController | null>(null);

  // Fetch available models with error logging
  useEffect(() => {
    let cancelled = false;
    fetchVideoModels()
      .then((r) => {
        if (cancelled) return;
        setModels(r.models);
        setModel((current) => {
          if (r.models.length === 0 || r.models.some((m) => m.id === current)) {
            return current;
          }
          const fallback = r.models[0];
          if (!fallback) return current;
          const fallbackId = fallback.id;
          updateVideoGeneratorElement(excalidrawApi, elementId, {
            model: fallbackId,
          });
          return fallbackId;
        });
      })
      .catch((err) => {
        console.warn("[video-gen] Failed to fetch models:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [excalidrawApi, elementId]);

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

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const position = () => {
      const bounds = panel.getBoundingClientRect();
      setPanelPosition({
        left: Math.max(
          8,
          Math.min(screenX, window.innerWidth - bounds.width - 8),
        ),
        top: Math.max(
          8,
          Math.min(screenY, window.innerHeight - bounds.height - 8),
        ),
      });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [screenX, screenY]);

  const currentModel = models.find((m) => m.id === model);
  const isAgnes = currentModel?.provider === "agnes";
  const isVeo = currentModel?.id.includes("/veo-") ?? false;
  const aspectRatioOptions = isAgnes
    ? ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
    : ASPECT_RATIOS;
  const availableDurations: readonly number[] =
    currentModel?.limits?.allowedDurations ?? DURATIONS;
  const resolutionOptions =
    mode === "extend"
      ? (["720p"] as const)
      : supportedResolutions(currentModel);
  const durationLocked =
    mode === "extend" ||
    (isVeo &&
      (mode === "reference" || resolution === "1080p" || resolution === "4k"));
  const durationOptions: readonly number[] = durationLocked
    ? [8]
    : availableDurations;
  const validInput =
    mode === "text" ||
    (mode === "frames" && (!!firstFrame || (isAgnes && !!lastFrame))) ||
    (mode === "reference" &&
      (references.length > 0 ||
        (isAgnes &&
          (referenceAudios.length > 0 ||
            (!!currentModel?.capabilities?.videoToVideo &&
              !!referenceVideo))))) ||
    (mode === "extend" && !!sourceJobId);

  useEffect(() => {
    const caps = currentModel?.capabilities;
    if (
      (mode === "reference" && !caps?.referenceImages) ||
      (mode === "extend" && !caps?.videoExtension) ||
      (mode === "frames" && !caps?.imageToVideo)
    )
      setMode("text");
  }, [currentModel, mode]);

  useEffect(() => {
    const nextDuration = durationOptions.includes(duration)
      ? duration
      : durationOptions.includes(8)
        ? 8
        : durationOptions[0]!;
    const nextResolution = resolutionOptions.includes(
      resolution as VideoResolution,
    )
      ? resolution
      : resolutionOptions[0]!;
    if (nextDuration !== duration || nextResolution !== resolution) {
      setDuration(nextDuration);
      setResolution(nextResolution);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        duration: nextDuration,
        resolution: nextResolution,
      });
    }
  }, [
    duration,
    resolution,
    durationLocked,
    currentModel,
    mode,
    excalidrawApi,
    elementId,
  ]);

  useEffect(() => {
    if (mode !== "extend") return;
    let cancelled = false;
    setSourcesLoading(true);
    fetchVideoSources(accessTokenRef.current)
      .then((result) => {
        if (!cancelled) setSources(result.sources);
      })
      .catch(() => {
        if (!cancelled) setError("视频记录加载失败，请重新切换模式重试。");
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const handleAspectRatioChange = useCallback(
    (ratio: string) => {
      setAspectRatio(ratio);
      resizeVideoGeneratorElement(excalidrawApi, elementId, ratio);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        aspectRatio: ratio,
      });
    },
    [excalidrawApi, elementId],
  );

  const handleDurationChange = useCallback(
    (d: number) => {
      setDuration(d);
      updateVideoGeneratorElement(excalidrawApi, elementId, { duration: d });
    },
    [excalidrawApi, elementId],
  );

  const handleResolutionChange = useCallback(
    (value: VideoResolution) => {
      setResolution(value);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        resolution: value,
      });
    },
    [excalidrawApi, elementId],
  );

  const handleModelChange = useCallback(
    (m: string) => {
      const selected = models.find((candidate) => candidate.id === m);
      const nextDurations: readonly number[] =
        selected?.limits?.allowedDurations ?? DURATIONS;
      const nextDuration = nextDurations.includes(duration)
        ? duration
        : (nextDurations[0] ?? duration);
      const nextResolutions = supportedResolutions(selected);
      const nextResolution = nextResolutions.includes(
        resolution as VideoResolution,
      )
        ? (resolution as VideoResolution)
        : (nextResolutions[0] ?? "720p");
      setModel(m);
      setDuration(nextDuration);
      setResolution(nextResolution);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        model: m,
        duration: nextDuration,
        resolution: nextResolution,
      });
    },
    [duration, excalidrawApi, elementId, models, resolution],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading || !validInput) return;
    if (
      mode === "reference" &&
      references.length > (currentModel?.limits?.maxInputImages ?? 3)
    ) {
      setError(
        `当前模型最多支持 ${currentModel?.limits?.maxInputImages ?? 3} 张参考图。`,
      );
      return;
    }
    if (mode === "reference" && isAgnes && referenceAudios.length > 3) {
      setError("最多支持 3 段参考音频。");
      return;
    }

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    updateVideoGeneratorElement(excalidrawApi, elementId, {
      status: "generating",
      prompt: prompt.trim(),
      model,
      aspectRatio,
      duration,
      resolution,
    });

    try {
      const result = await generateVideoDirect(
        accessTokenRef.current,
        prompt.trim(),
        {
          model,
          duration,
          resolution,
          aspectRatio,
          ...(mode === "frames"
            ? {
                ...(firstFrame ? { firstFrame: firstFrame.dataUrl } : {}),
                ...(currentModel?.capabilities?.lastFrame && lastFrame
                  ? { lastFrame: lastFrame.dataUrl }
                  : {}),
              }
            : {}),
          ...(mode === "reference" && references.length
            ? { referenceImages: references.map((image) => image.dataUrl) }
            : {}),
          ...(mode === "reference" && isAgnes && referenceAudios.length
            ? { referenceAudios }
            : {}),
          ...(mode === "reference" &&
          isAgnes &&
          currentModel?.capabilities?.videoToVideo &&
          referenceVideo
            ? { inputVideo: referenceVideo }
            : {}),
          ...(mode === "extend" ? { sourceVideoJobId: sourceJobId } : {}),
        },
      );

      // Check if this generation was cancelled while awaiting
      if (controller.signal.aborted) return;

      // Create embeddable element for inline video playback on canvas.
      // Dynamic import -- excalidraw is client-only.
      const { convertToExcalidrawElements } = await import(
        "@excalidraw/excalidraw"
      );
      if (controller.signal.aborted) return;

      const newElements = convertToExcalidrawElements([
        {
          type: "embeddable",
          link: result.url,
          x: elementBounds.x,
          y: elementBounds.y,
          width: elementBounds.width,
          height: elementBounds.height,
          customData: {
            isVideo: true,
            mimeType: result.mimeType,
            durationSeconds: result.durationSeconds,
            title: prompt.trim().slice(0, 60),
            prompt: prompt.trim(),
          },
        } as any,
      ]);

      // Replace generator placeholder with video embeddable element
      const elements = excalidrawApi
        .getSceneElements()
        .map((el: any) =>
          el.id === elementId ? { ...el, isDeleted: true } : el,
        );
      excalidrawApi.updateScene({
        elements: [...elements, ...newElements],
        captureUpdate: "IMMEDIATELY",
      });

      onClose();
    } catch (err) {
      // Ignore aborted requests (user cancelled or component unmounted)
      if (controller.signal.aborted) return;

      console.error("[video-gen] Generation error:", err);
      const handled = handleGenerationError(err);
      if (!handled) {
        setError("视频生成失败，请重试或更换模型。");
      }
      setLoading(false);
      updateVideoGeneratorElement(excalidrawApi, elementId, {
        status: "error",
        errorMessage: "生成失败",
      });
    }
  }, [
    prompt,
    loading,
    model,
    aspectRatio,
    duration,
    resolution,
    firstFrame,
    lastFrame,
    mode,
    references,
    referenceAudios,
    referenceVideo,
    isAgnes,
    sourceJobId,
    validInput,
    currentModel,
    excalidrawApi,
    elementId,
    elementBounds,
    onClose,
    handleGenerationError,
  ]);

  const resolutionLabel = resolution;
  const paramsLabel = `${aspectRatio} · ${mode === "extend" ? "+7s" : `${duration}s`} · ${resolutionLabel}`;

  return createPortal(
    <div
      ref={panelRef}
      hidden={hidden}
      style={panelPosition}
      className="fixed z-[100] w-[520px] max-w-[calc(100vw-16px)] rounded-[24px] border border-border bg-card/95 shadow-card backdrop-blur-lg"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <VideoGenerationInputs
        mode={mode}
        onModeChange={(next) => {
          setMode(next);
          setError(null);
        }}
        model={currentModel}
        firstFrame={firstFrame}
        lastFrame={lastFrame}
        references={references}
        onFirstFrame={setFirstFrame}
        onLastFrame={setLastFrame}
        onReferences={setReferences}
        referenceAudios={referenceAudios}
        referenceVideo={referenceVideo}
        onReferenceAudios={setReferenceAudios}
        onReferenceVideo={setReferenceVideo}
        sources={sources}
        sourceJobId={sourceJobId}
        onSourceChange={(id) => {
          setSourceJobId(id);
          const source = sources.find((item) => item.jobId === id);
          if (source) handleAspectRatioChange(source.aspectRatio);
        }}
        sourcesLoading={sourcesLoading}
        disabled={loading}
        onError={setError}
      />

      {/* Prompt textarea */}
      <div className="px-4 py-3">
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
          placeholder={
            mode === "extend"
              ? "描述接下来发生的画面…"
              : "描述想生成的视频、动作和镜头…"
          }
          disabled={loading}
          style={{ scrollbarWidth: "none" }}
          className="field-sizing-fixed border-0 shadow-none focus-visible:ring-0 min-h-[44px] max-h-[140px] w-full resize-none border-none bg-transparent text-[14px] leading-[22px] text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-scrollbar]:hidden"
        />
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-2 pb-2">
        <Popover open={showParamsPopover} onOpenChange={setShowParamsPopover}>
          <PopoverTrigger
            render={<Button variant="ghost" size="sm" disabled={loading} />}
          >
            {paramsLabel}
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            aria-label="视频参数"
            className="w-64 gap-3 p-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${elementId}-ratio`}>画面比例</Label>
              <Select
                value={aspectRatio}
                items={(mode === "extend"
                  ? [aspectRatio]
                  : aspectRatioOptions
                ).map((value) => ({ value, label: value }))}
                onValueChange={(value) => {
                  if (value) handleAspectRatioChange(value);
                }}
              >
                <SelectTrigger id={`${elementId}-ratio`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className="p-1">
                  {(mode === "extend" ? [aspectRatio] : aspectRatioOptions).map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${elementId}-duration`}>时长</Label>
              <Select
                value={duration}
                items={durationOptions.map((value) => ({
                  value,
                  label: mode === "extend" ? "续写 7 秒" : `${value} 秒`,
                }))}
                onValueChange={(value) => {
                  if (value) handleDurationChange(value);
                }}
              >
                <SelectTrigger id={`${elementId}-duration`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className="p-1">
                  {durationOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {mode === "extend" ? "续写 7 秒" : `${value} 秒`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${elementId}-resolution`}>分辨率</Label>
              <Select
                value={resolution}
                items={resolutionOptions.map((value) => ({
                  value,
                  label: value,
                }))}
                onValueChange={(value) => {
                  if (value) handleResolutionChange(value as VideoResolution);
                }}
              >
                <SelectTrigger
                  id={`${elementId}-resolution`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className="p-1">
                  {resolutionOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>

        {/* Right: model selector + generate */}
        <div className="flex items-center gap-1">
          <Select
            value={model}
            items={models.map((candidate) => ({
              value: candidate.id,
              label: candidate.displayName,
            }))}
            disabled={loading || !models.length}
            onValueChange={(value) => {
              if (value) handleModelChange(value);
            }}
          >
            <SelectTrigger
              aria-label="视频模型"
              className="max-w-[200px] border-transparent px-2 text-xs"
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
              align="end"
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

          {/* Generate button */}
          <Button
            variant="default"
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!prompt.trim() || loading || !validInput}
            className="flex h-8 items-center justify-center gap-1 rounded-full bg-primary px-3 text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {loading ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                <span className="text-xs">生成中</span>
              </>
            ) : (
              <span className="text-xs">生成视频</span>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
