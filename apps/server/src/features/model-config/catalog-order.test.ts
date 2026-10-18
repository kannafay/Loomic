import type { ModelKind } from "@loomic/shared";
import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { loadServerEnv } from "../../config/env.js";
import { clearProviders } from "../../generation/providers/registry.js";
import { registerImageModelRoutes } from "../../http/image-models.js";
import { registerModelRoutes } from "../../http/models.js";
import { registerVideoModelRoutes } from "../../http/video-models.js";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { createModelConfigService } from "./model-config-service.js";
import { refreshConfiguredProviders } from "./runtime.js";
import { encryptApiKey } from "./secrets.js";

const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const kinds = ["text", "audio", "image", "video"] as const;
const secret = Buffer.alloc(32, 7).toString("base64");

function setup() {
  let providers = [
    { id: uuid(1), name: "团队 Agnes", preset: "agnes", protocol: "openai" },
    { id: uuid(2), name: "Google", preset: "google", protocol: "gemini" },
    { id: uuid(3), name: "备用 Agnes", preset: "agnes", protocol: "openai" },
  ].map((provider, index) => ({
    ...provider,
    created_by: uuid(99),
    base_url: "https://example.test/v1",
    category: "manufacturer",
    api_key_ciphertext: encryptApiKey("test-key", secret),
    enabled: true,
    sort_order: index,
  }));
  const models = kinds.flatMap((kind, index) =>
    [2, 1, 1, 3, 4].map((provider, modelIndex) => ({
      id: uuid(100 + index * 10 + modelIndex),
      provider_id: uuid(provider),
      model_key: `configured/${kind}-${modelIndex}`,
      kind,
      api_model: `test-${kind}-${modelIndex}`,
      name: `${kind} ${modelIndex === 1 ? "Z" : "A"}${modelIndex}`,
      description: "",
      adapter: provider === 2 ? "auto" : "agnes",
      enabled: true,
      is_default: modelIndex === 0,
      options: {},
    })),
  );
  const from = vi.fn((table: string) => {
    return Object.assign(
      Promise.resolve({
        data: table === "model_providers" ? providers : models,
        error: null,
      }),
      {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      },
    );
  });
  const rpc = vi.fn(
    async (_name: string, args: { p_provider_ids: string[] }) => {
      providers = args.p_provider_ids.map((id) => {
        const provider = providers.find((candidate) => candidate.id === id);
        if (!provider) throw new Error("Unknown test provider");
        return provider;
      });
      return { error: null };
    },
  );
  const service = createModelConfigService({
    getAdminClient: () => ({ from, rpc }) as unknown as AdminSupabaseClient,
    secret,
  });
  vi.spyOn(service, "role").mockResolvedValue("admin");
  vi.spyOn(service, "syncNetworkSettings").mockResolvedValue(undefined);
  return { service };
}

afterEach(clearProviders);

it("orders the public catalog by saved provider order and preserves each administrator model list and default", async () => {
  const { service } = setup();
  const catalog = await service.catalog();
  const admin = await service.list();
  expect([...new Set(catalog.models.map((model) => model.providerId))]).toEqual(
    admin.providers.map((provider) => provider.id),
  );
  for (const provider of admin.providers) {
    expect(
      catalog.models.filter((model) => model.providerId === provider.id),
    ).toEqual(admin.models.filter((model) => model.providerId === provider.id));
  }
  expect(catalog.models.some((model) => model.providerId === uuid(4))).toBe(
    false,
  );
  for (const kind of kinds) {
    expect(
      catalog.models
        .filter((model) => model.kind === kind)
        .map((model) => model.key),
    ).toEqual([1, 2, 0, 3].map((index) => `configured/${kind}-${index}`));
    expect((await service.resolve(kind)).model.key).toBe(
      `configured/${kind}-0`,
    );
  }
});

it("publishes a reordered catalog consistently through chat, image and video endpoints after invalidating the cache", async () => {
  const { service } = setup();
  const app = Fastify();
  app.addHook("preHandler", async () => {
    await refreshConfiguredProviders(service);
  });
  await registerModelRoutes(app, loadServerEnv(), service);
  await registerImageModelRoutes(app);
  await registerVideoModelRoutes(app);
  const endpoints: Array<[ModelKind, string]> = [
    ["text", "/api/models"],
    ["audio", "/api/models?kind=audio"],
    ["image", "/api/models?kind=image"],
    ["video", "/api/models?kind=video"],
    ["image", "/api/image-models"],
    ["video", "/api/video-models"],
  ];
  try {
    for (const [kind, url] of endpoints) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, response.body).toBe(200);
      expect(
        response.json().models.map((model: { id: string }) => model.id),
      ).toEqual([1, 2, 0, 3].map((index) => `configured/${kind}-${index}`));
      expect(response.json().models[0].providerId).toBe(uuid(1));
      expect(response.json().models[0].iconUrl).toBe("/providers/agnes.ico");
      expect(response.json().models[2].iconUrl).toBe("/providers/google.svg");
    }
    await service.reorderProviders("admin", {
      providerIds: [uuid(3), uuid(2), uuid(1)],
    });
    for (const [kind, url] of endpoints) {
      const response = await app.inject({ method: "GET", url });
      expect(
        response.json().models.map((model: { id: string }) => model.id),
      ).toEqual([3, 0, 1, 2].map((index) => `configured/${kind}-${index}`));
      expect(response.json().models[0].providerId).toBe(uuid(3));
      expect(response.json().models[0].iconUrl).toBe("/providers/agnes.ico");
      expect(JSON.stringify(response.json())).not.toContain(
        "api_key_ciphertext",
      );
    }
  } finally {
    await app.close();
  }
});
