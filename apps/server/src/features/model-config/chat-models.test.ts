import type { ConfiguredModel } from "@loomic/shared";
import { afterEach, expect, it, vi } from "vitest";
import type { PrivateProvider } from "./model-config-service.js";
import { configuredChatModel } from "./runtime.js";

afterEach(() => vi.unstubAllGlobals());
it.each(["openai", "anthropic", "gemini"] as const)(
  "uses the saved model and custom endpoint for the %s protocol",
  async (protocol) => {
    const model: ConfiguredModel = {
      id: "model-1",
      key: "configured/model-1",
      providerId: "provider-1",
      name: "自定义模型",
      apiModel: "gemini-custom",
      kind: "text",
      adapter: "auto",
      enabled: true,
      isDefault: true,
      description: "",
      options: { maxTokens: 32 },
    };
    const provider: PrivateProvider = {
      id: "provider-1",
      createdBy: "admin-1",
      name: "自定义",
      category: "custom",
      preset: "custom",
      protocol,
      baseUrl: "https://model-proxy.example.test/v1",
      apiKey: "test-private-key",
      hasApiKey: true,
      enabled: true,
    };
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const isRequest = typeof url === "object" && "clone" in url;
        const body = isRequest
          ? await (url as Request).clone().text()
          : String(init?.body ?? "{}");
        requests.push({
          url: isRequest ? (url as Request).url : String(url),
          body: JSON.parse(body),
        });
        if (protocol === "openai")
          return new Response(
            `data: ${JSON.stringify({ id: "chat-1", object: "chat.completion.chunk", model: model.apiModel, choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "chat-1", object: "chat.completion.chunk", model: model.apiModel, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
            { headers: { "Content-Type": "text/event-stream" } },
          );
        if (protocol === "anthropic")
          return new Response(
            JSON.stringify({
              id: "message-1",
              type: "message",
              role: "assistant",
              model: model.apiModel,
              content: [{ type: "text", text: "OK" }],
              stop_reason: "end_turn",
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        return new Response(
          JSON.stringify({
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
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetch);
    const llm = configuredChatModel(model, provider);
    let text = "";
    if (protocol === "openai") {
      for await (const chunk of await llm.stream("Only reply OK"))
        text += String(chunk.content);
    } else text = String((await llm.invoke("Only reply OK")).content);
    expect(text).toBe("OK");
    const inference = requests.filter((request) =>
      request.url.startsWith("https://model-proxy.example.test/"),
    );
    expect(inference).toHaveLength(1);
    if (protocol === "gemini")
      expect(inference[0]?.url).toContain(model.apiModel);
    else expect(inference[0]?.body.model).toBe(model.apiModel);
  },
);
