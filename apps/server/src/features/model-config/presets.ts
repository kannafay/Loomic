import type { ConfiguredModelWrite, ModelPreset } from "@loomic/shared";
import { AgnesImageProvider } from "../../generation/providers/agnes-image.js";
import { AgnesVideoProvider } from "../../generation/providers/agnes-video.js";
import { GoogleImageProvider } from "../../generation/providers/google-image.js";
import { GoogleVideoProvider } from "../../generation/providers/google-video.js";
import { OpenAIImageProvider } from "../../generation/providers/openai-image.js";
import type { ModelInfo, VideoModelInfo } from "../../generation/types.js";

type PresetModel = ModelPreset["models"][number];
const text = (
  apiModel: string,
  name: string,
  legacyKey?: string,
): PresetModel => ({
  kind: "text",
  apiModel,
  name,
  description: "",
  adapter: "auto",
  enabled: false,
  options: {},
  ...(legacyKey ? { legacyKey } : {}),
});
function media(
  kind: "image" | "video",
  models: readonly ModelInfo[],
  adapter: ConfiguredModelWrite["adapter"],
): PresetModel[] {
  return models.map((model) => ({
    kind,
    apiModel: model.id.split("/").slice(1).join("/"),
    name: model.displayName,
    description: model.description,
    adapter,
    enabled: false,
    legacyKey: model.id,
    options:
      kind === "video"
        ? {
            capabilities: (model as VideoModelInfo).capabilities,
            limits: (model as VideoModelInfo).limits,
          }
        : {},
  }));
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "google",
    name: "Google",
    category: "manufacturer",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    models: [
      text("gemini-3.8-flash", "Gemini 3.8 Flash", "google:gemini-3.8-flash"),
      text(
        "gemini-3.1-pro-preview",
        "Gemini 3.1 Pro",
        "google:gemini-3.1-pro-preview",
      ),
      text(
        "gemini-3-flash-preview",
        "Gemini 3 Flash",
        "google:gemini-3-flash-preview",
      ),
      text(
        "gemini-3.1-flash-lite-preview",
        "Gemini 3.1 Flash Lite",
        "google:gemini-3.1-flash-lite-preview",
      ),
      text("gemini-2.5-pro", "Gemini 2.5 Pro", "google:gemini-2.5-pro"),
      text("gemini-2.5-flash", "Gemini 2.5 Flash", "google:gemini-2.5-flash"),
      text(
        "gemini-2.5-flash-lite",
        "Gemini 2.5 Flash Lite",
        "google:gemini-2.5-flash-lite",
      ),
      ...media("image", new GoogleImageProvider("preset").models, "auto"),
      ...media("video", new GoogleVideoProvider("preset").models, "veo"),
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "manufacturer",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: [
      text("gpt-4.1", "GPT-4.1", "openai:gpt-4.1"),
      text("gpt-4o", "GPT-4o", "openai:gpt-4o"),
      ...media("image", new OpenAIImageProvider("preset").models, "auto"),
      {
        kind: "audio",
        apiModel: "tts-1",
        name: "TTS-1",
        description: "文字转语音",
        adapter: "auto",
        enabled: false,
        options: { voice: "alloy" },
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "manufacturer",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    models: [
      text("claude-sonnet-4-6", "Claude Sonnet 4.6"),
      text("claude-opus-4-6", "Claude Opus 4.6"),
    ],
  },
  {
    id: "agnes",
    name: "Agnes AI",
    category: "manufacturer",
    protocol: "openai",
    baseUrl: "https://api.agnes-ai.cn/v1",
    models: [
      text("agnes-3.0-flash", "Agnes 3.0 Flash", "agnes:agnes-3.0-flash"),
      text("agnes-2.5-pro", "Agnes 2.5 Pro", "agnes:agnes-2.5-pro"),
      text("agnes-2.5-flash", "Agnes 2.5 Flash", "agnes:agnes-2.5-flash"),
      ...media("image", new AgnesImageProvider("preset").models, "agnes"),
      ...media("video", new AgnesVideoProvider("preset").models, "agnes"),
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "third_party",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [],
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    category: "cloud",
    protocol: "openai",
    baseUrl: "https://your-resource.openai.azure.com/openai/v1",
    models: [text("gpt-4.1", "GPT-4.1（填入部署名称）")],
  },
  {
    id: "custom",
    name: "自定义",
    category: "custom",
    protocol: "openai",
    baseUrl: "http://127.0.0.1:8000/v1",
    models: [],
  },
];
