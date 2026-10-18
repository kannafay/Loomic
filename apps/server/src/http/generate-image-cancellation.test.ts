import { request } from "node:http";
import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { UploadService } from "../features/uploads/upload-service.js";
import {
  clearProviders,
  registerImageProvider,
} from "../generation/providers/registry.js";
import type {
  GeneratedImage,
  ImageGenerateParams,
} from "../generation/types.js";
import { registerGenerateRoutes } from "./generate.js";

const generated = {
  url: "data:image/png;base64,aGVsbG8=",
  width: 1,
  height: 1,
  mimeType: "image/png",
};
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  clearProviders();
});

async function api(
  generate: (params: ImageGenerateParams) => Promise<GeneratedImage>,
  beforeAuthenticate?: () => Promise<void>,
) {
  registerImageProvider({
    name: "test",
    models: [{ id: "test/image", displayName: "Test", description: "" }],
    generate,
  });
  const upload = vi.fn().mockResolvedValue({
    url: "http://localhost/saved.png",
    asset: { id: "asset" },
  });
  const app = Fastify();
  apps.push(app);
  await registerGenerateRoutes(app, {
    auth: {
      authenticate: async () => {
        await beforeAuthenticate?.();
        return {
          id: "user",
          accessToken: "token",
          email: "test@example.com",
          userMetadata: {},
        };
      },
    },
    viewerService: {
      ensureViewer: async () => ({ workspace: { id: "workspace" } }),
    } as unknown as ViewerService,
    uploadService: { uploadFile: upload } as unknown as UploadService,
  });
  return { app, upload };
}

it("does not abort a normal POST when the body finishes, and persists the result", async () => {
  let signal: AbortSignal | undefined;
  const { app, upload } = await api(async (params) => {
    signal = params.signal;
    return generated;
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/agent/generate-image",
    payload: { prompt: "雪山", model: "test/image" },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    url: "http://localhost/saved.png",
    assetId: "asset",
  });
  expect(signal?.aborted).toBe(false);
  expect(upload).toHaveBeenCalledOnce();
});

it("propagates a real client disconnect to the provider and skips storage", async () => {
  let signal: AbortSignal | undefined;
  let providerStopped = false;
  const { app, upload } = await api(
    (params) =>
      new Promise((_, reject) => {
        signal = params.signal;
        signal?.addEventListener(
          "abort",
          () => {
            providerStopped = true;
            reject(signal?.reason);
          },
          { once: true },
        );
      }),
  );
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = request(`${address}/api/agent/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  client.on("error", () => {});
  client.end(JSON.stringify({ prompt: "雪山", model: "test/image" }));
  try {
    await vi.waitFor(() => expect(signal).toBeDefined());
  } finally {
    client.destroy();
  }
  await vi.waitFor(() => expect(providerStopped).toBe(true));
  expect(signal?.aborted).toBe(true);
  expect(upload).not.toHaveBeenCalled();
});

it("discards a late provider result after disconnect instead of uploading it", async () => {
  let signal: AbortSignal | undefined;
  let finish!: (image: GeneratedImage) => void;
  const { app, upload } = await api((params) => {
    signal = params.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = request(`${address}/api/agent/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  client.on("error", () => {});
  client.end(JSON.stringify({ prompt: "雪山", model: "test/image" }));
  try {
    await vi.waitFor(() => expect(signal).toBeDefined());
    client.destroy();
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
  } finally {
    client.destroy();
    finish?.(generated);
  }
  await app.close();
  expect(upload).not.toHaveBeenCalled();
});

it("does not start generation when the client disconnects during authentication", async () => {
  let authenticating = false;
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const generate = vi.fn().mockResolvedValue(generated);
  const { app, upload } = await api(generate, () => {
    authenticating = true;
    return gate;
  });
  let disconnected = false;
  app.addHook("onRequest", async (_request, reply) => {
    reply.raw.on("close", () => {
      disconnected = true;
    });
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = request(`${address}/api/agent/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  client.on("error", () => {});
  client.end(JSON.stringify({ prompt: "雪山", model: "test/image" }));
  try {
    await vi.waitFor(() => expect(authenticating).toBe(true));
    client.destroy();
    await vi.waitFor(() => expect(disconnected).toBe(true));
  } finally {
    client.destroy();
    resume();
  }
  await app.close();
  expect(generate).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});
