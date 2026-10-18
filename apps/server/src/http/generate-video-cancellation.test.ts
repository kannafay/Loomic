import { request } from "node:http";
import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { JobService } from "../features/jobs/job-service.js";
import type { UploadService } from "../features/uploads/upload-service.js";
import { GoogleVideoProvider } from "../generation/providers/google-video.js";
import {
  clearProviders,
  registerVideoProvider,
} from "../generation/providers/registry.js";
import { registerGenerateRoutes } from "./generate.js";

const id = "11111111-1111-4111-8111-111111111111";
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  clearProviders();
});

async function api(
  beforeCreate?: () => Promise<void>,
  beforeAuth?: () => Promise<void>,
) {
  registerVideoProvider(new GoogleVideoProvider("test"));
  const createJob = vi.fn(async () => {
    await beforeCreate?.();
    return { id };
  });
  const cancelJob = vi.fn().mockResolvedValue({ id, status: "canceled" });
  const getJobAdmin = vi.fn();
  const app = Fastify();
  apps.push(app);
  await registerGenerateRoutes(app, {
    auth: {
      authenticate: async () => {
        await beforeAuth?.();
        return {
          id: "user",
          accessToken: "token",
          email: "test@example.com",
          userMetadata: {},
        };
      },
    },
    jobService: { createJob, cancelJob, getJobAdmin } as unknown as JobService,
    viewerService: {
      ensureViewer: async () => ({ workspace: { id: "workspace" } }),
    } as unknown as ViewerService,
    uploadService: {} as UploadService,
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = request(`${address}/api/agent/generate-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  client.on("error", () => {});
  const send = () =>
    client.end(JSON.stringify({ prompt: "云海", duration: 8 }));
  return { app, client, send, createJob, cancelJob, getJobAdmin };
}

it("cancels the queued video and exits polling when the caller stops the request", async () => {
  const fixture = await api();
  fixture.send();
  try {
    await vi.waitFor(() => expect(fixture.createJob).toHaveBeenCalledOnce());
  } finally {
    fixture.client.destroy();
  }
  await vi.waitFor(() =>
    expect(fixture.cancelJob).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "user" }),
      id,
    ),
  );
  await fixture.app.close();
  expect(fixture.getJobAdmin).not.toHaveBeenCalled();
});

it("cancels a job created after its client has already disconnected", async () => {
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const fixture = await api(() => gate);
  let disconnected = false;
  fixture.app.server.on("connection", (socket) =>
    socket.on("close", () => {
      disconnected = true;
    }),
  );
  fixture.send();
  try {
    await vi.waitFor(() => expect(fixture.createJob).toHaveBeenCalledOnce());
    fixture.client.destroy();
    await vi.waitFor(() => expect(disconnected).toBe(true));
  } finally {
    fixture.client.destroy();
    resume();
  }
  await vi.waitFor(() => expect(fixture.cancelJob).toHaveBeenCalledOnce());
  await fixture.app.close();
  expect(fixture.getJobAdmin).not.toHaveBeenCalled();
});

it("does not enqueue a video if stopped before authentication finishes", async () => {
  let resume!: () => void;
  let started = false;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const fixture = await api(undefined, () => {
    started = true;
    return gate;
  });
  let disconnected = false;
  fixture.app.server.on("connection", (socket) =>
    socket.on("close", () => {
      disconnected = true;
    }),
  );
  fixture.send();
  try {
    await vi.waitFor(() => expect(started).toBe(true));
    fixture.client.destroy();
    await vi.waitFor(() => expect(disconnected).toBe(true));
  } finally {
    fixture.client.destroy();
    resume();
  }
  await fixture.app.close();
  expect(fixture.createJob).not.toHaveBeenCalled();
  expect(fixture.cancelJob).not.toHaveBeenCalled();
});
