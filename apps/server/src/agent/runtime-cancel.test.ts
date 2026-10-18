import { AIMessageChunk } from "@langchain/core/messages";
import { InMemoryStore, MemorySaver } from "@langchain/langgraph-checkpoint";
import { modelPreferencesSchema } from "@loomic/shared";
import { expect, it, vi } from "vitest";
import { loadServerEnv } from "../config/env.js";
import {
  clearProviders,
  registerImageProvider,
  registerVideoProvider,
} from "../generation/providers/registry.js";
import type { LoomicAgent } from "./deep-agent.js";
import { createAgentRunService } from "./runtime.js";

// The stream is synthetic; no filesystem sandbox or database is needed.
vi.mock("./backends/index.js", () => ({
  createAgentBackend: () => ({ factory: vi.fn() }),
}));

function setup(eventDelayMs = 0) {
  const updateRun = vi.fn().mockResolvedValue(undefined);
  const streamEvents = vi.fn(() =>
    (async function* () {
      yield {
        event: "on_chat_model_stream",
        data: {
          chunk: new AIMessageChunk({ id: "message-1", content: "部分回复" }),
        },
      };
      // Some providers close the stream normally when aborted instead of throwing.
    })(),
  );
  const service = createAgentRunService({
    env: loadServerEnv({}, {}),
    agentFactory: () => ({ streamEvents }) as unknown as LoomicAgent,
    agentPersistenceService: {
      getPersistence: async () => ({
        checkpointer: new MemorySaver(),
        store: new InMemoryStore(),
      }),
    },
    agentRunMetadataService: { createAcceptedRun: vi.fn(), updateRun },
    eventDelayMs,
  });
  const { runId } = service.createRun(
    {
      sessionId: "session-1",
      conversationId: "conversation-1",
      canvasId: "canvas-1",
      prompt: "测试停止",
    },
    { threadId: "thread-1" },
  );
  return { service, runId, updateRun };
}

it("loads personal media defaults into automatic assistant tools without making a model request", async () => {
  const imageModels = ["image-first", "image-personal"].map((id) => ({
    id,
    displayName: id,
    description: "",
  }));
  const videoModels = ["video-first", "video-other"].map((id) => ({
    id,
    displayName: id,
    description: "",
    capabilities: {
      textToVideo: true,
      imageToVideo: false,
      videoToVideo: false,
      audio: false,
    },
    limits: {
      maxDuration: 8,
      maxResolution: "720p" as const,
      maxInputImages: 0,
    },
  }));
  const generate = vi.fn();
  registerImageProvider({ name: "test-images", models: imageModels, generate });
  registerVideoProvider({ name: "test-videos", models: videoModels, generate });
  const getModelPreferences = vi
    .fn()
    .mockResolvedValue(
      modelPreferencesSchema.parse({ image: "image-personal" }),
    );
  const agentFactory = vi.fn(
    () => ({ streamEvents: async function* () {} }) as unknown as LoomicAgent,
  );
  const service = createAgentRunService({
    env: loadServerEnv({}, {}),
    getModelPreferences,
    agentFactory,
  });
  try {
    const { runId } = service.createRun(
      { sessionId: "session", conversationId: "conversation", prompt: "hello" },
      { accessToken: "token", userId: "one" },
    );
    const events = [];
    for await (const event of service.streamRun(runId)) events.push(event);
    expect(events.some((event) => event.type === "run.failed")).toBe(false);
    expect(agentFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        availableImageModels: [
          expect.objectContaining({ id: "image-personal" }),
        ],
        availableVideoModels: [expect.objectContaining({ id: "video-first" })],
      }),
    );
    expect(getModelPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ id: "one", accessToken: "token" }),
    );
    expect(generate).not.toHaveBeenCalled();
  } finally {
    clearProviders();
  }
});

it("cancels a partial reply and persists a terminal cancellation when the provider closes normally", async () => {
  const { service, runId, updateRun } = setup();
  const events = [];
  for await (const event of service.streamRun(runId)) {
    events.push(event);
    if (event.type === "message.delta") service.cancelRun(runId);
  }
  expect(events.some((event) => event.type === "message.delta")).toBe(true);
  expect(events.at(-1)?.type).toBe("run.canceled");
  expect(
    events.some(
      (event) => event.type === "run.completed" || event.type === "run.failed",
    ),
  ).toBe(false);
  expect(updateRun).toHaveBeenLastCalledWith(
    expect.objectContaining({
      runId,
      status: "failed",
      errorCode: "run_canceled",
      completedAt: expect.any(String),
    }),
  );
});

it("persists cancellation while waiting between stream events", async () => {
  const { service, runId, updateRun } = setup(10);
  const events = [];
  for await (const event of service.streamRun(runId)) {
    events.push(event);
    if (event.type === "run.started") service.cancelRun(runId);
  }
  expect(events.map((event) => event.type)).toEqual([
    "run.started",
    "run.canceled",
  ]);
  expect(updateRun).toHaveBeenLastCalledWith(
    expect.objectContaining({
      runId,
      status: "failed",
      errorCode: "run_canceled",
    }),
  );
});
