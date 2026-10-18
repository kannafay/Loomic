import type { BackgroundJob } from "@loomic/shared";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { JobService } from "../features/jobs/job-service.js";
import type { UploadService } from "../features/uploads/upload-service.js";
import { AgnesVideoProvider } from "../generation/providers/agnes-video.js";
import { GoogleVideoProvider } from "../generation/providers/google-video.js";
import {
  clearProviders,
  registerVideoProvider,
} from "../generation/providers/registry.js";
import { registerGenerateRoutes } from "./generate.js";

const id = "11111111-1111-4111-8111-111111111111";
const user = {
  id: "user",
  accessToken: "token",
  email: "test@example.com",
  userMetadata: {},
};
const png = "data:image/png;base64,aGVsbG8=";
const source = () =>
  ({
    id,
    workspace_id: "workspace",
    job_type: "video_generation",
    status: "succeeded",
    completed_at: new Date().toISOString(),
    payload: {
      model: "google-official/veo-3.1-generate-preview",
      prompt: "Original prompt",
    },
    result: {
      signed_url: "http://localhost/source.mp4",
      mime_type: "video/mp4",
      width: 720,
      height: 1280,
      duration_seconds: 8,
    },
  }) as unknown as BackgroundJob;
let app: ReturnType<typeof Fastify>;
let jobService: JobService;

function registerConfiguredAgnesFlash() {
  const native = new AgnesVideoProvider("test").models.find(
    (model) => model.id === "agnes/agnes-video-2.5-flash",
  );
  if (!native) throw new Error("Expected the Agnes Flash model");
  const configuredId = `configured/${id}`;
  registerVideoProvider({
    name: "configured-agnes-flash",
    catalogProvider: "agnes",
    models: [{ ...native, id: configuredId }],
    generate: vi.fn(),
  });
  return configuredId;
}

beforeEach(async () => {
  clearProviders();
  registerVideoProvider(new GoogleVideoProvider("test"));
  jobService = {
    createJob: vi.fn().mockResolvedValue({ id }),
    getJobAdmin: vi.fn().mockImplementation(async () => source()),
    getJob: vi.fn().mockImplementation(async () => source()),
    listJobs: vi.fn().mockImplementation(async () => [source()]),
    setCreditsInfo: vi.fn(),
  } as unknown as JobService;
  app = Fastify();
  await registerGenerateRoutes(app, {
    auth: { authenticate: async () => user },
    jobService,
    viewerService: {
      ensureViewer: async () => ({ workspace: { id: "workspace" } }),
    } as unknown as ViewerService,
    uploadService: {} as UploadService,
  });
});
afterEach(async () => {
  await app.close();
  clearProviders();
});

describe("internal video generation API", () => {
  it.each([8, 12])(
    "accepts a configured Agnes model with a reference image at %is",
    async (duration) => {
      const configuredId = registerConfiguredAgnesFlash();
      const response = await app.inject({
        method: "POST",
        url: "/api/agent/generate-video",
        payload: {
          prompt: "Motion",
          model: configuredId,
          duration,
          resolution: "720p",
          aspectRatio: "9:16",
          referenceImages: [png],
        },
      });
      expect(response.statusCode).toBe(200);
      expect(jobService.createJob).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          payload: expect.objectContaining({
            model: configuredId,
            duration,
            resolution: "720p",
            aspect_ratio: "9:16",
            reference_images: [png],
          }),
        }),
      );
    },
  );

  it.each([
    { input: { duration: 13 }, message: "4–12" },
    { input: { resolution: "1080p" }, message: "不支持所选分辨率" },
    {
      input: { referenceImages: Array.from({ length: 6 }, () => png) },
      message: "最多支持 5 张参考图",
    },
  ])(
    "rejects unsupported configured Agnes parameters before enqueueing: $input",
    async ({ input, message }) => {
      const model = registerConfiguredAgnesFlash();
      const response = await app.inject({
        method: "POST",
        url: "/api/agent/generate-video",
        payload: {
          prompt: "Motion",
          model,
          duration: 8,
          resolution: "720p",
          referenceImages: [png],
          ...input,
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.body).toContain(message);
      expect(jobService.createJob).not.toHaveBeenCalled();
    },
  );

  it("passes all Agnes reference types into the job at model-specific durations", async () => {
    registerVideoProvider(new AgnesVideoProvider("test"));
    const images = [
      png,
      ...Array.from(
        { length: 7 },
        (_, n) => `https://media.example.com/${n}.png`,
      ),
    ];
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/generate-video",
      payload: {
        prompt: "Motion",
        model: "agnes/agnes-video-2.5",
        duration: 6,
        resolution: "1080p",
        aspectRatio: "1:1",
        referenceImages: images,
        referenceAudios: ["https://media.example.com/a.mp3"],
        inputVideo: "https://media.example.com/v.mp4",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(jobService.createJob).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        payload: expect.objectContaining({
          model: "agnes/agnes-video-2.5",
          duration: 6,
          resolution: "1080p",
          reference_images: images,
          reference_audios: ["https://media.example.com/a.mp3"],
          input_video: "https://media.example.com/v.mp4",
        }),
      }),
    );
  });
  it("rejects invalid Agnes inline image formats before enqueueing", async () => {
    registerVideoProvider(new AgnesVideoProvider("test"));
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/generate-video",
      payload: {
        prompt: "Motion",
        model: "agnes/agnes-video-2.5-flash",
        firstFrame: "data:text/plain;base64,aGVsbG8=",
        duration: 6,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("PNG");
    expect(jobService.createJob).not.toHaveBeenCalled();
  });
  it.each([
    [
      { firstFrame: png, lastFrame: png },
      { first_frame: png, last_frame: png },
    ],
    [
      { referenceImages: [png, png, png] },
      { reference_images: [png, png, png] },
    ],
  ])(
    "passes distinct image modes to the job without requiring credits",
    async (inputs, expected) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/agent/generate-video",
        payload: { prompt: "Motion", duration: 8, ...inputs },
      });
      expect(response.statusCode).toBe(200);
      expect(jobService.createJob).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ payload: expect.objectContaining(expected) }),
      );
      expect(jobService.setCreditsInfo).not.toHaveBeenCalled();
    },
  );
  it("resolves the original video and aspect ratio from a permitted job", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/generate-video",
      payload: {
        prompt: "Continue",
        sourceVideoJobId: id,
        duration: 8,
        resolution: "720p",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(jobService.createJob).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        payload: expect.objectContaining({
          input_video: "http://localhost/source.mp4",
          input_video_duration: 8,
          aspect_ratio: "9:16",
        }),
      }),
    );
  });
  it("rejects sources from another workspace before creating a job", async () => {
    vi.mocked(jobService.getJob).mockResolvedValue({
      ...source(),
      workspace_id: "other",
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/generate-video",
      payload: { prompt: "Continue", sourceVideoJobId: id },
    });
    expect(response.statusCode).toBe(400);
    expect(jobService.createJob).not.toHaveBeenCalled();
  });
  it("rejects unsupported reference modes without enqueueing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/generate-video",
      payload: {
        prompt: "Motion",
        model: "google-official/veo-3.1-lite-generate-preview",
        referenceImages: [png],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(jobService.createJob).not.toHaveBeenCalled();
  });
  it("lists only eligible video sources for this workspace", async () => {
    vi.mocked(jobService.listJobs).mockResolvedValue([
      source(),
      { ...source(), workspace_id: "other" },
    ]);
    const response = await app.inject({
      method: "GET",
      url: "/api/agent/video-sources",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().sources).toHaveLength(1);
  });
});
