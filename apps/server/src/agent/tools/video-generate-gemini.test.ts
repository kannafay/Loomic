import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { afterEach, expect, it, vi } from "vitest";
import { createVideoGenerateTool } from "./video-generate.js";

afterEach(() => vi.unstubAllGlobals());

it("serializes video tools into a Gemini-compatible request for ordinary chat", async () => {
  let captured: { tools: Array<{ functionDeclarations: Array<{ name: string; parameters: { properties: Record<string, unknown> } }> }> } | undefined;
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return new Response(JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: "OK" }] }, finishReason: "STOP", index: 0 }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    }), { headers: { "Content-Type": "application/json" } });
  }));
  const model = new ChatGoogleGenerativeAI({ model: "gemini-3.8-flash", apiKey: "test-key", maxRetries: 0 });
  const reply = await model.bindTools([createVideoGenerateTool()]).invoke("Only reply OK.");
  expect(reply.content).toBe("OK");
  const declaration = captured?.tools[0]?.functionDeclarations.find((item) => item.name === "generate_video");
  expect(declaration).toBeDefined();
  expect(declaration?.parameters.properties.inputVideoDuration).toMatchObject({ minimum: 1, maximum: 141 });
  expect(JSON.stringify(captured?.tools)).not.toContain("exclusiveMinimum");
});
