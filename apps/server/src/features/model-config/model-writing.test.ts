import type { ConfiguredModelWrite, ModelProtocol } from "@loomic/shared";
import { expect, it, vi } from "vitest";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { createModelConfigService } from "./model-config-service.js";

const providerId = "11111111-1111-4111-8111-111111111111";
const modelId = "22222222-2222-4222-8222-222222222222";
const row = {
  id: modelId,
  provider_id: providerId,
  model_key: `configured/${modelId}`,
  kind: "text",
  protocol: "anthropic",
  api_model: "custom-model",
  name: "内部模型",
  description: "已有说明",
  adapter: "auto",
  enabled: true,
  is_default: true,
  options: { temperature: 0.3 },
};
const value: ConfiguredModelWrite = {
  providerId,
  kind: "text",
  apiModel: row.api_model,
  name: row.name,
  description: row.description,
  adapter: "auto",
  enabled: true,
  options: row.options,
};
function setup(protocol: ModelProtocol = "openai") {
  const provider = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: providerId, protocol, preset: "custom" },
      error: null,
    }),
  };
  const models = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({
      data: { ...row, ...models.upsert.mock.calls.at(-1)?.[0] },
      error: null,
    })),
  };
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const service = createModelConfigService({
    getAdminClient: () =>
      ({
        from: (table: string) =>
          table === "model_providers" ? provider : models,
        rpc,
      }) as unknown as AdminSupabaseClient,
    secret: Buffer.alloc(32, 7).toString("base64"),
  });
  vi.spyOn(service, "role").mockResolvedValue("admin");
  return { service, models, rpc };
}

it("persists a model's purpose and protocol while preserving its stable key and clearing an obsolete default", async () => {
  const { service, models } = setup("anthropic");
  const saved = await service.saveModel(
    "admin",
    { ...value, kind: "image", protocol: "gemini" },
    modelId,
  );
  expect(models.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      model_key: row.model_key,
      kind: "image",
      protocol: "gemini",
      is_default: false,
      description: row.description,
      options: row.options,
    }),
  );
  expect(saved).toMatchObject({
    key: row.model_key,
    kind: "image",
    protocol: "gemini",
  });
});

it("preserves a saved protocol when older clients only toggle a model's enabled state", async () => {
  const { service, models } = setup();
  const saved = await service.saveModel(
    "admin",
    { ...value, enabled: false },
    modelId,
  );
  expect(models.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ protocol: "anthropic", enabled: false }),
  );
  expect(saved.protocol).toBe("anthropic");
});

it("keeps new legacy clients' models inheriting the provider protocol", async () => {
  const { service, models } = setup("gemini");
  const saved = await service.saveModel("admin", value);
  expect(models.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ protocol: null }),
  );
  expect(saved.protocol).toBeUndefined();
});

it("rejects non-text models using Anthropic before any model write", async () => {
  const { service, models } = setup();
  await expect(
    service.saveModel("admin", {
      ...value,
      kind: "video",
      protocol: "anthropic",
    }),
  ).rejects.toThrow("只支持文本模型");
  expect(models.upsert).not.toHaveBeenCalled();
});

it("includes each staged model's protocol in atomic provider creation and validates the effective protocol", async () => {
  const { service, rpc } = setup();
  const input = {
    provider: {
      name: "内部网关",
      category: "custom" as const,
      preset: "custom",
      protocol: "anthropic" as const,
      baseUrl: "https://example.test/v1",
      enabled: true,
    },
    models: [{ ...value, kind: "image" as const, protocol: "gemini" as const }],
  };
  await service.createProviderWithModels(providerId, input);
  expect(rpc).toHaveBeenCalledWith(
    "create_model_provider_with_models",
    expect.objectContaining({
      p_models: [
        expect.objectContaining({ kind: "image", protocol: "gemini" }),
      ],
    }),
  );
  rpc.mockClear();
  await expect(
    service.createProviderWithModels(providerId, {
      ...input,
      models: [{ ...value, kind: "image" }],
    }),
  ).rejects.toThrow("只支持文本模型");
  expect(rpc).not.toHaveBeenCalled();
});
