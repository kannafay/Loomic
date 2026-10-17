import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoGenerateParams } from "../types.js";

const { generateVideos } = vi.hoisted(() => ({ generateVideos: vi.fn() }));
vi.mock("@google/genai", async (original) => ({
  ...(await original<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateVideos };
  },
}));
import { GoogleVideoProvider } from "./google-video.js";

const png = "data:image/png;base64,aGVsbG8=";
const jpg = "data:image/jpeg;base64,d29ybGQ=";
const video = "data:video/mp4;base64,dmlkZW8=";
const base: VideoGenerateParams = {
  model: "google-official/veo-3.1-generate-preview",
  prompt: "Camera pans gently",
  duration: 8,
  resolution: "720p",
};

beforeEach(() => {
  generateVideos.mockReset().mockResolvedValue({
    done: true,
    response: {
      generatedVideos: [
        {
          video: {
            uri: "https://generativelanguage.googleapis.com/video",
            mimeType: "video/mp4",
          },
        },
      ],
    },
  });
});

describe("Veo request integration", () => {
  it("generates from text without image inputs", async () => {
    const output = await new GoogleVideoProvider("test").generate(base);
    expect(generateVideos.mock.calls[0]?.[0]).not.toHaveProperty("image");
    expect(output.durationSeconds).toBe(8);
  });
  it("sends the last frame in config instead of dropping the second image", async () => {
    await new GoogleVideoProvider("test").generate({
      ...base,
      firstFrame: png,
      lastFrame: jpg,
    });
    expect(generateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { imageBytes: "aGVsbG8=", mimeType: "image/png" },
        config: expect.objectContaining({
          lastFrame: { imageBytes: "d29ybGQ=", mimeType: "image/jpeg" },
        }),
      }),
    );
  });
  it("keeps legacy first/last frame input working", async () => {
    await new GoogleVideoProvider("test").generate({
      ...base,
      inputImages: [png, jpg],
    });
    expect(generateVideos.mock.calls[0]?.[0].config.lastFrame.imageBytes).toBe(
      "d29ybGQ=",
    );
  });
  it("sends three references as assets without converting one to a first frame", async () => {
    await new GoogleVideoProvider("test").generate({
      ...base,
      referenceImages: [png, jpg, png],
    });
    const request = generateVideos.mock.calls[0]?.[0];
    expect(request).not.toHaveProperty("image");
    expect(request.config.referenceImages).toHaveLength(3);
    expect(request.config.referenceImages[1]).toEqual({
      image: { imageBytes: "d29ybGQ=", mimeType: "image/jpeg" },
      referenceType: "ASSET",
    });
  });
  it("extends a previous video and reports the full output length", async () => {
    const output = await new GoogleVideoProvider("test").generate({
      ...base,
      inputVideo: video,
      inputVideoDuration: 15,
    });
    expect(generateVideos.mock.calls[0]?.[0]).toMatchObject({
      video: { videoBytes: "dmlkZW8=", mimeType: "video/mp4" },
      config: { resolution: "720p" },
    });
    expect(output.durationSeconds).toBe(22);
  });
  it.each([
    { lastFrame: jpg },
    { referenceImages: [png], firstFrame: png },
    { referenceImages: [png], duration: 4 },
    { referenceImages: [png, png, png, png] },
    {
      referenceImages: [png],
      model: "google-official/veo-3.1-lite-generate-preview",
    },
    { inputVideo: video, inputVideoDuration: 8, resolution: "1080p" as const },
    { inputVideo: video, inputVideoDuration: 142 },
    { resolution: "1080p" as const, duration: 4 },
  ])(
    "rejects invalid or unsupported inputs before calling Google (%j)",
    async (options) => {
      await expect(
        new GoogleVideoProvider("test").generate({ ...base, ...options }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(generateVideos).not.toHaveBeenCalled();
    },
  );
});
