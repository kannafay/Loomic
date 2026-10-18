import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelConfigService } from "../features/model-config/model-config-service.js";
import { ModelConfigError } from "../features/model-config/model-config-service.js";
import { registerModelAdminRoutes } from "./model-admin.js";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function setup() {
  const app = Fastify();
  apps.push(app);
  const service = {
    requireAdmin: vi.fn(async (id: string) => {
      if (id !== "admin")
        throw new ModelConfigError("只有管理员可以配置后台。", 403);
    }),
    role: vi.fn(async (id: string) => (id === "admin" ? "admin" : "user")),
    list: vi.fn(async () => ({ providers: [], models: [], presets: [] })),
    saveProvider: vi.fn(),
    reorderProviders: vi.fn(),
    revealProviderApiKey: vi.fn(async () => ({ apiKey: "saved-test-key" })),
    saveModel: vi.fn(),
    deleteModel: vi.fn(),
    deleteProviderModels: vi.fn(async () => ({ deleted: 3 })),
    setRole: vi.fn(),
    users: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    discoverModels: vi.fn(async () => ({ models: [], truncated: false })),
    importDiscoveredModels: vi.fn(async () => ({ imported: 1, skipped: 0 })),
    createProviderWithModels: vi.fn(),
    discoverDraftModels: vi.fn(),
    testProviderConnection: vi.fn(),
    networkSettings: vi.fn(),
    saveNetworkSettings: vi.fn(),
  };
  await registerModelAdminRoutes(app, {
    service: service as unknown as ModelConfigService,
    auth: {
      authenticate: async (request) =>
        request.headers.authorization
          ? {
              id:
                request.headers.authorization === "Bearer admin"
                  ? "admin"
                  : "ordinary",
              accessToken: "test-token",
              email: "test@example.test",
              userMetadata: {},
            }
          : null,
    },
  });
  return { app, service };
}
describe("model administration authorization", () => {
  it("no longer exposes administrator-wide model default configuration", async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/models/11111111-1111-4111-8111-111111111111/default",
      headers: { authorization: "Bearer admin" },
    });
    expect(response.statusCode).toBe(404);
  });
  it("validates provider-wide model deletion and restricts it to authenticated administrators", async () => {
    const { app, service } = await setup();
    const id = "11111111-1111-4111-8111-111111111111";
    for (const [authorization, expected] of [
      [undefined, 401],
      ["Bearer ordinary", 403],
    ] as const) {
      const response = await app.inject({
        method: "DELETE",
        url: `/api/admin/providers/${id}/models`,
        headers: authorization ? { authorization } : {},
      });
      expect(response.statusCode).toBe(expected);
    }
    const invalid = await app.inject({
      method: "DELETE",
      url: "/api/admin/providers/invalid/models",
      headers: { authorization: "Bearer admin" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(service.deleteProviderModels).not.toHaveBeenCalled();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/admin/providers/${id}/models`,
      headers: { authorization: "Bearer admin" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: 3 });
    expect(service.deleteProviderModels).toHaveBeenCalledExactlyOnceWith(
      "admin",
      id,
    );
    expect(service.deleteModel).not.toHaveBeenCalled();
    service.deleteProviderModels.mockRejectedValueOnce(
      new ModelConfigError("模型删除失败，请重试。", 503),
    );
    const failed = await app.inject({
      method: "DELETE",
      url: `/api/admin/providers/${id}/models`,
      headers: { authorization: "Bearer admin" },
    });
    expect(failed.statusCode).toBe(503);
    expect(failed.json().error.message).toBe("模型删除失败，请重试。");
  });
  it("validates model deletion and allows only authenticated administrators", async () => {
    const { app, service } = await setup();
    const id = "11111111-1111-4111-8111-111111111111";
    for (const [authorization, expected] of [
      [undefined, 401],
      ["Bearer ordinary", 403],
    ] as const) {
      const response = await app.inject({
        method: "DELETE",
        url: `/api/admin/models/${id}`,
        headers: authorization ? { authorization } : {},
      });
      expect(response.statusCode).toBe(expected);
    }
    expect(service.deleteModel).not.toHaveBeenCalled();
    const invalid = await app.inject({
      method: "DELETE",
      url: "/api/admin/models/invalid",
      headers: { authorization: "Bearer admin" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(service.deleteModel).not.toHaveBeenCalled();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/admin/models/${id}`,
      headers: { authorization: "Bearer admin" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(service.deleteModel).toHaveBeenCalledExactlyOnceWith("admin", id);
  });
  it("validates and persists an administrator's provider ordering", async () => {
    const { app, service } = await setup();
    const providerIds = [
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
    ];
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/providers/order",
      headers: { authorization: "Bearer admin" },
      payload: { providerIds },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(service.reorderProviders).toHaveBeenCalledExactlyOnceWith("admin", {
      providerIds,
    });
    service.reorderProviders.mockClear();
    for (const invalid of [
      [],
      [providerIds[0], providerIds[0]],
      ["invalid-id"],
    ]) {
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/api/admin/providers/order",
            headers: { authorization: "Bearer admin" },
            payload: { providerIds: invalid },
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(service.reorderProviders).not.toHaveBeenCalled();
    expect(service.saveProvider).not.toHaveBeenCalled();
  });
  it("reports a changed provider list as a conflict", async () => {
    const { app, service } = await setup();
    service.reorderProviders.mockRejectedValueOnce(
      new ModelConfigError("提供商列表已变化，请刷新页面后重新排序。", 409),
    );
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/admin/providers/order",
          headers: { authorization: "Bearer admin" },
          payload: { providerIds: ["11111111-1111-4111-8111-111111111111"] },
        })
      ).statusCode,
    ).toBe(409);
  });
  it("validates and authorizes deletion and returns no sensitive account data", async () => {
    const { app, service } = await setup();
    const id = "11111111-1111-4111-8111-111111111111";
    const headers = { authorization: "Bearer admin" };
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/admin/users/${id}`,
      headers,
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.headers["cache-control"]).toBe("no-store");
    expect(deleted.json()).toEqual({ ok: true });
    expect(service.deleteUser).toHaveBeenCalledExactlyOnceWith("admin", id);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/admin/users/invalid",
          headers,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: "DELETE", url: `/api/admin/users/${id}` }))
        .statusCode,
    ).toBe(401);
    expect(service.deleteUser).toHaveBeenCalledTimes(1);
    service.deleteUser.mockRejectedValueOnce(
      new ModelConfigError("不能删除当前登录账号。", 409),
    );
    const rejected = await app.inject({
      method: "DELETE",
      url: `/api/admin/users/${id}`,
      headers,
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.message).toBe("不能删除当前登录账号。");
    service.deleteUser.mockRejectedValueOnce(
      new Error("private-database-fixture"),
    );
    const failed = await app.inject({
      method: "DELETE",
      url: `/api/admin/users/${id}`,
      headers,
    });
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toContain("private-database-fixture");
  });
  it("creates and edits accounts only through administrator routes with validated data", async () => {
    const { app, service } = await setup();
    const id = "11111111-1111-4111-8111-111111111111";
    const value = { name: "成员", email: "member@example.test", role: "user" };
    const headers = { authorization: "Bearer admin" };
    service.createUser.mockResolvedValue({ id, ...value });
    service.updateUser.mockResolvedValue({ id, ...value });
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers,
      payload: {
        ...value,
        name: " 成员 ",
        email: " MEMBER@example.test ",
        password: "test-password-1",
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.headers["cache-control"]).toBe("no-store");
    expect(created.json()).toEqual({ user: { id, ...value } });
    expect(created.body).not.toContain("test-password-1");
    expect(service.createUser).toHaveBeenCalledExactlyOnceWith("admin", {
      ...value,
      password: "test-password-1",
    });
    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${id}`,
      headers,
      payload: value,
    });
    expect(updated.statusCode).toBe(200);
    expect(service.updateUser).toHaveBeenCalledExactlyOnceWith(
      "admin",
      id,
      value,
    );
    for (const payload of [
      { ...value, password: "123" },
      { ...value, email: "invalid", password: "test-password-1" },
      {
        ...value,
        password: "test-password-1",
        app_metadata: { role: "admin" },
      },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/admin/users",
            headers,
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/admin/users/invalid-id",
          headers,
          payload: value,
        })
      ).statusCode,
    ).toBe(400);
    expect(service.createUser).toHaveBeenCalledTimes(1);
    expect(service.updateUser).toHaveBeenCalledTimes(1);
    service.createUser.mockRejectedValueOnce(
      new Error("private-password-fixture"),
    );
    const failed = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers,
      payload: { ...value, password: "test-password-1" },
    });
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toContain("private-password-fixture");
  });
  it("rejects unauthenticated access", async () => {
    const { app, service } = await setup();
    expect((await app.inject({ url: "/api/admin/models" })).statusCode).toBe(
      401,
    );
    expect(service.list).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/providers/11111111-1111-4111-8111-111111111111/api-key",
        })
      ).statusCode,
    ).toBe(401);
    expect(service.revealProviderApiKey).not.toHaveBeenCalled();
  });
  it("rejects ordinary users for every configuration and role mutation", async () => {
    const { app, service } = await setup();
    const id = "11111111-1111-4111-8111-111111111111";
    for (const [method, url] of [
      ["GET", "/api/admin/models"],
      ["GET", "/api/admin/users"],
      ["POST", "/api/admin/users"],
      ["PUT", `/api/admin/users/${id}`],
      ["DELETE", `/api/admin/users/${id}`],
      ["POST", "/api/admin/providers"],
      ["PUT", "/api/admin/providers/order"],
      ["POST", "/api/admin/providers/create-with-models"],
      ["POST", "/api/admin/providers/discover-models"],
      ["POST", "/api/admin/providers/test-connection"],
      ["GET", "/api/admin/network"],
      ["PUT", "/api/admin/network"],
      ["PUT", `/api/admin/providers/${id}`],
      ["POST", `/api/admin/providers/${id}/api-key`],
      ["POST", "/api/admin/models"],
      ["PUT", `/api/admin/models/${id}`],
      ["DELETE", `/api/admin/models/${id}`],
      ["GET", `/api/admin/providers/${id}/discover-models`],
      ["POST", `/api/admin/providers/${id}/import-discovered-models`],
      ["PUT", `/api/admin/users/${id}/role`],
    ] as const) {
      expect(
        (
          await app.inject({
            method,
            url,
            headers: { authorization: "Bearer ordinary" },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(service.list).not.toHaveBeenCalled();
    expect(service.createUser).not.toHaveBeenCalled();
    expect(service.updateUser).not.toHaveBeenCalled();
    expect(service.deleteUser).not.toHaveBeenCalled();
    expect(service.saveProvider).not.toHaveBeenCalled();
    expect(service.reorderProviders).not.toHaveBeenCalled();
    expect(service.revealProviderApiKey).not.toHaveBeenCalled();
    expect(service.saveModel).not.toHaveBeenCalled();
    expect(service.setRole).not.toHaveBeenCalled();
    expect(service.discoverModels).not.toHaveBeenCalled();
    expect(service.importDiscoveredModels).not.toHaveBeenCalled();
  });
  it("reveals a single key only for administrators without caching the response", async () => {
    const { app, service } = await setup();
    const id = "11111111-1111-4111-8111-111111111111";
    const response = await app.inject({
      method: "POST",
      url: `/api/admin/providers/${id}/api-key`,
      headers: { authorization: "Bearer admin" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ apiKey: "saved-test-key" });
    expect(service.revealProviderApiKey).toHaveBeenCalledExactlyOnceWith(
      "admin",
      id,
    );
  });
  it("validates the provider id before reading a key", async () => {
    const { app, service } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/providers/invalid-id/api-key",
      headers: { authorization: "Bearer admin" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(service.revealProviderApiKey).not.toHaveBeenCalled();
  });
  it("does not expose internal key errors in the response", async () => {
    const { app, service } = await setup();
    service.revealProviderApiKey.mockRejectedValueOnce(
      new Error("private-fixture"),
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/providers/11111111-1111-4111-8111-111111111111/api-key",
      headers: { authorization: "Bearer admin" },
    });
    expect(response.statusCode).toBe(500);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).not.toContain("private-fixture");
  });
  it("allows model discovery/import for administrators and validates import types", async () => {
    const { app, service } = await setup();
    const id = "11111111-1111-4111-8111-111111111111";
    const headers = { authorization: "Bearer admin" };
    expect(
      (
        await app.inject({
          url: `/api/admin/providers/${id}/discover-models`,
          headers,
        })
      ).json(),
    ).toEqual({ models: [], truncated: false });
    const model = {
      apiModel: "custom-model",
      name: "Custom",
      kind: "text",
      description: "",
    };
    const imported = await app.inject({
      method: "POST",
      url: `/api/admin/providers/${id}/import-discovered-models`,
      headers,
      payload: { models: [model] },
    });
    expect(imported.statusCode).toBe(200);
    expect(service.importDiscoveredModels).toHaveBeenCalledWith("admin", id, {
      models: [model],
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/providers/${id}/import-discovered-models`,
          headers,
          payload: { models: [{ ...model, kind: null }] },
        })
      ).statusCode,
    ).toBe(400);
    expect(service.importDiscoveredModels).toHaveBeenCalledOnce();
  });
  it("allows administrators to load configuration and returns the same user role for access checks", async () => {
    const { app, service } = await setup();
    expect(
      (
        await app.inject({
          url: "/api/admin/models",
          headers: { authorization: "Bearer admin" },
        })
      ).statusCode,
    ).toBe(200);
    expect(service.list).toHaveBeenCalledOnce();
    expect(
      (
        await app.inject({
          url: "/api/access",
          headers: { authorization: "Bearer ordinary" },
        })
      ).json(),
    ).toEqual({ role: "user" });
  });
});
