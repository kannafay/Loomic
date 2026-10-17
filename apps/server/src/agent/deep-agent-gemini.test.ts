import { StateBackend } from "deepagents";
import { afterEach, expect, it, vi } from "vitest";

import { loadServerEnv } from "../config/env.js";
import { createLoomicDeepAgent } from "./deep-agent.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("serializes all agent tools into Gemini-compatible schemas", async () => {
  const incompatible: string[] = [];
  let declarations: Array<{ name: string; parameters?: unknown }> = [];
  vi.stubEnv("GOOGLE_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      declarations = body.tools.flatMap(
        (group: { functionDeclarations?: typeof declarations }) =>
          group.functionDeclarations ?? [],
      );
      const inspect = (schema: unknown, path: string): void => {
        if (!schema || typeof schema !== "object") return;
        if (Array.isArray((schema as { type?: unknown }).type))
          incompatible.push(`${path}.type`);
        for (const key of ["exclusiveMinimum", "exclusiveMaximum"]) {
          if (key in schema) incompatible.push(`${path}.${key}`);
        }
        for (const [key, value] of Object.entries(schema))
          inspect(value, `${path}.${key}`);
      };
      for (const declaration of declarations)
        inspect(declaration.parameters, declaration.name);
      const chunk = {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "OK" }] },
            finishReason: "STOP",
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      };
      return new Response(`data: ${JSON.stringify(chunk)}\n\n`, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
  const agent = createLoomicDeepAgent({
    env: loadServerEnv({}, { GOOGLE_API_KEY: "test-key" }),
    model: "google:gemini-3.8-flash",
    backendResult: { factory: () => new StateBackend() },
  });
  const stream = await agent.stream({
    messages: [{ role: "user", content: "Only reply OK." }],
  });
  for await (const _chunk of stream) {
    /* Consume the complete model response. */
  }
  expect(declarations.map((declaration) => declaration.name)).toContain(
    "generate_video",
  );
  expect(declarations.map((declaration) => declaration.name)).toContain("grep");
  expect(incompatible).toEqual([]);
  const grep = declarations.find((declaration) => declaration.name === "grep");
  expect(grep?.parameters).toMatchObject({
    properties: {
      glob: { type: "string", nullable: true },
      max_count: { type: "integer", minimum: 1, nullable: true },
    },
  });
});
