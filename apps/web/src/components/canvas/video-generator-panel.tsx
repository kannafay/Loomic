"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { type VideoResolution, resolvePreferredModel } from "@loomic/shared";
import { Download, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useGenerationErrorHandler } from "../../hooks/use-generation-error-handler";
import {
  generateCanvasVideo,
  isCanvasVideoGenerating,
  stopCanvasVideoGeneration,
} from "../../lib/canvas-video-generation";
import {
  type VideoGeneratorData,
  resizeVideoGeneratorElement,
  updateVideoGeneratorElement,
} from "../../lib/canvas-video-generator";
import { groupModelsByProvider } from "../../lib/model-groups";
import type {
  VideoExtensionSource,
  VideoModelInfo,
} from "../../lib/server-api";
import {
  fetchModelPreferences,
  fetchVideoModels,
  fetchVideoSources,
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
  excalidrawApi: ExcalidrawImperativeAPI;
  accessToken: string;
  canvasScrollZoom: { scrollX: number; scrollY: number; zoom: number };
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
}: VideoGeneratorPanelProps) {
  const [prompt, setPrompt] = useState(data.prompt);
  const [model, setModel] = useState(data.model);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio);
  const [duration, setDuration] = useState(data.duration);
  const [resolution, setResolution] = useState(data.resolution);
  const [loading, setLoading] = useState(data.status === "generating");
  const [error, setError] = useState<string | null>(data.errorMessage ?? null);
  const [models, setModels] = useState<VideoModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsLoadError, setModelsLoadError] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [showParamsPopover, setShowParamsPopover] = useState(false);
  const [mode, setMode] = useState<VideoInputMode>(data.inputMode ?? "text");
  const [firstFrame, setFirstFrame] = useState<VideoFrame | null>(
    data.firstFrame ?? null,
  );
  const [lastFrame, setLastFrame] = useState<VideoFrame | null>(
    data.lastFrame ?? null,
  );
  const [references, setReferences] = useState<VideoFrame[]>(
    data.referenceImages ?? [],
  );
  const [referenceAudios, setReferenceAudios] = useState<string[]>(
    data.referenceAudios ?? [],
  );
  const [referenceVideo, setReferenceVideo] = useState(
    data.referenceVideo ?? "",
  );
  const [sources, setSources] = useState<VideoExtensionSource[]>([]);
  const [sourceJobId, setSourceJobId] = useState(data.sourceJobId ?? "");
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ left: 8, top: 8 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const { handleGenerationError } = useGenerationErrorHandler();
  const inputSettings = useMemo(
    () => ({
      inputMode: mode,
      firstFrame,
      lastFrame,
      referenceImages: references,
      referenceAudios,
      referenceVideo,
      sourceJobId,
    }),
    [
      mode,
      firstFrame,
      lastFrame,
      references,
      referenceAudios,
      referenceVideo,
      sourceJobId,
    ],
  );
  const savedInputsRef = useRef(inputSettings);
  useEffect(() => {
    if (savedInputsRef.current === inputSettings) return;
    savedInputsRef.current = inputSettings;
    updateVideoGeneratorElement(excalidrawApi, elementId, inputSettings);
  }, [inputSettings, excalidrawApi, elementId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh when the model menu opens to reflect administrator ordering.
  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    setModelsLoadError(false);
    Promise.all([
      fetchVideoModels(),
      fetchModelPreferences(accessTokenRef.current),
    ])
      .then(([r, { preferences }]) => {
        if (cancelled) return;
        setModels(r.models);
        const current = modelRef.current;
        if (current) return;
        const initial = resolvePreferredModel(r.models, preferences.video);
        const initialId = initial?.id ?? preferences.video;
        if (!initialId) return;
        modelRef.current = initialId;
        setModel(initialId);
        updateVideoGeneratorElement(excalidrawApi, elementId, {
          model: initialId,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setModelsLoadError(true);
        console.warn("[video-gen] Failed to fetch models:", err);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [excalidrawApi, elementId, catalogRevision]);

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
  const currentElement = excalidrawApi
    .getSceneElements()
    .find((el) => el.id === elementId);
  const videoUrl =
    currentElement?.type === "embeddable" ? currentElement.link : null;
  const isAgnes = currentModel?.provider === "agnes";
  const isVeo = currentModel?.id.includes("/veo-") ?? false;
  const aspectRatioOptions = isAgnes
    ? ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
    : ASPECT_RATIOS;
  const availableDurations: readonly number[] =
    currentModel?.limits?.allowedDurations ?? DURATIONS;
  const resolutionOptions = useMemo(
    () =>
      mode === "extend"
        ? (["720p"] as const)
        : supportedResolutions(currentModel),
    [mode, currentModel],
  );
  const durationLocked =
    mode === "extend" ||
    (isVeo &&
      (mode === "reference" || resolution === "1080p" || resolution === "4k"));
  const durationOptions = useMemo<readonly number[]>(
    () => (durationLocked ? [8] : availableDurations),
    [durationLocked, availableDurations],
  );
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
    if (!currentModel) return;
    const caps = currentModel?.capabilities;
    if (
      (mode === "reference" && !caps?.referenceImages) ||
      (mode === "extend" && !caps?.videoExtension) ||
      (mode === "frames" && !caps?.imageToVideo)
    )
      setMode("text");
  }, [currentModel, mode]);

  useEffect(() => {
    if (!currentModel) return;
    const nextDuration = durationOptions.includes(duration)
      ? duration
      : durationOptions.includes(8)
        ? 8
        : (durationOptions[0] ?? 8);
    const nextResolution = resolutionOptions.includes(
      resolution as VideoResolution,
    )
      ? resolution
      : (resolutionOptions[0] ?? "720p");
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
    durationOptions,
    resolutionOptions,
    currentModel,
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
      const element = excalidrawApi
        .getSceneElements()
        .find((el) => el.id === elementId);
      if (element?.type !== "embeddable")
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
    if (
      !prompt.trim() ||
      loading ||
      modelsLoading ||
      !currentModel ||
      !validInput
    )
      return;
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

    setLoading(true);
    setError(null);
    try {
      await generateCanvasVideo(
        excalidrawApi,
        elementId,
        accessTokenRef.current,
        {
          ...data,
          ...inputSettings,
          prompt: prompt.trim(),
          model,
          aspectRatio,
          duration,
          resolution,
        },
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
    } catch (err) {
      console.error("[video-gen] Generation error:", err);
      handleGenerationError(err, "视频生成失败，请重试或更换模型。");
      setError("生成失败，请重试或更换模型。");
    } finally {
      if (!isCanvasVideoGenerating(excalidrawApi, elementId)) setLoading(false);
    }
  }, [
    prompt,
    loading,
    modelsLoading,
    data,
    inputSettings,
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
    handleGenerationError,
  ]);

  const handleStop = () => {
    stopCanvasVideoGeneration(excalidrawApi, elementId);
    setLoading(false);
    setError(null);
  };

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
        onError={(message) =>
          handleGenerationError(new Error(message), message)
        }
      />

      {/* Prompt textarea */}
      <div className="px-4 py-3">
        <Textarea
          scrollable={false}
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => {
            const element = excalidrawApi
              .getSceneElements()
              .find((el) => el.id === elementId);
            if (element?.customData?.prompt !== prompt)
              updateVideoGeneratorElement(excalidrawApi, elementId, { prompt });
          }}
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
        <div className="flex items-center gap-1">
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
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {(mode === "extend"
                        ? [aspectRatio]
                        : aspectRatioOptions
                      ).map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectGroup>
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
                  <SelectTrigger
                    id={`${elementId}-duration`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {durationOptions.map((value) => (
                        <SelectItem key={value} value={value}>
                          {mode === "extend" ? "续写 7 秒" : `${value} 秒`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
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
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {resolutionOptions.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
          {videoUrl && (
            <a
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              href={videoUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="size-3.5" />
              下载视频
            </a>
          )}
        </div>

        {/* Right: model selector + generate */}
        <div className="flex items-center gap-1">
          <Select
            value={model}
            onOpenChange={(open) => {
              if (open) setCatalogRevision((revision) => revision + 1);
            }}
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
                {modelsLoading
                  ? "正在加载模型…"
                  : (currentModel?.displayName ??
                    (modelsLoadError
                      ? "模型加载失败"
                      : models.length
                        ? "请选择模型"
                        : "暂无可用模型"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              side="top"
              align="end"
              alignItemWithTrigger={false}
              className="w-64"
            >
              {groupModelsByProvider(models).map((group) => (
                <SelectGroup key={group.key}>
                  <SelectLabel>{group.name}</SelectLabel>
                  {group.models.map((candidate) => (
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
              ))}
            </SelectContent>
          </Select>

          {/* Generate button */}
          <Button
            variant="default"
            type="button"
            onClick={() => (loading ? handleStop() : void handleGenerate())}
            aria-label={loading ? "停止生成视频" : "生成视频"}
            disabled={
              !loading &&
              (!prompt.trim() || modelsLoading || !currentModel || !validInput)
            }
            className="flex h-8 items-center justify-center gap-1 rounded-full bg-primary px-3 text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {loading ? (
              <>
                <Square className="size-3.5" fill="currentColor" />
                <span className="text-xs">停止生成</span>
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
