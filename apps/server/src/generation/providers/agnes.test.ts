import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VideoGenerateParams } from "../types.js";
import { AgnesImageProvider } from "./agnes-image.js";
import { AgnesVideoProvider, buildAgnesVideoRequest } from "./agnes-video.js";

const video = {
  model: "agnes/agnes-video-2.5",
  prompt: "镜头缓慢推进",
  duration: 6,
  resolution: "1080p" as const,
};
const flash = {
  ...video,
  model: "agnes/agnes-video-2.5-flash",
  resolution: "720p" as const,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => vi.unstubAllGlobals());

describe("Agnes image transport", () => {
  it("requests Base64 output with native size/ratio fields and reads the actual image dimensions", async () => {
    const png = await sharp({
      create: { width: 32, height: 24, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    const fetchMock = vi.fn(async () =>
      json({ data: [{ b64_json: png.toString("base64") }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const output = await new AgnesImageProvider("image-key").generate({
      model: "agnes/agnes-image-2.5-flash",
      prompt: "红色方块",
      quality: "ultra",
      aspectRatio: "16:9",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(url)).toBe("https://api.agnes-ai.cn/v1/images/generations");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer image-key",
    );
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "agnes-image-2.5-flash",
      size: "4K",
      ratio: "16:9",
      return_base64: true,
      extra_body: { response_format: "b64_json" },
    });
    expect(body).not.toHaveProperty("response_format");
    expect(output).toMatchObject({
      width: 32,
      height: 24,
      mimeType: "image/png",
      url: `data:image/png;base64,${png.toString("base64")}`,
    });
  });

  it("inlines local storage references instead of sending private image URLs to Agnes", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const fetchMock = vi.fn(async (url: URL | string, _init?: RequestInit) =>
      String(url).startsWith("http://127.0.0.1")
        ? new Response(png, { headers: { "Content-Type": "image/png" } })
        : json({ data: [{ b64_json: png.toString("base64") }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await new AgnesImageProvider("image-key").generate({
      model: "agnes/agnes-image-2.5-flash",
      prompt: "换成蓝色",
      inputImages: ["http://127.0.0.1:54321/storage/test.png"],
    });
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body.extra_body.image).toEqual([
      `data:image/png;base64,${png.toString("base64")}`,
    ]);
    expect(body).not.toHaveProperty("return_base64");
  });

  it("redacts the configured key from provider error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ error: { message: "invalid secret-key-123" } }, 401),
      ),
    );
    await expect(
      new AgnesImageProvider("secret-key-123").generate({
        model: "agnes/agnes-image-2.5-flash",
        prompt: "test",
      }),
    ).rejects.toMatchObject({
      code: "authentication_error",
      message: "invalid [已隐藏]",
    });
  });
});

describe("Agnes video transport", () => {
  it("polls with video_id and model_name, and trusts completed status despite pending internal fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ video_id: "video-1", task_id: "task-other" }),
      )
      .mockResolvedValueOnce(json({ status: "pending", progress: 0 }))
      .mockResolvedValueOnce(json({ status: "in_progress", progress: 50 }))
      .mockResolvedValueOnce(
        json({
          status: "completed",
          internal_status: "pending",
          url: "https://media.example.com/result.mp4",
          seconds: "6",
          size: "720P",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const output = await new AgnesVideoProvider("video-key", undefined, {
      sleep: async () => {},
    }).generate(flash);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.agnes-ai.cn/v1/videos",
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      model: "agnes-video-2.5-flash",
      mode: "text",
      seconds: "6",
      size: "720P",
    });
    const poll = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(poll.pathname).toBe("/agnesapi");
    expect(Object.fromEntries(poll.searchParams)).toEqual({
      video_id: "video-1",
      model_name: "agnes-video-2.5-flash",
    });
    expect(output).toMatchObject({
      width: 1280,
      height: 704,
      durationSeconds: 6,
      url: "https://media.example.com/result.mp4",
    });
  });

  it("supports eight images together with audio and video references on the full model", () => {
    const images = Array.from(
      { length: 8 },
      (_, n) => `https://media.example.com/${n}.png`,
    );
    const body = buildAgnesVideoRequest({
      ...video,
      referenceImages: images,
      referenceAudios: ["https://media.example.com/a.mp3"],
      inputVideo: "https://media.example.com/source.mp4",
    });
    expect(body).toMatchObject({
      mode: "reference",
      seconds: "6",
      size: "1080P",
      images,
      audios: ["https://media.example.com/a.mp3"],
      videos: [{ url: "https://media.example.com/source.mp4" }],
    });
  });

  it("allows last-frame-only control", () => {
    expect(
      buildAgnesVideoRequest({
        ...flash,
        lastFrame: "https://media.example.com/end.png",
      }),
    ).toMatchObject({
      mode: "keyframe",
      last_frame: "https://media.example.com/end.png",
    });
  });

  it.each([
    ["Flash resolution", { ...flash, resolution: "1080p" }],
    [
      "Flash image limit",
      {
        ...flash,
        referenceImages: Array(6).fill("https://media.example.com/a.png"),
      },
    ],
    [
      "full model image limit",
      {
        ...video,
        referenceImages: Array(9).fill("https://media.example.com/a.png"),
      },
    ],
    [
      "audio limit",
      {
        ...video,
        referenceAudios: Array(4).fill("https://media.example.com/a.mp3"),
      },
    ],
    [
      "Flash video input",
      { ...flash, inputVideo: "https://media.example.com/a.mp4" },
    ],
    [
      "mixed modes",
      {
        ...video,
        firstFrame: "https://media.example.com/a.png",
        referenceImages: ["https://media.example.com/b.png"],
      },
    ],
    ["short duration", { ...video, duration: 3 }],
    [
      "unsupported inline format",
      { ...video, firstFrame: "data:text/plain;base64,AAAA" },
    ],
    [
      "non-HTTP image source",
      { ...video, firstFrame: "file:///private/image.png" },
    ],
  ])("rejects invalid %s before creating a task", async (_name, params) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new AgnesVideoProvider("video-key").generate(
        params as VideoGenerateParams,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("backs off rate-limited polls without resubmitting the video", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ video_id: "video-1" }))
      .mockResolvedValueOnce(json({ detail: "slow down" }, 429))
      .mockResolvedValueOnce(
        json({
          status: "completed",
          url: "https://media.example.com/result.mp4",
        }),
      );
    const sleep = vi.fn(async () => {});
    vi.stubGlobal("fetch", fetchMock);
    await new AgnesVideoProvider("key", undefined, { sleep }).generate(flash);
    expect(sleep).toHaveBeenCalledWith(20_000);
    expect(
      fetchMock.mock.calls.filter((call) => call[1]?.method === "POST"),
    ).toHaveLength(1);
  });

  it("inlines local storage frames and reuses the same source for both frames", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const localUrl = "http://127.0.0.1:54321/storage/frame.png";
    let createBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) === localUrl)
        return new Response(png, { headers: { "Content-Type": "image/png" } });
      if (String(url).endsWith("/videos")) {
        createBody = JSON.parse(String(init?.body));
        return json({ video_id: "video-1" });
      }
      return json({
        status: "completed",
        url: "https://media.example.com/result.mp4",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await new AgnesVideoProvider("key").generate({
      ...flash,
      firstFrame: localUrl,
      lastFrame: localUrl,
    });
    const expected = `data:image/png;base64,${png.toString("base64")}`;
    expect(createBody).toMatchObject({
      mode: "keyframe",
      first_frame: expected,
      last_frame: expected,
    });
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === localUrl),
    ).toHaveLength(1);
  });

  it("ends polling at the configured deadline", async () => {
    let time = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ video_id: "video-1" }))
      .mockImplementation(async () => json({ status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new AgnesVideoProvider("key", undefined, {
        now: () => time,
        maxWaitMs: 10,
        pollIntervalMs: 5,
        sleep: async (ms) => {
          time += ms;
        },
      }).generate(flash),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(time).toBe(10);
  });

  it("respects a Retry-After header while polling", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ video_id: "video-1" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "slow down" }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "30" },
        }),
      )
      .mockResolvedValueOnce(
        json({
          status: "completed",
          url: "https://media.example.com/result.mp4",
        }),
      );
    const sleep = vi.fn(async () => {});
    vi.stubGlobal("fetch", fetchMock);
    await new AgnesVideoProvider("key", undefined, { sleep }).generate(flash);
    expect(sleep).toHaveBeenCalledWith(30_000);
    expect(
      fetchMock.mock.calls.filter((call) => call[1]?.method === "POST"),
    ).toHaveLength(1);
  });

  it("does not use task_id as a substitute for video_id", async () => {
    const fetchMock = vi.fn(async () => json({ task_id: "task-1" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new AgnesVideoProvider("key").generate(flash),
    ).rejects.toMatchObject({ code: "malformed_response" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
