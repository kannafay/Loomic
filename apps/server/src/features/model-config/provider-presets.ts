import type { ProviderPreset } from "@loomic/shared";

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "google",
    name: "Google",
    category: "manufacturer",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "manufacturer",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "manufacturer",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
  },
  {
    id: "agnes",
    name: "Agnes AI",
    category: "manufacturer",
    protocol: "openai",
    baseUrl: "https://api.agnes-ai.cn/v1",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "manufacturer",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com",
  },
  {
    id: "minimax",
    name: "MiniMax",
    category: "manufacturer",
    protocol: "openai",
    baseUrl: "https://api.minimax.cn/v1",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "third_party",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    category: "cloud",
    protocol: "openai",
    baseUrl: "https://your-resource.openai.azure.com/openai/v1",
  },
  {
    id: "custom",
    name: "自定义",
    category: "custom",
    protocol: "openai",
    baseUrl: "http://127.0.0.1:8000/v1",
  },
];
