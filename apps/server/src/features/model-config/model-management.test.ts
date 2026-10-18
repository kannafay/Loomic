import { expect, it, vi } from "vitest";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { createModelConfigService } from "./model-config-service.js";

const modelId = "11111111-1111-4111-8111-111111111111";
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
it("imports only the chosen live models without preset names, settings or additional models", async () => {
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
        enabled: false,
      }),
    ],
    { onConflict: "provider_id,kind,api_model", ignoreDuplicates: true },
  );
});
