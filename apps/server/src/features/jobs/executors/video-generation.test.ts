import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorContext } from "../job-executor.js";
const { generate, resolveProvider } = vi.hoisted(() => ({
  generate: vi.fn(),
  resolveProvider: vi.fn(() => "google"),
}));
vi.mock("../../../generation/video-generation.js", () => ({
  generateVideo: generate,
}));
vi.mock("../../../generation/providers/registry.js", () => ({
  resolveVideoProviderName: resolveProvider,
}));
import { getExecutor } from "../job-executor.js";
import "./video-generation.js";
beforeEach(() => {
  generate.mockReset();
  resolveProvider.mockReturnValue("google");
});

describe("video worker input propagation", () => {
  it("retains all generation inputs across the queued payload boundary", async () => {
    generate.mockResolvedValue({
      url: "data:video/mp4;base64,dmlkZW8=",
      mimeType: "video/mp4",
      width: 1280,
      height: 720,
      durationSeconds: 15,
    });
    const payload = {
      prompt: "Motion",
      model: "google-official/veo-3.1-generate-preview",
      duration: 8,
      resolution: "720p",
      first_frame: "first",
      last_frame: "last",
      reference_images: ["reference"],
      reference_audios: ["audio"],
      input_video: "video",
      input_video_duration: 8,
    };
    const admin = {
      from: (table: string) =>
        table === "background_jobs"
          ? {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      workspace_id: "workspace",
                      created_by: "user",
                      payload,
                    },
                  }),
                }),
              }),
            }
          : {
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: { id: "asset" } }),
                }),
              }),
            },
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          getPublicUrl: () => ({
            data: { publicUrl: "http://localhost/result.mp4" },
          }),
        }),
      },
    };
    const output = await getExecutor("video_generation")?.("job", {}, {
      getAdminClient: () => admin,
      renewVt: vi.fn(),
    } as unknown as ExecutorContext);
    expect(generate).toHaveBeenCalledWith(
      "google",
      expect.objectContaining({
        firstFrame: "first",
        lastFrame: "last",
        referenceImages: ["reference"],
        referenceAudios: ["audio"],
        inputVideo: "video",
        inputVideoDuration: 8,
      }),
    );
    expect(output?.duration_seconds).toBe(15);
  });
  it("marks an Agnes failure as non-replayable so worker retries cannot create a second task", async () => {
    resolveProvider.mockReturnValue("agnes");
    generate.mockRejectedValue(new Error("query timed out"));
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                workspace_id: "workspace",
                payload: {
                  prompt: "Motion",
                  model: "agnes/agnes-video-2.5-flash",
                },
              },
            }),
          }),
        }),
      }),
    };
    await expect(
      getExecutor("video_generation")?.("job", {}, {
        getAdminClient: () => admin,
        renewVt: vi.fn(),
      } as unknown as ExecutorContext),
    ).rejects.toMatchObject({
      code: "agnes_video_error",
      message: expect.stringContaining("query timed out"),
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
