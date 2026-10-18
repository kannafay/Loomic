import { expect, it, vi } from "vitest";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { createModelConfigService } from "./model-config-service.js";

const providerIds = [
  "22222222-2222-4222-8222-222222222222",
  "11111111-1111-4111-8111-111111111111",
];
function setup() {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const service = createModelConfigService({
    getAdminClient: () => ({ rpc }) as unknown as AdminSupabaseClient,
    secret: "unused",
  });
  const role = vi.spyOn(service, "role").mockResolvedValue("admin");
  return { service, rpc, role };
}
it("commits the complete provider order in one database transaction", async () => {
  const { service, rpc } = setup();
  await service.reorderProviders("admin", { providerIds });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("reorder_model_providers", {
    p_provider_ids: providerIds,
  });
});
it("rejects ordinary users before changing the order", async () => {
  const { service, rpc, role } = setup();
  role.mockResolvedValue("user");
  await expect(
    service.reorderProviders("ordinary", { providerIds }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(rpc).not.toHaveBeenCalled();
});
it("keeps a concurrent reorder when an existing provider's configuration is saved", async () => {
  const row = {
    id: providerIds[0],
    created_by: providerIds[1],
    name: "原配置",
    category: "custom",
    preset: "custom",
    protocol: "openai",
    base_url: "http://localhost:9999/v1",
    enabled: true,
    api_key_ciphertext: "",
    sort_order: 1,
  };
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => {
      const snapshot = { ...row };
      row.sort_order = 2;
      return { data: snapshot, error: null };
    }),
    update: vi.fn((patch: Partial<typeof row>) => {
      Object.assign(row, patch);
      return query;
    }),
    single: vi.fn(async () => ({ data: row, error: null })),
  };
  const service = createModelConfigService({
    getAdminClient: () =>
      ({ from: () => query }) as unknown as AdminSupabaseClient,
    secret: "unused",
  });
  vi.spyOn(service, "role").mockResolvedValue("admin");
  await service.saveProvider(
    "admin",
    {
      name: "新配置",
      category: "custom",
      preset: "custom",
      protocol: "openai",
      baseUrl: "http://localhost:9999/v1",
      enabled: true,
    },
    row.id,
  );
  expect(row.name).toBe("新配置");
  expect(row.sort_order).toBe(2);
  expect(row.api_key_ciphertext).toBe("");
});
it.each([
  ["P0001", 409, "提供商列表已变化"],
  ["db_unavailable", 503, "提供商排序保存失败"],
])(
  "handles %s without exposing database details",
  async (code, statusCode, message) => {
    const { service, rpc } = setup();
    rpc.mockResolvedValueOnce({
      error: { code, message: "private-db-detail" },
    });
    await expect(
      service.reorderProviders("admin", { providerIds }),
    ).rejects.toMatchObject({
      statusCode,
      message: expect.stringContaining(message),
    });
  },
);
