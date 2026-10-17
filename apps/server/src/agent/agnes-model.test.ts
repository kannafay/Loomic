import { ChatOpenAI } from "@langchain/openai";
import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { loadServerEnv } from "../config/env.js";
import { registerAllProviders } from "../generation/providers/register-all.js";
import { clearProviders } from "../generation/providers/registry.js";
import { registerImageModelRoutes } from "../http/image-models.js";
import { registerModelRoutes } from "../http/models.js";
import { registerVideoModelRoutes } from "../http/video-models.js";
import {
  createDefaultModelSpecifier,
  createStreamingChatModel,
} from "./deep-agent.js";
import { createVideoGenerateTool } from "./tools/video-generate.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearProviders();
});

it("streams ordinary chat with real tool schemas using Agnes credentials and endpoint", async () => {
  vi.stubEnv("OPENAI_API_KEY", "other-provider-key");
  vi.stubEnv("OPENAI_BASE_URL", "https://other-provider.example/v1");
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  let capturedBody: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init.headers);
      capturedBody = JSON.parse(String(init.body));
      const chunk = (delta: unknown, finish_reason: string | null = null) =>
        `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", model: "agnes-3.0-flash", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
      return new Response(
        `${
          chunk({ role: "assistant", content: "连接正常" }) + chunk({}, "stop")
        }data: [DONE]\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }),
  );
  const env = loadServerEnv({}, { AGNES_API_KEY: "agnes-test-key" });
  registerAllProviders(env);
  const model = createStreamingChatModel("agnes:agnes-3.0-flash", env);
  expect(model).toBeInstanceOf(ChatOpenAI);
  if (!(model instanceof ChatOpenAI))
    throw new Error("Expected ChatOpenAI compatibility adapter");
  let reply = "";
  for await (const chunk of await model
    .bindTools([createVideoGenerateTool()])
    .stream("只回复连接正常")) {
    if (typeof chunk.content === "string") reply += chunk.content;
  }
  expect(reply).toBe("连接正常");
  expect(capturedUrl).toBe("https://api.agnes-ai.cn/v1/chat/completions");
  expect(capturedHeaders.get("authorization")).toBe("Bearer agnes-test-key");
  expect(capturedBody).toMatchObject({
    model: "agnes-3.0-flash",
    stream: true,
    tools: expect.any(Array),
  });
  expect(capturedBody).not.toHaveProperty("stream_options");
  expect(process.env.OPENAI_API_KEY).toBe("other-provider-key");
});

it("requires an Agnes key instead of falling back to an unrelated provider", () => {
  expect(() => createStreamingChatModel("agnes:agnes-3.0-flash", {})).toThrow(
    "AGNES_API_KEY",
  );
  expect(createDefaultModelSpecifier({ agentModel: "agnes-3.0-flash" })).toBe(
    "agnes:agnes-3.0-flash",
  );
  expect(loadServerEnv({}, { AGNES_API_KEY: "key" }).agentModel).toBe(
    "agnes:agnes-3.0-flash",
  );
  expect(
    loadServerEnv(
      {},
      { AGNES_API_KEY: "key", LOOMIC_AGENT_MODEL: "google:gemini-3.8-flash" },
    ).agentModel,
  ).toBe("google:gemini-3.8-flash");
});

it("publishes configured Agnes models across all three categories", async () => {
  const env = loadServerEnv({}, { AGNES_API_KEY: "key" });
  registerAllProviders(env);
  const app = Fastify();
  await registerModelRoutes(app, env);
  await registerImageModelRoutes(app);
  await registerVideoModelRoutes(app);
  try {
    for (const [url, count] of [
      ["/api/models", 3],
      ["/api/image-models", 3],
      ["/api/video-models", 2],
    ] as const) {
      const response = await app.inject({ url });
      expect(response.statusCode).toBe(200);
      expect(response.json().models).toHaveLength(count);
      expect(
        response
          .json()
          .models.every(
            (model: { provider: string }) => model.provider === "agnes",
          ),
      ).toBe(true);
      expect(response.body).not.toContain("agnes-3.0-pro");
    }
  } finally {
    await app.close();
  }
});
