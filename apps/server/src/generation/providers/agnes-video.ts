import type {
  GeneratedVideo,
  VideoGenerateParams,
  VideoModelInfo,
  VideoProvider,
} from "../types.js";
import { fetchAsBase64, waitForGeneration } from "../utils.js";
import {
  AgnesApiError,
  AgnesClient,
  requireAgnesImageInput,
  requireAgnesMediaUrl,
} from "./agnes-client.js";

const DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const MODELS: readonly VideoModelInfo[] = [true, false].map((flash) => ({
  id: `agnes/agnes-video-2.5${flash ? "-flash" : ""}`,
  displayName: `Agnes Video 2.5${flash ? " Flash" : ""}`,
  description: `支持文字生成、首尾帧和最多 ${flash ? 5 : 8} 张参考图，时长 4–12 秒，${flash ? "720p" : "最高 1080p"}。可直接上传本地参考图片。`,
  iconUrl: "/providers/agnes.ico",
  capabilities: {
    textToVideo: true,
    imageToVideo: true,
    lastFrame: true,
    referenceImages: true,
    videoToVideo: !flash,
    videoExtension: false,
    audio: true,
  },
  limits: {
    maxDuration: 12,
    allowedDurations: DURATIONS,
    maxResolution: flash ? "720p" : "1080p",
    maxInputImages: flash ? 5 : 8,
  },
}));

export function buildAgnesVideoRequest(
  params: VideoGenerateParams,
  models: readonly VideoModelInfo[] = MODELS,
): Record<string, unknown> {
  const model = models.find((item) => item.id === params.model);
  if (!model)
    throw new AgnesApiError("model_not_found", "所选 Agnes 视频模型不可用。");
  const duration = params.duration ?? 5;
  if (!DURATIONS.includes(duration))
    throw new AgnesApiError(
      "invalid_input",
      "Agnes 视频时长必须是 4–12 秒的整数。",
    );
  const resolution = params.resolution ?? "720p";
  if (
    resolution !== "720p" &&
    (resolution !== "1080p" || model.limits.maxResolution === "720p")
  )
    throw new AgnesApiError(
      "invalid_input",
      `${model.displayName} 不支持所选分辨率。`,
    );
  const ratio = params.aspectRatio ?? "16:9";
  if (!["16:9", "9:16", "21:9", "4:3", "3:4", "1:1"].includes(ratio))
    throw new AgnesApiError("invalid_input", "Agnes 不支持所选视频比例。");
  const legacy = params.inputImages ?? [];
  if (
    legacy.length &&
    (params.firstFrame || params.lastFrame || params.referenceImages?.length)
  )
    throw new AgnesApiError(
      "invalid_input",
      "请分别选择首尾帧或参考素材模式。",
    );
  const firstFrame =
    params.firstFrame ?? (legacy.length === 1 ? legacy[0] : undefined);
  const references =
    params.referenceImages ?? (legacy.length > 1 ? legacy : []);
  const audios = params.referenceAudios ?? [];
  const hasReferences =
    references.length > 0 || audios.length > 0 || !!params.inputVideo;
  if (hasReferences && (firstFrame || params.lastFrame))
    throw new AgnesApiError("invalid_input", "首尾帧不能与参考素材混用。");
  if (references.length > model.limits.maxInputImages)
    throw new AgnesApiError(
      "invalid_input",
      `${model.displayName} 最多支持 ${model.limits.maxInputImages} 张参考图。`,
    );
  if (audios.length > 3)
    throw new AgnesApiError("invalid_input", "Agnes 最多支持 3 段参考音频。");
  if (params.inputVideo && !model.capabilities.videoToVideo)
    throw new AgnesApiError(
      "invalid_input",
      "Agnes Video 2.5 Flash 不支持参考视频，请选择 Agnes Video 2.5。",
    );
  const allImages = [firstFrame, params.lastFrame, ...references].filter(
    (value): value is string => !!value,
  );
  const inlineBytes = allImages.reduce(
    (sum, value) =>
      sum +
      (value.startsWith("data:")
        ? Buffer.byteLength(value.slice(value.indexOf(",") + 1), "base64")
        : 0),
    0,
  );
  if (inlineBytes > 32 * 1024 * 1024)
    throw new AgnesApiError(
      "invalid_input",
      "参考图片总大小不能超过 32 MB，请压缩后重试。",
    );
  const mode = hasReferences
    ? "reference"
    : firstFrame || params.lastFrame
      ? "keyframe"
      : "text";
  return {
    model: params.model.slice("agnes/".length),
    prompt: params.prompt,
    mode,
    seconds: String(duration),
    size: resolution.toUpperCase(),
    aspect_ratio: ratio,
    n: 1,
    ...(firstFrame ? { first_frame: requireAgnesImageInput(firstFrame) } : {}),
    ...(params.lastFrame
      ? { last_frame: requireAgnesImageInput(params.lastFrame) }
      : {}),
    ...(references.length
      ? { images: references.map(requireAgnesImageInput) }
      : {}),
    ...(audios.length ? { audios: audios.map(requireAgnesMediaUrl) } : {}),
    ...(params.inputVideo
      ? { videos: [{ url: requireAgnesMediaUrl(params.inputVideo) }] }
      : {}),
  };
}

type PollOptions = {
  pollIntervalMs?: number;
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export class AgnesVideoProvider implements VideoProvider {
  readonly name = "agnes";
  readonly models: readonly VideoModelInfo[];
  private readonly client: AgnesClient;

  constructor(
    apiKey: string,
    baseUrl?: string,
    private readonly options: PollOptions = {},
    models: readonly VideoModelInfo[] = MODELS,
  ) {
    this.client = new AgnesClient(apiKey, baseUrl);
    this.models = models;
  }

  async generate(params: VideoGenerateParams): Promise<GeneratedVideo> {
    params.signal?.throwIfAborted();
    buildAgnesVideoRequest(params, this.models);
    const imageCache = new Map<string, Promise<string>>();
    const inlineImage = (url: string) => {
      let pending = imageCache.get(url);
      if (!pending) {
        pending = fetchAsBase64(this.name, url, params.signal).then(
          ({ data, mimeType }) =>
            `data:${mimeType.split(";")[0]};base64,${data}`,
        );
        imageCache.set(url, pending);
      }
      return pending;
    };
    const request = buildAgnesVideoRequest(
      {
        ...params,
        ...(params.firstFrame
          ? { firstFrame: await inlineImage(params.firstFrame) }
          : {}),
        ...(params.lastFrame
          ? { lastFrame: await inlineImage(params.lastFrame) }
          : {}),
        ...(params.inputImages
          ? {
              inputImages: await Promise.all(
                params.inputImages.map(inlineImage),
              ),
            }
          : {}),
        ...(params.referenceImages
          ? {
              referenceImages: await Promise.all(
                params.referenceImages.map(inlineImage),
              ),
            }
          : {}),
      },
      this.models,
    );
    // Never retry task creation: a lost create response can still represent a billed task.
    const created = await this.client.request("videos", {
      method: "POST",
      signal: params.signal ?? null,
      body: JSON.stringify(request),
    });
    if (typeof created.video_id !== "string" || !created.video_id)
      throw new AgnesApiError(
        "malformed_response",
        "Agnes 未返回用于查询结果的 video_id。",
      );
    const query = new URLSearchParams({
      video_id: created.video_id,
      model_name: String(request.model),
    });
    const now = this.options.now ?? Date.now;
    const deadline = now() + (this.options.maxWaitMs ?? 600_000);
    const sleep =
      this.options.sleep ??
      ((ms: number) => waitForGeneration(ms, params.signal));
    // The China endpoint rate-limits faster polling even though the docs suggest 1–2s.
    const interval = this.options.pollIntervalMs ?? 10_000;
    let delay = interval;

    while (now() < deadline) {
      params.signal?.throwIfAborted();
      let result: Record<string, unknown>;
      try {
        result = await this.client.request(`../agnesapi?${query}`, {
          signal: params.signal ?? null,
        });
      } catch (error) {
        if (
          error instanceof AgnesApiError &&
          (error.status === 429 ||
            (error.status ?? 0) >= 500 ||
            ["network_error", "timeout"].includes(error.code))
        ) {
          delay = Math.min(
            Math.max(error.retryAfterMs ?? delay * 2, interval),
            60_000,
          );
          await sleep(Math.min(delay, Math.max(0, deadline - now())));
          continue;
        }
        throw error;
      }
      delay = interval;
      if (result.status === "completed") {
        if (typeof result.url !== "string" || !result.url)
          throw new AgnesApiError(
            "no_output",
            "Agnes 视频任务已完成，但未返回下载地址。",
          );
        const outputUrl = requireAgnesMediaUrl(result.url);
        const duration = Number(result.seconds ?? request.seconds);
        const { width, height } = videoDimensions(
          String(request.model),
          String(result.size ?? request.size),
          String(request.aspect_ratio),
        );
        return {
          url: outputUrl,
          mimeType: "video/mp4",
          width,
          height,
          durationSeconds:
            Number.isFinite(duration) && duration > 0
              ? duration
              : Number(request.seconds),
        };
      }
      if (result.status === "failed") {
        const detail =
          result.error && typeof result.error === "object"
            ? (result.error as Record<string, unknown>).message
            : undefined;
        throw new AgnesApiError(
          "generation_failed",
          this.client.sanitize(
            typeof detail === "string" ? detail : "Agnes 视频生成失败。",
          ),
        );
      }
      if (
        result.status !== "pending" &&
        result.status !== "queued" &&
        result.status !== "in_progress"
      )
        throw new AgnesApiError(
          "malformed_response",
          "Agnes 返回了未知的视频任务状态。",
        );
      await sleep(Math.min(interval, Math.max(0, deadline - now())));
    }
    throw new AgnesApiError(
      "timeout",
      "Agnes 视频任务等待超时，请在服务商控制台查看任务状态。",
    );
  }
}

function videoDimensions(
  model: string,
  size: string,
  ratio: string,
): { width: number; height: number } {
  const flash = model.endsWith("-flash");
  const mapping: Record<string, [number, number]> & {
    "16:9": [number, number];
  } = flash
    ? {
        "21:9": [1680, 720],
        "16:9": [1280, 704],
        "4:3": [960, 720],
        "1:1": [720, 720],
        "3:4": [720, 960],
        "9:16": [720, 1280],
      }
    : size === "1080P"
      ? {
          "21:9": [2206, 946],
          "16:9": [1920, 1080],
          "4:3": [1664, 1248],
          "1:1": [1440, 1440],
          "3:4": [1248, 1664],
          "9:16": [1080, 1920],
        }
      : {
          "21:9": [1470, 630],
          "16:9": [1280, 720],
          "4:3": [1112, 834],
          "1:1": [960, 960],
          "3:4": [834, 1112],
          "9:16": [720, 1280],
        };
  const [width, height] = mapping[ratio] ?? mapping["16:9"];
  return { width, height };
}
