import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { ConfiguredModel } from "@loomic/shared";
import { LoomicGoogleChatModel } from "../../agent/google-chat-model.js";
import {
  providerFetch,
  withProviderProxy,
} from "../../config/network-proxy.js";
import { AgnesImageProvider } from "../../generation/providers/agnes-image.js";
import { AgnesVideoProvider } from "../../generation/providers/agnes-video.js";
import { GoogleImageProvider } from "../../generation/providers/google-image.js";
import { GoogleVideoProvider } from "../../generation/providers/google-video.js";
import { OpenAIImageProvider } from "../../generation/providers/openai-image.js";
import {
  clearProviders,
  registerImageProvider,
  registerVideoProvider,
} from "../../generation/providers/registry.js";
import type {
  ImageProvider,
  VideoModelInfo,
  VideoProvider,
} from "../../generation/types.js";
import {
  ModelConfigError,
  type ModelConfigService,
  type PrivateProvider,
} from "./model-config-service.js";

export function configuredChatModel(
  model: ConfiguredModel,
  provider: PrivateProvider,
) {
  const apiKey = provider.apiKey || "not-required";
  const request = model.options;
  const tuning = {
    ...(typeof request.temperature === "number"
      ? { temperature: request.temperature }
      : {}),
    ...(typeof request.maxTokens === "number"
      ? { maxTokens: request.maxTokens }
      : {}),
    maxRetries: 1,
  };
  if (provider.protocol === "anthropic")
    return new ChatAnthropic({
      ...tuning,
      model: model.apiModel,
      apiKey,
      clientOptions: {
        baseURL: provider.baseUrl,
        fetch: providerFetch(provider.proxy),
      },
    });
  if (provider.protocol === "gemini") {
    const chat = new LoomicGoogleChatModel({
      ...tuning,
      model: model.apiModel,
      apiKey,
      baseUrl: provider.baseUrl,
    });
    chat.networkProxy = provider.proxy;
    return chat;
  }
  return new ChatOpenAI({
    ...tuning,
    model: model.apiModel,
    apiKey,
    streaming: true,
    streamUsage: false,
    useResponsesApi: false,
    configuration: {
      baseURL: provider.baseUrl,
      fetch: providerFetch(provider.proxy),
    },
  });
}

export function videoMetadata(model: ConfiguredModel): VideoModelInfo {
  const options = model.options;
  const caps = options.capabilities as
    | Partial<VideoModelInfo["capabilities"]>
    | undefined;
  const limits = options.limits as
    | Partial<VideoModelInfo["limits"]>
    | undefined;
  return {
    id: model.key,
    isDefault: model.isDefault,
    displayName: model.name,
    description: model.description,
    capabilities: {
      textToVideo: true,
      imageToVideo: false,
      videoToVideo: false,
      audio: false,
      ...caps,
    },
    limits: {
      maxDuration: 8,
      maxResolution: "720p",
      maxInputImages: 0,
      ...limits,
    },
  };
}

export async function refreshConfiguredProviders(
  service: ModelConfigService,
  force = false,
) {
  await service.syncNetworkSettings();
  const catalog = await service.catalog(force);
  // Registering is synchronous so another request never observes a half-built catalog.
  const images: ImageProvider[] = [];
  const videos: VideoProvider[] = [];
  for (const model of catalog.models) {
    const provider = catalog.providers.find((p) => p.id === model.providerId);
    if (!provider) throw new Error(`Provider not found for model ${model.key}`);
    const apiKey = provider.apiKey || "not-required";
    const catalogProvider =
      model.adapter === "agnes"
        ? "agnes"
        : provider.protocol === "gemini"
          ? "google"
          : provider.preset === "custom"
            ? provider.name
            : provider.preset;
    const name = `configured-${model.id}`;
    const iconUrl =
      model.adapter === "agnes"
        ? "/providers/agnes.ico"
        : provider.preset === "google"
          ? "/providers/google.svg"
          : undefined;
    const info = {
      id: model.key,
      isDefault: model.isDefault,
      displayName: model.name,
      description: model.description,
      providerId: provider.id,
      providerName: provider.name,
      ...(iconUrl ? { iconUrl } : {}),
    };
    if (model.kind === "image") {
      const prefix = model.adapter === "agnes" ? "agnes/" : "openai-official/";
      const nativeId = prefix + model.apiModel;
      const nativeInfo = { ...info, id: nativeId };
      const implementation =
        model.adapter === "agnes"
          ? new AgnesImageProvider(provider.apiKey, provider.baseUrl, [
              nativeInfo,
            ])
          : provider.protocol === "gemini"
            ? new GoogleImageProvider(apiKey, {
                baseUrl: provider.baseUrl,
                models: [info],
                modelMap: { [model.key]: model.apiModel },
              })
            : new OpenAIImageProvider(apiKey, provider.baseUrl, [nativeInfo]);
      images.push({
        name,
        catalogProvider,
        models: [info],
        generate: (params) =>
          withProviderProxy(provider.proxy, async () => ({
            ...(await implementation.generate({
              ...params,
              model:
                provider.protocol === "gemini" && model.adapter !== "agnes"
                  ? model.key
                  : nativeId,
            })),
            networkProxy: provider.proxy,
          })),
      });
    }
    if (model.kind === "video") {
      const info = {
        ...videoMetadata(model),
        providerId: provider.id,
        providerName: provider.name,
        ...(iconUrl ? { iconUrl } : {}),
      };
      if (model.adapter === "agnes") {
        const nativeId = `agnes/${model.apiModel}`;
        const implementation = new AgnesVideoProvider(
          provider.apiKey,
          provider.baseUrl,
          {},
          [{ ...info, id: nativeId }],
        );
        videos.push({
          name,
          catalogProvider,
          models: [info],
          generate: (params) =>
            withProviderProxy(provider.proxy, async () => ({
              ...(await implementation.generate({
                ...params,
                model: nativeId,
              })),
              networkProxy: provider.proxy,
            })),
        });
      } else if (provider.protocol === "gemini" || model.adapter === "veo") {
        const max = info.limits.maxResolution;
        const implementation = new GoogleVideoProvider(provider.apiKey, {
          baseUrl: provider.baseUrl,
          models: [info],
          modelMap: { [model.key]: model.apiModel },
          capabilities: {
            [model.apiModel]: {
              allowedDurations: info.limits.allowedDurations ?? [4, 6, 8],
              allowedResolutions:
                max === "2160p"
                  ? ["720p", "1080p", "4k"]
                  : max === "1080p"
                    ? ["720p", "1080p"]
                    : ["720p"],
              allowedAspectRatios: ["16:9", "9:16"],
              defaultDuration: info.limits.maxDuration,
              supportsAudio: info.capabilities.audio,
            },
          },
        });
        videos.push({
          name,
          catalogProvider,
          models: [info],
          generate: (params) =>
            withProviderProxy(provider.proxy, async () => ({
              ...(await implementation.generate(params)),
              networkProxy: provider.proxy,
            })),
        });
      } else {
        videos.push({
          name,
          catalogProvider,
          models: [info],
          generate: (params) =>
            withProviderProxy(provider.proxy, async () => {
              // OpenAI-compatible Videos API (asynchronous create/status/content).
              const headers = { Authorization: `Bearer ${provider.apiKey}` };
              const size =
                params.aspectRatio === "9:16" ? "720x1280" : "1280x720";
              const body = new FormData();
              body.set("model", model.apiModel);
              body.set("prompt", params.prompt);
              body.set("size", size);
              body.set("seconds", String(params.duration ?? 8));
              const response = await fetch(`${provider.baseUrl}/videos`, {
                method: "POST",
                headers,
                body,
                signal: AbortSignal.timeout(60_000),
              });
              if (!response.ok)
                throw new ModelConfigError(
                  `视频任务创建失败（HTTP ${response.status}）。`,
                );
              let task = (await response.json()) as {
                id: string;
                status: string;
                error?: { message?: string };
              };
              const deadline = Date.now() + 600_000;
              while (task.status !== "completed") {
                if (task.status === "failed" || Date.now() > deadline)
                  throw new ModelConfigError("视频生成失败或超时。");
                await new Promise((resolve) => setTimeout(resolve, 5000));
                const status = await fetch(
                  `${provider.baseUrl}/videos/${encodeURIComponent(task.id)}`,
                  { headers, signal: AbortSignal.timeout(30_000) },
                );
                if (!status.ok)
                  throw new ModelConfigError("视频状态查询失败。");
                task = (await status.json()) as typeof task;
              }
              const content = await fetch(
                `${provider.baseUrl}/videos/${encodeURIComponent(task.id)}/content`,
                { headers, signal: AbortSignal.timeout(60_000) },
              );
              if (!content.ok) throw new ModelConfigError("视频文件下载失败。");
              const bytes = Buffer.from(await content.arrayBuffer());
              return {
                url: `data:video/mp4;base64,${bytes.toString("base64")}`,
                mimeType: "video/mp4",
                width: params.aspectRatio === "9:16" ? 720 : 1280,
                height: params.aspectRatio === "9:16" ? 1280 : 720,
                durationSeconds: params.duration ?? 8,
              };
            }),
        });
      }
    }
  }
  clearProviders();
  for (const provider of images) registerImageProvider(provider);
  for (const provider of videos) registerVideoProvider(provider);
  return catalog;
}
