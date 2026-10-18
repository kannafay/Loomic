import { once } from "node:events";
import websocket from "@fastify/websocket";
import {
  type ModelInfo,
  type ModelKind,
  modelPreferencesSchema,
} from "@loomic/shared";
import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import type { AgentRunService } from "../../agent/runtime.js";
import { registerRunRoutes } from "../../http/runs.js";
import { registerSettingsRoutes } from "../../http/settings.js";
import type {
  AuthenticatedUser,
  UserSupabaseClient,
} from "../../supabase/user.js";
import { ConnectionManager } from "../../ws/connection-manager.js";
import { registerWsRoute } from "../../ws/handler.js";
import { createSettingsService } from "./settings-service.js";

function fixture() {
  const saved = new Map<string, unknown>([
    ["one", {}],
    ["two", {}],
  ]);
  const writes = vi.fn();
  const catalogs = Object.fromEntries(
    ["text", "audio", "image", "video"].map((kind) => [
      kind,
      [
        { id: `${kind}-agnes`, name: "Agnes", provider: "Agnes AI" },
        {
          id: `${kind}-google`,
          name: "Google",
          provider: "Google",
          isDefault: true,
        },
      ],
    ]),
  ) as Record<ModelKind, ModelInfo[]>;
  const createUserClient = (token: string) =>
    ({
      from: (table: string) => {
        expect(table).toBe("profiles");
        let id = "";
        let update: { model_preferences: unknown } | undefined;
        const query = {
          select: () => query,
          eq: (column: string, value: string) => {
            expect(column).toBe("id");
            id = value;
            return query;
          },
          update: (value: typeof update) => {
            update = value;
            return query;
          },
          single: async () => {
            if (id !== token) return { error: { message: "RLS" }, data: null };
            if (update) {
              writes(id);
              saved.set(id, update.model_preferences);
            }
            return {
              error: null,
              data: { id, model_preferences: saved.get(id) },
            };
          },
        };
        return query;
      },
    }) as unknown as UserSupabaseClient;
  const user = (id: string): AuthenticatedUser => ({
    id,
    accessToken: id,
    email: `${id}@example.test`,
    userMetadata: {},
  });
  const service = createSettingsService({
    createUserClient,
    listModels: async (kind) => catalogs[kind],
  });
  return { saved, catalogs, user, service, writes };
}

it("starts a conversation with the personal default, retains an explicit request and blocks an unavailable default before a run is created", async () => {
  const f = fixture();
  const app = Fastify();
  const createRun = vi.fn((payload) => ({
    ...payload,
    runId: "run",
    status: "accepted",
  }));
  await registerRunRoutes(app, { createRun } as unknown as AgentRunService, {
    auth: { authenticate: async () => f.user("one") },
    settingsService: f.service,
  });
  try {
    const payload = {
      sessionId: "session",
      conversationId: "conversation",
      prompt: "hello",
    };
    const request = (extra = {}) =>
      app.inject({
        method: "POST",
        url: "/api/agent/runs",
        headers: { authorization: "Bearer one" },
        payload: { ...payload, ...extra },
      });
    expect((await request()).statusCode).toBe(202);
    expect(createRun).toHaveBeenLastCalledWith(
      payload,
      expect.objectContaining({ model: "text-agnes" }),
    );
    f.saved.set("one", { text: "text-google" });
    expect((await request()).statusCode).toBe(202);
    expect(createRun).toHaveBeenLastCalledWith(
      payload,
      expect.objectContaining({ model: "text-google" }),
    );
    expect((await request({ model: "text-agnes" })).statusCode).toBe(202);
    expect(createRun).toHaveBeenLastCalledWith(
      { ...payload, model: "text-agnes" },
      expect.objectContaining({ model: "text-agnes" }),
    );
    f.saved.set("one", { text: "removed" });
    expect((await request()).statusCode).toBe(400);
    expect(createRun).toHaveBeenCalledTimes(3);
  } finally {
    await app.close();
  }
});

it("stores all four personal types, keeps null automatic values and isolates accounts", async () => {
  const f = fixture();
  const preferences = {
    text: "text-google",
    audio: null,
    image: "image-agnes",
    video: "video-google",
  };
  await f.service.updateModelPreferences(f.user("one"), preferences);
  expect(await f.service.getModelPreferences(f.user("one"))).toEqual(
    preferences,
  );
  expect(await f.service.getModelPreferences(f.user("two"))).toEqual(
    modelPreferencesSchema.parse({}),
  );
  expect(f.writes).toHaveBeenCalledExactlyOnceWith("one");
});

it("resolves explicit choices before personal preferences, then takes the first available in current order", async () => {
  const f = fixture();
  for (const kind of ["text", "audio", "image", "video"] as const) {
    expect(await f.service.resolveModelPreference(f.user("one"), kind)).toBe(
      `${kind}-agnes`,
    );
    f.catalogs[kind].reverse();
    expect(await f.service.resolveModelPreference(f.user("one"), kind)).toBe(
      `${kind}-google`,
    );
  }
  f.saved.set("one", { text: "text-agnes" });
  expect(await f.service.resolveModelPreference(f.user("one"), "text")).toBe(
    "text-agnes",
  );
  expect(
    await f.service.resolveModelPreference(
      f.user("one"),
      "text",
      "text-google",
    ),
  ).toBe("text-google");
});

it("does not silently switch an unavailable saved or explicit default and rejects a model of another type", async () => {
  const f = fixture();
  f.saved.set("one", { image: "removed" });
  await expect(
    f.service.resolveModelPreference(f.user("one"), "image"),
  ).rejects.toThrow("重新选择");
  await expect(
    f.service.resolveModelPreference(f.user("one"), "text", "removed"),
  ).rejects.toThrow("重新选择");
  await expect(
    f.service.updateModelPreferences(f.user("one"), {
      text: null,
      audio: null,
      image: "text-google",
      video: null,
    }),
  ).rejects.toThrow("重新选择");
  f.catalogs.audio = [];
  await expect(
    f.service.resolveModelPreference(f.user("one"), "audio"),
  ).rejects.toThrow("暂无可用模型");
  expect(f.writes).not.toHaveBeenCalled();
});

it("allows clearing an unavailable default and retaining it while editing a different type", async () => {
  const f = fixture();
  f.saved.set("one", { image: "removed" });
  await f.service.updateModelPreferences(f.user("one"), {
    text: "text-google",
    image: "removed",
    audio: null,
    video: null,
  });
  await f.service.updateModelPreferences(
    f.user("one"),
    modelPreferencesSchema.parse({}),
  );
  expect(await f.service.resolveModelPreference(f.user("one"), "image")).toBe(
    "image-agnes",
  );
});

it("authenticates preference routes and rejects malformed updates without saving", async () => {
  const f = fixture();
  const app = Fastify();
  await registerSettingsRoutes(app, {
    settingsService: f.service,
    auth: {
      authenticate: async (request) =>
        request.headers.authorization === "Bearer one" ? f.user("one") : null,
    },
    viewerService: { ensureViewer: vi.fn() },
  });
  try {
    for (const method of ["GET", "PUT"] as const)
      expect(
        (await app.inject({ method, url: "/api/viewer/model-preferences" }))
          .statusCode,
      ).toBe(401);
    const get = await app.inject({
      method: "GET",
      url: "/api/viewer/model-preferences",
      headers: { authorization: "Bearer one" },
    });
    expect(get.json()).toEqual({
      preferences: modelPreferencesSchema.parse({}),
    });
    const invalid = await app.inject({
      method: "PUT",
      url: "/api/viewer/model-preferences",
      headers: { authorization: "Bearer one" },
      payload: { image: "", userId: "two" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(f.writes).not.toHaveBeenCalled();
    const preferences = {
      text: null,
      audio: null,
      image: "image-google",
      video: null,
    };
    const put = await app.inject({
      method: "PUT",
      url: "/api/viewer/model-preferences",
      headers: { authorization: "Bearer one" },
      payload: preferences,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ preferences });
  } finally {
    await app.close();
  }
});

it("reports an unavailable personal default immediately over WebSocket and accepts a corrected default on the same connection", async () => {
  const f = fixture();
  f.saved.set("one", { text: "removed" });
  const app = Fastify();
  await app.register(websocket);
  const createRun = vi.fn((payload) => ({
    ...payload,
    runId: "run",
    status: "accepted",
  }));
  const connectionManager = new ConnectionManager();
  await registerWsRoute(app, {
    connectionManager,
    auth: { authenticate: async () => f.user("one") },
    settingsService: f.service,
    agentRuns: {
      createRun,
      streamRun: async function* () {},
    } as unknown as AgentRunService,
  });
  await app.ready();
  const socket = await app.injectWS("/api/ws?token=one&connectionId=prefs");
  const command = {
    type: "command",
    action: "agent.run",
    payload: {
      sessionId: "session",
      conversationId: "conversation",
      prompt: "hello",
    },
  };
  try {
    await vi.waitFor(() =>
      expect(connectionManager.get("prefs")).toBeDefined(),
    );
    const rejected = once(socket, "message");
    socket.send(JSON.stringify(command));
    expect(JSON.parse(String((await rejected)[0]))).toEqual({
      type: "command.ack",
      action: "agent.run",
      payload: { error: expect.stringContaining("重新选择") },
    });
    expect(createRun).not.toHaveBeenCalled();
    f.saved.set("one", {});
    const accepted = once(socket, "message");
    socket.send(JSON.stringify(command));
    expect(JSON.parse(String((await accepted)[0]))).toEqual({
      type: "command.ack",
      action: "agent.run",
      payload: expect.objectContaining({ runId: "run" }),
    });
    expect(createRun).toHaveBeenCalledWith(
      command.payload,
      expect.objectContaining({ model: "text-agnes" }),
    );
  } finally {
    socket.terminate();
    connectionManager.dispose();
    await app.close();
  }
});
