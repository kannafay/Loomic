import { once } from "node:events";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as wait } from "node:timers/promises";
import { afterEach, expect, it } from "vitest";
import type { ModelConfigService } from "../features/model-config/model-config-service.js";
import { discoverProviderModels } from "../features/model-config/model-discovery.js";
import {
  configuredChatModel,
  refreshConfiguredProviders,
} from "../features/model-config/runtime.js";
import { generateImage } from "../generation/image-generation.js";
import {
  clearProviders,
  resolveImageProviderName,
  resolveVideoProviderName,
} from "../generation/providers/registry.js";
import { generateVideo } from "../generation/video-generation.js";
import {
  applyNetworkProxy,
  providerFetch,
  withProviderProxy,
  withProviderProxyStream,
} from "./network-proxy.js";

const servers: Server[] = [];
async function start(server: Server) {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function proxyResponse(
  body: string | ((request: string) => string),
  contentType = "application/json",
) {
  const destinations: string[] = [];
  const proxy = createServer();
  proxy.on("connect", (request, socket) => {
    destinations.push(request.url ?? "");
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    socket.once("data", (request) => {
      const content =
        typeof body === "function" ? body(request.toString()) : body;
      socket.end(
        `HTTP/1.1 200 OK\r\nContent-Type: ${contentType}\r\nContent-Length: ${Buffer.byteLength(content)}\r\nConnection: close\r\n\r\n${content}`,
      );
    });
  });
  return { url: await start(proxy), destinations };
}
afterEach(async () => {
  clearProviders();
  applyNetworkProxy(null);
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});

it.each(["image", "video"] as const)(
  "routes configured Agnes %s generation and preserves the proxy policy for media downloads",
  async (kind) => {
    const global = await proxyResponse("wrong route");
    applyNetworkProxy({
      httpProxy: global.url,
      httpsProxy: global.url,
      noProxy: "",
    });
    const custom = await proxyResponse(
      kind === "image"
        ? JSON.stringify({
            data: [
              {
                b64_json:
                  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKu0AAAAASUVORK5CYII=",
              },
            ],
          })
        : (request) =>
            JSON.stringify(
              request.startsWith("POST")
                ? { video_id: "task" }
                : {
                    status: "completed",
                    url: "https://cdn.example.test/result.mp4",
                    seconds: "4",
                    size: "720P",
                  },
            ),
    );
    const proxy = { mode: "custom" as const, url: custom.url };
    await refreshConfiguredProviders({
      syncNetworkSettings: async () => {},
      catalog: async () => ({
        providers: [
          {
            id: "provider",
            createdBy: "admin",
            name: "Agnes 测试",
            category: "manufacturer",
            preset: "agnes",
            protocol: "openai",
            baseUrl: "http://agnes-proxy-check.invalid/v1",
            apiKey: "dummy-key",
            enabled: true,
            hasApiKey: true,
            proxy,
          },
        ],
        models: [
          {
            id: "model",
            providerId: "provider",
            key: "configured/test",
            apiModel:
              kind === "image" ? "agnes-image-test" : "agnes-video-2.5-flash",
            name: "测试",
            kind,
            adapter: "agnes",
            description: "",
            enabled: true,
            isDefault: true,
            options: {},
          },
        ],
      }),
    } as unknown as ModelConfigService);
    const result =
      kind === "image"
        ? await generateImage(resolveImageProviderName("configured/test"), {
            model: "configured/test",
            prompt: "测试",
          })
        : await generateVideo(resolveVideoProviderName("configured/test"), {
            model: "configured/test",
            prompt: "测试",
            duration: 4,
          });
    expect(result.networkProxy).toEqual(proxy);
    expect(result.url).toBeTruthy();
    expect(custom.destinations).toHaveLength(kind === "image" ? 1 : 2);
    expect(global.destinations).toHaveLength(0);
  },
);

it.each([
  ["openai", true],
  ["anthropic", false],
  ["gemini", false],
  ["gemini", true],
] as const)(
  "routes the configured %s chat transport through its own proxy (stream=%s)",
  async (protocol, stream) => {
    const global = await proxyResponse("wrong route");
    applyNetworkProxy({
      httpProxy: global.url,
      httpsProxy: global.url,
      noProxy: "",
    });
    const gemini = {
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
    const body =
      protocol === "openai"
        ? `data: ${JSON.stringify({ id: "chat", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`
        : protocol === "anthropic"
          ? JSON.stringify({
              id: "message",
              type: "message",
              role: "assistant",
              model: "test",
              content: [{ type: "text", text: "OK" }],
              stop_reason: "end_turn",
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 1 },
            })
          : stream
            ? `data: ${JSON.stringify(gemini)}\n\n`
            : JSON.stringify(gemini);
    const custom = await proxyResponse(
      body,
      stream ? "text/event-stream" : "application/json",
    );
    const chat = configuredChatModel(
      {
        id: "model",
        providerId: "provider",
        key: "configured/test",
        apiModel: "test",
        name: "测试",
        kind: "text",
        adapter: "auto",
        description: "",
        enabled: true,
        isDefault: true,
        options: {},
      },
      {
        id: "provider",
        createdBy: "admin",
        name: "测试",
        category: "custom",
        preset: "custom",
        protocol,
        baseUrl: "http://chat-proxy-check.invalid/v1",
        apiKey: "dummy-key",
        hasApiKey: true,
        enabled: true,
        proxy: { mode: "custom", url: custom.url },
      },
    );
    let text = "";
    if (stream)
      for await (const chunk of await chat.stream("只回复 OK"))
        text += String(chunk.content);
    else text = String((await chat.invoke("只回复 OK")).content);
    expect(text).toBe("OK");
    expect(custom.destinations).toHaveLength(1);
    expect(global.destinations).toHaveLength(0);
  },
);

it("isolates simultaneous global, custom, and direct provider requests without changing global settings", async () => {
  const global = await proxyResponse("global");
  const custom = await proxyResponse("custom");
  const local = await start(
    createServer((_request, response) => response.end("direct")),
  );
  applyNetworkProxy({
    httpProxy: global.url,
    httpsProxy: global.url,
    noProxy: "",
  });
  const external = "http://provider-proxy-check.invalid/check";
  const text = async (fetcher: typeof fetch, url: string) =>
    (await fetcher(url)).text();
  const results = await Promise.all([
    text(providerFetch({ mode: "global", url: "" }), external),
    text(providerFetch({ mode: "custom", url: custom.url }), external),
    text(providerFetch({ mode: "direct", url: "" }), local),
    withProviderProxy({ mode: "custom", url: custom.url }, async () => {
      await wait(10);
      return text(globalThis.fetch, external);
    }),
  ]);
  expect(results).toEqual(["global", "custom", "direct", "custom"]);
  expect(await text(globalThis.fetch, external)).toBe("global");
  expect(global.destinations).toHaveLength(2);
  expect(custom.destinations).toHaveLength(2);
});

it("keeps a provider's streaming requests scoped and restores the outer policy", async () => {
  const global = await proxyResponse("global");
  const custom = await proxyResponse("custom");
  applyNetworkProxy({
    httpProxy: global.url,
    httpsProxy: global.url,
    noProxy: "",
  });
  async function* stream() {
    for (let index = 0; index < 2; index++) {
      await wait(1);
      yield await (
        await fetch("http://provider-stream-check.invalid/check")
      ).text();
    }
  }
  const result: string[] = [];
  for await (const value of withProviderProxyStream(
    { mode: "custom", url: custom.url },
    stream(),
  ))
    result.push(value);
  expect(result).toEqual(["custom", "custom"]);
  expect(
    await (await fetch("http://provider-stream-check.invalid/check")).text(),
  ).toBe("global");
});

it("uses provider proxy settings for model discovery and fails rather than falling back to another route", async () => {
  const global = await proxyResponse(
    JSON.stringify({ data: [{ id: "global-model" }] }),
  );
  const custom = await proxyResponse(
    JSON.stringify({ data: [{ id: "custom-model" }] }),
  );
  applyNetworkProxy({
    httpProxy: global.url,
    httpsProxy: global.url,
    noProxy: "",
  });
  const provider = {
    protocol: "openai" as const,
    baseUrl: "http://discovery-check.invalid/v1",
    preset: "custom",
    apiKey: "dummy-key",
  };
  expect(
    (
      await discoverProviderModels({
        ...provider,
        proxy: { mode: "custom", url: custom.url },
      })
    ).models[0]?.apiModel,
  ).toBe("custom-model");
  const requests = global.destinations.length;
  await expect(
    discoverProviderModels({
      ...provider,
      proxy: { mode: "custom", url: "http://127.0.0.1:1" },
    }),
  ).rejects.toThrow("无法获取模型列表");
  expect(global.destinations).toHaveLength(requests);
});
