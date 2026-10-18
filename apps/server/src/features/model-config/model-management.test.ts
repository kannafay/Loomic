import { expect, it, vi } from "vitest";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { createModelConfigService } from "./model-config-service.js";

const modelId = "11111111-1111-4111-8111-111111111111";
function setupBulkDelete() {
  const providerQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { id: modelId }, error: null }),
  };
  const modelsQuery = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
  };
  const from = vi.fn((table: string) =>
    table === "model_providers" ? providerQuery : modelsQuery,
  );
  const service = createModelConfigService({
    getAdminClient: () => ({ from }) as unknown as AdminSupabaseClient,
    secret: "unused",
  });
  const role = vi.spyOn(service, "role").mockResolvedValue("admin");
  return { service, providerQuery, modelsQuery, from, role };
}

it.each([0, 3, 1500])(
  "deletes all model types in one provider-scoped operation with exact count %s",
  async (count) => {
    const { service, providerQuery, modelsQuery, from } = setupBulkDelete();
    modelsQuery.eq.mockResolvedValueOnce({ count, error: null });
    expect(await service.deleteProviderModels("admin", modelId)).toEqual({
      deleted: count,
    });
    expect(providerQuery.eq).toHaveBeenCalledExactlyOnceWith("id", modelId);
    expect(modelsQuery.delete).toHaveBeenCalledExactlyOnceWith({
      count: "exact",
    });
    expect(modelsQuery.eq).toHaveBeenCalledExactlyOnceWith(
      "provider_id",
      modelId,
    );
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "model_providers",
      "configured_models",
    ]);
  },
);

it("rejects bulk deletion by ordinary users before touching any table", async () => {
  const { service, from, role } = setupBulkDelete();
  role.mockResolvedValue("user");
  await expect(
    service.deleteProviderModels("ordinary", modelId),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(from).not.toHaveBeenCalled();
});

it("does not delete models when the provider is missing or cannot be read", async () => {
  const { service, providerQuery, modelsQuery } = setupBulkDelete();
  providerQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  await expect(
    service.deleteProviderModels("admin", modelId),
  ).rejects.toMatchObject({ statusCode: 404 });
  providerQuery.maybeSingle.mockResolvedValueOnce({
    data: null,
    error: { code: "offline" },
  });
  await expect(
    service.deleteProviderModels("admin", modelId),
  ).rejects.toMatchObject({ statusCode: 503 });
  expect(modelsQuery.delete).not.toHaveBeenCalled();
});

it("reports a rejected bulk delete without returning private database details", async () => {
  const { service, modelsQuery } = setupBulkDelete();
  modelsQuery.eq.mockResolvedValueOnce({
    count: null,
    error: { code: "offline", message: "private-db-detail" },
  });
  await expect(
    service.deleteProviderModels("admin", modelId),
  ).rejects.toMatchObject({
    statusCode: 503,
    message: "模型删除失败，请重试。",
  });
});

function setup() {
  const query = {
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { id: modelId }, error: null }),
  };
  const from = vi.fn(() => query);
  const service = createModelConfigService({
    getAdminClient: () => ({ from }) as unknown as AdminSupabaseClient,
    secret: "unused",
  });
  const role = vi.spyOn(service, "role").mockResolvedValue("admin");
  return { service, query, from, role };
}
it("deletes only the requested model configuration", async () => {
  const { service, query, from } = setup();
  await service.deleteModel("admin", modelId);
  expect(from).toHaveBeenCalledExactlyOnceWith("configured_models");
  expect(query.delete).toHaveBeenCalledOnce();
  expect(query.eq).toHaveBeenCalledExactlyOnceWith("id", modelId);
});
it("rejects ordinary users before querying the database", async () => {
  const { service, from, role } = setup();
  role.mockResolvedValue("user");
  await expect(service.deleteModel("ordinary", modelId)).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(from).not.toHaveBeenCalled();
});
it.each([
  [{ data: null, error: null }, 404, "模型不存在或已删除。"],
  [
    {
      data: null,
      error: { code: "db_unavailable", message: "private-db-detail" },
    },
    503,
    "模型删除失败，请重试。",
  ],
])(
  "distinguishes missing models from database failures",
  async (result, statusCode, message) => {
    const { service, query } = setup();
    query.maybeSingle.mockResolvedValueOnce(result);
    await expect(service.deleteModel("admin", modelId)).rejects.toMatchObject({
      statusCode,
      message,
    });
  },
);
it("imports and enables only the chosen new models without overwriting existing models", async () => {
  const providerQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { preset: "agnes", protocol: "openai" },
      error: null,
    }),
  };
  const modelsQuery = {
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({ data: [{ id: modelId }], error: null }),
  };
  const service = createModelConfigService({
    getAdminClient: () =>
      ({
        from: (table: string) =>
          table === "model_providers" ? providerQuery : modelsQuery,
      }) as unknown as AdminSupabaseClient,
    secret: "unused",
  });
  vi.spyOn(service, "role").mockResolvedValue("admin");
  const model = {
    apiModel: "agnes-video-next",
    name: "接口最新视频",
    description: "接口说明",
    kind: "video" as const,
  };
  expect(
    await service.importDiscoveredModels("admin", modelId, {
      models: [model, model],
    }),
  ).toEqual({ imported: 1, skipped: 0 });
  expect(modelsQuery.upsert).toHaveBeenCalledExactlyOnceWith(
    [
      expect.objectContaining({
        provider_id: modelId,
        api_model: model.apiModel,
        name: model.name,
        description: model.description,
        kind: "video",
        adapter: "agnes",
        options: {},
        enabled: true,
      }),
    ],
    { onConflict: "provider_id,kind,api_model", ignoreDuplicates: true },
  );
});
