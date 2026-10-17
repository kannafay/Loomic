import type { ConfiguredModel } from "@loomic/shared";
import { afterEach, expect, it, vi } from "vitest";
import { generateImage } from "../../generation/image-generation.js";
import {
  clearProviders,
  getAvailableImageModels,
  resolveImageProviderName,
} from "../../generation/providers/registry.js";
import type {
  ModelConfigService,
  PrivateProvider,
} from "./model-config-service.js";
import { refreshConfiguredProviders } from "./runtime.js";

afterEach(() => {
  vi.unstubAllGlobals();
  clearProviders();
});
it("routes a configured Agnes image model by its saved API ID and advertises its configured name", async () => {
  const provider: PrivateProvider = {
    id: "provider-1",
    createdBy: "admin-1",
    name: "内部 Agnes",
    category: "third_party",
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
      displayName: model.name,
      provider: "agnes",
    }),
  ]);
  const result = await generateImage(resolveImageProviderName(model.key), {
    model: model.key,
    prompt: "雪山日出",
  });
  expect(result.width).toBe(1);
  expect(fetch).toHaveBeenCalledOnce();
});
