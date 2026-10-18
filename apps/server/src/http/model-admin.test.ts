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
    revealProviderApiKey: vi.fn(async () => ({ apiKey: "saved-test-key" })),
    saveModel: vi.fn(),
    setRole: vi.fn(),
    users: vi.fn(),
    importPresetModels: vi.fn(),
    discoverModels: vi.fn(async () => ({ models: [], truncated: false })),
    importDiscoveredModels: vi.fn(async () => ({ imported: 1, skipped: 0 })),
    setDefault: vi.fn(),
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
      ["POST", "/api/admin/providers"],
      ["POST", "/api/admin/providers/create-with-models"],
      ["POST", "/api/admin/providers/discover-models"],
      ["POST", "/api/admin/providers/test-connection"],
      ["GET", "/api/admin/network"],
      ["PUT", "/api/admin/network"],
      ["PUT", `/api/admin/providers/${id}`],
      ["POST", `/api/admin/providers/${id}/api-key`],
      ["POST", "/api/admin/models"],
      ["PUT", `/api/admin/models/${id}`],
      ["POST", `/api/admin/models/${id}/default`],
      ["POST", `/api/admin/providers/${id}/import-models`],
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
    expect(service.saveProvider).not.toHaveBeenCalled();
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
