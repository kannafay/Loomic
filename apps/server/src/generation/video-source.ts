import type { BackgroundJob } from "@loomic/shared";

/** Only expose recent, successful Veo outputs that meet Google's extension limits. */
export function getVideoExtensionSource(job: BackgroundJob, now = Date.now()) {
  const result = job.result;
  if (
    job.status !== "succeeded" ||
    job.job_type !== "video_generation" ||
    !result
  )
    return null;
  if (
    typeof job.payload.model !== "string" ||
    !job.payload.model.startsWith("google-official/veo-")
  )
    return null;
  const completed = Date.parse(job.completed_at ?? job.created_at);
  if (!Number.isFinite(completed) || now - completed >= 48 * 60 * 60 * 1000)
    return null;
  const width = Number(result.width);
  const height = Number(result.height);
  const duration = Number(result.duration_seconds);
  if (Math.min(width, height) !== 720 || !(duration > 0 && duration <= 141))
    return null;
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) > 0.01 && Math.abs(ratio - 9 / 16) > 0.01)
    return null;
  if (
    typeof result.signed_url !== "string" ||
    !result.signed_url ||
    result.mime_type !== "video/mp4"
  )
    return null;
  return {
    jobId: job.id,
    prompt: String(job.payload.prompt ?? "视频"),
    url: result.signed_url,
    duration,
    aspectRatio: width > height ? "16:9" : "9:16",
  };
}
