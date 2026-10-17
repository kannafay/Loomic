import type { FastifyInstance } from "fastify";

import { type ModelInfo, modelListResponseSchema } from "@loomic/shared";
import type { ServerEnv } from "../config/env.js";
import type { ModelConfigService } from "../features/model-config/model-config-service.js";

const OPENAI_MODELS: ModelInfo[] = [
  { id: "openai:gpt-6-astra", name: "GPT-6 Astra", provider: "openai" },
  { id: "openai:gpt-6.1-sol", name: "GPT-6.1 Sol", provider: "openai" },
  { id: "openai:gpt-6-sol", name: "GPT-6 Sol", provider: "openai" },
  { id: "openai:gpt-6-luna", name: "GPT-6 Luna", provider: "openai" },
  { id: "openai:az_sre/gpt-5.4", name: "GPT-5.4", provider: "openai" },
  { id: "openai:gpt-5.4", name: "OpenAI GPT-5.4", provider: "openai" },
  { id: "openai:gpt-5.2", name: "OpenAI GPT-5.2", provider: "openai" },
  { id: "openai:gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai" },
  { id: "openai:gpt-4.1", name: "GPT-4.1", provider: "openai" },
  { id: "openai:gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "openai:gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  { id: "openai:o3-mini", name: "o3 Mini", provider: "openai" },
];

const GOOGLE_MODELS: ModelInfo[] = [
  { id: "google:gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "google" },
  // Gemini 3 series (Preview)
  { id: "google:gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "google" },
  { id: "google:gemini-3-flash-preview", name: "Gemini 3 Flash", provider: "google" },
  { id: "google:gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", provider: "google" },
  // Gemini 2.5 series (GA)
  { id: "google:gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
  { id: "google:gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
  { id: "google:gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google" },
];

const AGNES_MODELS: ModelInfo[] = [
  { id: "agnes:agnes-3.0-flash", name: "Agnes 3.0 Flash", provider: "agnes" },
  { id: "agnes:agnes-2.5-pro", name: "Agnes 2.5 Pro", provider: "agnes" },
  { id: "agnes:agnes-2.5-flash", name: "Agnes 2.5 Flash", provider: "agnes" },
];

export async function registerModelRoutes(app: FastifyInstance, env: ServerEnv, service?: ModelConfigService) {
  app.get("/api/models", async (_request, reply) => {
    if (service) {
      const catalog = await service.catalog();
      return reply.code(200).send(modelListResponseSchema.parse({ models: catalog.models.filter(m => m.kind === "text").map(m => ({
        id: m.key, name: m.name, provider: catalog.providers.find(p => p.id === m.providerId)!.name,
      })) }));
    }
    const models: ModelInfo[] = [];
    if (env.openAIApiKey) models.push(...OPENAI_MODELS);
    if (env.googleApiKey || env.googleVertexProject) models.push(...GOOGLE_MODELS);
    if (env.agnesApiKey) models.push(...AGNES_MODELS);
    return reply.code(200).send(modelListResponseSchema.parse({ models }));
  });
}
