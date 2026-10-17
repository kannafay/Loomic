import { describe, expect, it } from "vitest";
import type { BackgroundJob } from "@loomic/shared";
import { getVideoExtensionSource } from "./video-source.js";

const now = Date.now();
const job = {
  id: "source", job_type: "video_generation", status: "succeeded", completed_at: new Date(now - 1000).toISOString(),
  payload: { model: "google-official/veo-3.1-generate-preview", prompt: "A bird flies" },
  result: { signed_url: "http://localhost/video.mp4", width: 720, height: 1280, duration_seconds: 8, mime_type: "video/mp4" },
} as unknown as BackgroundJob;

describe("eligible extension sources", () => {
  it("uses stored result dimensions and retains portrait aspect ratio", () => {
    expect(getVideoExtensionSource(job, now)).toMatchObject({ jobId: "source", duration: 8, aspectRatio: "9:16" });
  });
  it.each([
    { completed_at: new Date(now - 48 * 60 * 60 * 1000).toISOString() },
    { status: "failed" },
    { payload: { ...job.payload, model: "other/model" } },
    { result: { ...job.result, width: 1080, height: 1920 } },
    { result: { ...job.result, duration_seconds: 142 } },
  ])("excludes ineligible source (%j)", (override) => {
    expect(getVideoExtensionSource({ ...job, ...override } as BackgroundJob, now)).toBeNull();
  });
});
