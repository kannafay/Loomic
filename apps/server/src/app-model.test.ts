import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  savedModel: null as string | null,
}));

vi.mock("./supabase/user.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supabase/user.js")>()),
  createUserSupabaseClientFactory: () => () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: mocks.savedModel ? { default_model: mocks.savedModel } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock(
  "./features/bootstrap/ensure-user-foundation.js",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("./features/bootstrap/ensure-user-foundation.js")
    >()),
    createViewerService: () => ({
      ensureViewer: async () => ({ workspace: { id: "test-workspace" } }),
    }),
  }),
);

import { buildApp } from "./app.js";

afterEach(() => {
  mocks.savedModel = null;
});

describe("agent model configuration", () => {
  it.each([
    [null, "google:gemini-3.8-flash"],
    ["google:gemini-2.5-flash", "google:gemini-2.5-flash"],
  ])(
    "uses the configured default while preserving a saved workspace selection (%s)",
    async (saved, expected) => {
      mocks.savedModel = saved;
      const app = buildApp({
        env: {
          agentModel: "google:gemini-3.8-flash",
          googleApiKey: "test-key",
        },
        auth: {
          authenticate: async () => ({
            id: "test-user",
            email: "test@example.com",
            accessToken: "test-token",
            userMetadata: {},
          }),
        },
      });
      try {
        const settings = await app.inject({
          method: "GET",
          url: "/api/workspace/settings",
        });
        expect(settings.statusCode).toBe(200);
        expect(settings.json()).toEqual({
          settings: { defaultModel: expected },
        });
        const models = await app.inject({ method: "GET", url: "/api/models" });
        expect(models.json().models).toContainEqual({
          id: "google:gemini-3.8-flash",
          name: "Gemini 3.8 Flash",
          provider: "google",
        });
        for (const url of ["/api/image-models", "/api/video-models"]) {
          const response = await app.inject({ method: "GET", url });
          expect(response.statusCode).toBe(200);
          expect(response.json().models.length).toBeGreaterThan(0);
          for (const model of response.json().models) {
            expect(model).not.toHaveProperty("minTier");
            expect(model).not.toHaveProperty("creditCost");
            expect(model).not.toHaveProperty("accessible", false);
          }
        }
        expect(
          (await app.inject({ method: "GET", url: "/api/credits" })).statusCode,
        ).toBe(404);
      } finally {
        await app.close();
      }
    },
  );
});
