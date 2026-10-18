import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverProviderModels } from "./model-discovery.js";
import { PROVIDER_PRESETS } from "./provider-presets.js";

const provider = {
  protocol: "openai" as const,
  baseUrl: "https://provider.example/v1",
  apiKey: "private-discovery-key",
  preset: "custom",
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => vi.unstubAllGlobals());

describe("provider model discovery", () => {
  it("reads OpenAI-compatible lists, deduplicates IDs and leaves unknown/embedding types unclassified", async () => {
    const fetcher = vi.fn(async (_url: URL, _init: RequestInit) =>
      json({
        data: [
          { id: "gpt-4.1" },
          { id: "gpt-4.1" },
          { id: "gpt-image-1" },
          { id: "tts-1" },
          { id: "sora-2" },
          { id: "private-model" },
          { id: "text-embedding-3-large" },
          {
            id: "vendor/my-chat",
            supported_endpoint_types: ["chat/completions"],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await discoverProviderModels(provider);
    expect(result.models.map((model) => [model.apiModel, model.kind])).toEqual([
      ["gpt-4.1", "text"],
      ["gpt-image-1", "image"],
      ["tts-1", "audio"],
      ["sora-2", "video"],
      ["private-model", null],
      ["text-embedding-3-large", null],
      ["vendor/my-chat", "text"],
    ]);
    expect(result.truncated).toBe(false);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://provider.example/v1/models",
    );
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${provider.apiKey}`,
        }),
        redirect: "error",
      }),
    );
  });
  it.each([
    ["deepseek", "deepseek-next", "DeepSeek Next"],
    ["minimax", "MiniMax-M4", "MiniMax M4"],
  ])(
    "discovers new %s text models through its preset endpoint",
    async (presetId, apiModel, name) => {
      const preset = PROVIDER_PRESETS.find((item) => item.id === presetId);
      if (!preset) throw new Error(`Missing preset: ${presetId}`);
      const fetcher = vi.fn(async (_url: URL, _init: RequestInit) =>
        json({ data: [{ id: apiModel, name }] }),
      );
      vi.stubGlobal("fetch", fetcher);
      const result = await discoverProviderModels({
        ...provider,
        protocol: preset.protocol,
        baseUrl: preset.baseUrl,
        preset: preset.id,
      });
      expect(String(fetcher.mock.calls[0]?.[0])).toBe(
        `${preset.baseUrl}/models`,
      );
      expect(fetcher).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${provider.apiKey}`,
          }),
        }),
      );
      expect(result.models).toEqual([
        { apiModel, name, description: "", kind: "text" },
      ]);
    },
  );
  it("follows Gemini pagination on the saved endpoint, strips models/ and sends the key only in a header", async () => {
    const urls: URL[] = [];
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      urls.push(new URL(url));
      expect(init.headers).toMatchObject({ "x-goog-api-key": provider.apiKey });
      return urls.length === 1
        ? json({
            models: [
              {
                name: "models/gemini-2.5-flash",
                displayName: "Gemini Flash",
                supportedGenerationMethods: ["generateContent"],
              },
            ],
            nextPageToken: "next/page?token",
          })
        : json({
            models: [
              { name: "models/veo-3.1-generate-preview" },
              { name: "models/gemini-2.5-flash-image" },
            ],
          });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await discoverProviderModels({
      ...provider,
      protocol: "gemini",
      baseUrl: "https://provider.example/gemini/v1beta/",
      preset: "google",
    });
    expect(urls.map((url) => url.pathname)).toEqual([
      "/gemini/v1beta/models",
      "/gemini/v1beta/models",
    ]);
    expect(urls[0]?.searchParams.get("pageSize")).toBe("1000");
    expect(urls[1]?.searchParams.get("pageToken")).toBe("next/page?token");
    expect(urls.some((url) => String(url).includes(provider.apiKey))).toBe(
      false,
    );
    expect(result.models.map((model) => [model.apiModel, model.kind])).toEqual([
      ["gemini-2.5-flash", "text"],
      ["veo-3.1-generate-preview", "video"],
      ["gemini-2.5-flash-image", "image"],
    ]);
    expect(result.models[0]?.name).toBe("Gemini Flash");
  });
  it.each([
    "https://provider.example/anthropic",
    "https://provider.example/anthropic/v1",
  ])(
    "reads Anthropic pagination with the proper headers and versioned path: %s",
    async (baseUrl) => {
      const urls: URL[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: URL, init: RequestInit) => {
          urls.push(new URL(url));
          expect(init.headers).toMatchObject({
            "x-api-key": provider.apiKey,
            "anthropic-version": "2023-06-01",
          });
          return urls.length === 1
            ? json({
                data: [{ id: "claude-first", display_name: "Claude First" }],
                has_more: true,
                last_id: "claude-first",
              })
            : json({ data: [{ id: "claude-next" }], has_more: false });
        }),
      );
      const result = await discoverProviderModels({
        ...provider,
        baseUrl,
        protocol: "anthropic",
      });
      expect(urls[1]?.pathname).toBe("/anthropic/v1/models");
      expect(urls[1]?.searchParams.get("after_id")).toBe("claude-first");
      expect(result.models).toHaveLength(2);
      expect(result.models[0]).toMatchObject({
        name: "Claude First",
        kind: "text",
      });
    },
  );
  it("classifies live Agnes model IDs and keeps upstream names without adding preset models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          data: [
            { id: "agnes-next-flash" },
            {
              id: "agnes-image-next",
              name: "最新图片模型",
              description: "接口说明",
            },
            { id: "agnes-video-next" },
          ],
        }),
      ),
    );
    const result = await discoverProviderModels({
      ...provider,
      preset: "agnes",
    });
    expect(result.models.map((model) => model.kind)).toEqual([
      "text",
      "image",
      "video",
    ]);
    expect(result.models).toEqual([
      {
        apiModel: "agnes-next-flash",
        name: "Agnes Next Flash",
        description: "",
        kind: "text",
      },
      {
        apiModel: "agnes-image-next",
        name: "最新图片模型",
        description: "接口说明",
        kind: "image",
      },
      {
        apiModel: "agnes-video-next",
        name: "Agnes Video Next",
        description: "",
        kind: "video",
      },
    ]);
  });
  it("formats missing names while preserving model IDs, versions and upstream labels", async () => {
    const entries = [
      { id: "agnes-2.5-flash" },
      { id: "agnes-3.0-flash", name: " " },
      { id: "agnes-image-2.1-flash", display_name: "" },
      { id: "agnes-image-2.5-flash", displayName: null },
      { id: "agnes-video-2.5-flash" },
      { id: "gpt-4.1-mini" },
      { id: "tts_1_hd" },
      { id: "team/DeepSeek-v3.2" },
      { id: "custom-model", name: "我的自定义模型" },
      { id: "labelled-model", displayName: "official-label-v2" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ data: entries })),
    );
    const result = await discoverProviderModels(provider);
    expect(result.models.map((model) => model.apiModel)).toEqual(
      entries.map((entry) => entry.id),
    );
    expect(result.models.map((model) => model.name)).toEqual([
      "Agnes 2.5 Flash",
      "Agnes 3.0 Flash",
      "Agnes Image 2.1 Flash",
      "Agnes Image 2.5 Flash",
      "Agnes Video 2.5 Flash",
      "GPT 4.1 Mini",
      "TTS 1 HD",
      "Team/DeepSeek V3.2",
      "我的自定义模型",
      "official-label-v2",
    ]);
  });
  it("prefers live modality metadata over model ID heuristics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          data: [
            {
              id: "gpt-4.1",
              output_modalities: ["audio"],
              name: "当前语音模型",
            },
          ],
        }),
      ),
    );
    const result = await discoverProviderModels({
      ...provider,
      preset: "openai",
    });
    expect(result.models).toEqual([
      {
        apiModel: "gpt-4.1",
        name: "当前语音模型",
        description: "",
        kind: "audio",
      },
    ]);
  });
  it.each([
    [401, "鉴权失败"],
    [404, "未提供模型列表接口"],
    [429, "过于频繁"],
  ])(
    "reports HTTP %s without leaking provider response or key",
    async (status, expected) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(`sensitive upstream echo ${provider.apiKey}`, {
              status,
            }),
        ),
      );
      const error = await discoverProviderModels(provider).catch(
        (error) => error,
      );
      expect(error.message).toContain(expected);
      expect(JSON.stringify({ message: error.message })).not.toContain(
        provider.apiKey,
      );
    },
  );
  it("rejects invalid list responses and sanitizes metadata/network errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: provider.apiKey } }))
      .mockResolvedValueOnce(
        json({
          data: [
            {
              id: "gpt-4.1",
              name: provider.apiKey,
              description: `secret=${provider.apiKey}`,
            },
            { id: provider.apiKey },
          ],
        }),
      )
      .mockRejectedValueOnce(
        new Error(`network error containing ${provider.apiKey}`),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(discoverProviderModels(provider)).rejects.toThrow(
      "格式不受支持",
    );
    const result = await discoverProviderModels(provider);
    expect(result.models).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(provider.apiKey);
    await expect(discoverProviderModels(provider)).rejects.toThrow(
      "检查接口地址、网络和代理配置",
    );
  });
  it("supports unauthenticated local endpoints and bounds repeating pagination", async () => {
    const fetcher = vi.fn(async (_url: URL, _init: RequestInit) =>
      json({
        data: [{ id: "local-model" }],
        has_more: true,
        last_id: "same-cursor",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await discoverProviderModels({
      ...provider,
      apiKey: "",
      baseUrl: "http://127.0.0.1:8000/v1",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "Authorization",
    );
    expect(result).toMatchObject({
      truncated: true,
      models: [{ apiModel: "local-model" }],
    });
  });
});
