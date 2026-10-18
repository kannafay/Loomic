import type { ConfiguredModel } from "@loomic/shared";
import { afterEach, expect, it, vi } from "vitest";
import { generateImage } from "../../generation/image-generation.js";
import {
  clearProviders,
  getAvailableImageModels,
  getAvailableVideoModels,
  resolveImageProviderName,
} from "../../generation/providers/registry.js";
import type {
  ModelConfigService,
  PrivateProvider,
} from "./model-config-service.js";
import { refreshConfiguredProviders, videoMetadata } from "./runtime.js";

afterEach(() => {
  vi.unstubAllGlobals();
  clearProviders();
});

it("publishes native duration and input limits for configured Agnes and Gemini video models", async () => {
  const providers: PrivateProvider[] = ["agnes", "google"].map((preset) => ({
    id: preset,
    createdBy: "admin-1",
    name: preset,
    category: "manufacturer",
    preset,
    protocol: preset === "google" ? "gemini" : "openai",
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    hasApiKey: true,
    enabled: true,
  }));
  const cases = [
    ["agnes", "agnes-video-2.5-flash"],
    ["agnes", "agnes-video-2.5"],
    ["google", "veo-3.1-generate-preview"],
  ] as const;
  const models: ConfiguredModel[] = cases.map(
    ([providerId, apiModel], index) => ({
      id: `video-${index}`,
      providerId,
      key: `configured/video-${index}`,
      apiModel,
      name: `视频 ${index}`,
      kind: "video",
      description: "",
      adapter: providerId === "agnes" ? "agnes" : "auto",
      enabled: true,
      isDefault: false,
      options: {},
    }),
  );
  await refreshConfiguredProviders({
    syncNetworkSettings: async () => {},
    catalog: async () => ({ providers, models }),
  } as unknown as ModelConfigService);
  const catalog = getAvailableVideoModels();
  expect(catalog[0]).toMatchObject({
    id: "configured/video-0",
    capabilities: {
      imageToVideo: true,
      referenceImages: true,
      videoToVideo: false,
    },
    limits: {
      maxDuration: 12,
      allowedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
      maxResolution: "720p",
      maxInputImages: 5,
    },
  });
  expect(catalog[1]).toMatchObject({
    capabilities: { videoToVideo: true },
    limits: { maxDuration: 12, maxResolution: "1080p", maxInputImages: 8 },
  });
  expect(catalog[2]).toMatchObject({
    capabilities: { referenceImages: true, videoExtension: true },
    limits: {
      maxDuration: 8,
      allowedDurations: [4, 6, 8],
      maxResolution: "2160p",
    },
  });
  const firstModel = models[0];
  if (!firstModel) throw new Error("Expected an Agnes model fixture");
  expect(
    videoMetadata({
      ...firstModel,
      options: {
        capabilities: { referenceImages: false },
        limits: { maxDuration: 10, allowedDurations: [4, 7, 10] },
      },
    }),
  ).toMatchObject({
    capabilities: { imageToVideo: true, referenceImages: false },
    limits: {
      maxDuration: 10,
      allowedDurations: [4, 7, 10],
      maxInputImages: 5,
    },
  });
});
it("routes a configured Agnes image model by its saved API ID and advertises its configured name", async () => {
  const provider: PrivateProvider = {
    id: "provider-1",
    createdBy: "admin-1",
    name: "内部 Agnes",
    category: "manufacturer",
    preset: "agnes",
    protocol: "openai",
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    hasApiKey: true,
    enabled: true,
  };
  const model: ConfiguredModel = {
    id: "model-1",
    providerId: provider.id,
    key: "configured/model-1",
    apiModel: "agnes-image-custom",
    name: "团队图片模型",
    kind: "image",
    description: "",
    adapter: "agnes",
    enabled: true,
    isDefault: true,
    options: {},
  };
  const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    expect(String(url)).toBe("https://api.example.test/v1/images/generations");
    expect(JSON.parse(String(init?.body)).model).toBe("agnes-image-custom");
    return new Response(
      JSON.stringify({
        data: [
          {
            b64_json:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKu0AAAAASUVORK5CYII=",
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const syncNetworkSettings = vi.fn(async () => {});
  const catalog = vi.fn(async () => ({
    providers: [provider],
    models: [model],
  }));
  await refreshConfiguredProviders({
    syncNetworkSettings,
    catalog,
  } as unknown as ModelConfigService);
  expect(syncNetworkSettings).toHaveBeenCalledOnce();
  const networkCall = syncNetworkSettings.mock.invocationCallOrder[0];
  const catalogCall = catalog.mock.invocationCallOrder[0];
  if (networkCall === undefined || catalogCall === undefined)
    throw new Error("Expected network and catalog calls");
  expect(networkCall).toBeLessThan(catalogCall);
  expect(getAvailableImageModels()).toEqual([
    expect.objectContaining({
      id: model.key,
      isDefault: true,
      displayName: model.name,
      provider: "agnes",
      providerId: provider.id,
      providerName: provider.name,
    }),
  ]);
  const result = await generateImage(resolveImageProviderName(model.key), {
    model: model.key,
    prompt: "雪山日出",
  });
  expect(result.width).toBe(1);
  expect(fetch).toHaveBeenCalledOnce();
});

it("publishes saved provider identities for video model grouping", async () => {
  const providers: PrivateProvider[] = ["主账号", "备用账号"].map(
    (name, index) => ({
      id: `provider-${index}`,
      createdBy: "admin-1",
      name,
      category: "manufacturer",
      preset: "agnes",
      protocol: "openai",
      baseUrl: "https://api.example.test/v1",
      apiKey: "test-key",
      hasApiKey: true,
      enabled: true,
    }),
  );
  const models: ConfiguredModel[] = providers.map((provider, index) => ({
    id: `video-${index}`,
    providerId: provider.id,
    key: `configured/video-${index}`,
    apiModel: "agnes-video-test",
    name: "团队视频模型",
    kind: "video",
    description: "",
    adapter: "agnes",
    enabled: true,
    isDefault: index === 0,
    options: {},
  }));
  await refreshConfiguredProviders({
    syncNetworkSettings: async () => {},
    catalog: async () => ({ providers, models }),
  } as unknown as ModelConfigService);
  expect(getAvailableVideoModels()).toEqual(
    providers.map((provider, index) =>
      expect.objectContaining({
        id: `configured/video-${index}`,
        provider: "agnes",
        providerId: provider.id,
        providerName: provider.name,
      }),
    ),
  );
});

it.each(["openai", "gemini"] as const)(
  "uses the image model's %s protocol instead of its provider's default",
  async (protocol) => {
    const provider: PrivateProvider = {
      id: "provider-1",
      createdBy: "admin-1",
      name: "内部网关",
      category: "custom",
      preset: "custom",
      protocol: protocol === "openai" ? "gemini" : "openai",
      baseUrl: "https://api.example.test/v1",
      apiKey: "test-key",
      hasApiKey: true,
      enabled: true,
    };
    const model: ConfiguredModel = {
      id: "image-1",
      providerId: provider.id,
      key: "configured/image-1",
      apiModel: "custom-image",
      name: "内部图片模型",
      kind: "image",
      protocol,
      adapter: "auto",
      description: "",
      enabled: true,
      isDefault: false,
      options: {},
    };
    const image =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKu0AAAAASUVORK5CYII=";
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        requests.push(input instanceof Request ? input.url : String(input));
        return new Response(
          JSON.stringify({
            data: [{ b64_json: image }],
            candidates: [
              {
                content: {
                  parts: [
                    { inlineData: { mimeType: "image/png", data: image } },
                  ],
                },
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    await refreshConfiguredProviders({
      syncNetworkSettings: async () => {},
      catalog: async () => ({ providers: [provider], models: [model] }),
    } as unknown as ModelConfigService);
    const result = await generateImage(resolveImageProviderName(model.key), {
      model: model.key,
      prompt: "雪山日出",
    });
    expect(result.width).toBeGreaterThan(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain(
      protocol === "openai"
        ? "/images/generations"
        : "custom-image:generateContent",
    );
  },
);
