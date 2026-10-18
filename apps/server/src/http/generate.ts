// @credits-system — Direct generation routes with credit deduction and tier checks
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withProviderProxy } from "../config/network-proxy.js";

import {
  type ImageQualityLevel,
  type ProviderProxy,
  type VideoResolution,
  applicationErrorResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { CreditService } from "../features/credits/credit-service.js";
import { CreditServiceError } from "../features/credits/credit-service.js";
import type { TierGuard } from "../features/credits/tier-guard.js";
import { TierGuardError } from "../features/credits/tier-guard.js";
import type { JobService } from "../features/jobs/job-service.js";
import { JobServiceError } from "../features/jobs/job-service.js";
import type { ModelConfigService } from "../features/model-config/model-config-service.js";
import type { UploadService } from "../features/uploads/upload-service.js";
import { generateImage } from "../generation/image-generation.js";
import { buildAgnesVideoRequest } from "../generation/providers/agnes-video.js";
import { validateGoogleVideoInput } from "../generation/providers/google-video-input.js";
import { resolveImageProviderName } from "../generation/providers/registry.js";
import { getAvailableVideoModels } from "../generation/providers/registry.js";
import { GenerationError, waitForGeneration } from "../generation/utils.js";
import { getVideoExtensionSource } from "../generation/video-source.js";
import type {
  AuthenticatedUser,
  RequestAuthenticator,
} from "../supabase/user.js";

const generateImageRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
  quality: z.enum(["standard", "hd", "ultra"]).optional(),
});

const generateVideoRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  duration: z.number().int().min(3).max(16).optional(),
  resolution: z.enum(["720p", "1080p", "4k"]).optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]).optional(),
  inputImages: z.array(z.string()).max(3).optional(),
  firstFrame: z.string().optional(),
  lastFrame: z.string().optional(),
  referenceImages: z.array(z.string()).min(1).max(8).optional(),
  referenceAudios: z.array(z.string()).max(3).optional(),
  inputVideo: z.string().optional(),
  sourceVideoJobId: z.string().uuid().optional(),
});

export async function registerGenerateRoutes(
  app: FastifyInstance,
  options: {
    modelConfigService?: ModelConfigService;
    auth: RequestAuthenticator;
    creditService?: CreditService;
    jobService?: JobService;
    tierGuard?: TierGuard;
    uploadService: UploadService;
    viewerService: ViewerService;
  },
) {
  app.post("/api/agent/generate-image", async (request, reply) => {
    const user = await options.auth.authenticate(request);
    if (!user) {
      return reply.code(401).send(
        unauthenticatedErrorResponseSchema.parse({
          error: {
            code: "unauthorized",
            message: "Missing or invalid bearer token.",
          },
        }),
      );
    }

    let payload: z.infer<typeof generateImageRequestSchema>;
    try {
      payload = generateImageRequestSchema.parse(request.body);
    } catch {
      return reply.code(400).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "invalid_request",
            message: "Invalid request body.",
          },
        }),
      );
    }

    const controller = new AbortController();
    const { signal } = controller;
    const onDisconnect = () => {
      // IncomingMessage.close also fires after reading a normal POST body.
      // The response closing before it has ended identifies a disconnected client.
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on("close", onDisconnect);
    if (reply.raw.destroyed || request.raw.aborted) controller.abort();

    try {
      const model = options.modelConfigService
        ? (await options.modelConfigService.resolve("image", payload.model))
            .model.key
        : (payload.model ?? "black-forest-labs/flux-kontext-pro");
      signal.throwIfAborted();
      // ── Tier guard + credit checks ──
      const viewer = await options.viewerService.ensureViewer(user);
      let creditsCost = 0;

      if (options.creditService && options.tierGuard) {
        const sub = await options.creditService.getSubscription(
          viewer.workspace.id,
        );
        const quality: ImageQualityLevel = payload.quality ?? "hd";
        options.tierGuard.checkModelAccess(sub.plan, model);
        // Throws TierGuardError (resolution_not_allowed) if plan doesn't allow this quality
        options.tierGuard.checkResolution(sub.plan, quality);
        await options.tierGuard.checkConcurrency(viewer.workspace.id, sub.plan);
        creditsCost = options.tierGuard.calculateCreditCost(
          model,
          "image_generation",
          { quality },
        );

        // Deduct credits before generation
        if (creditsCost > 0) {
          await options.creditService.deductCredits(
            viewer.workspace.id,
            user.id,
            creditsCost,
            undefined,
            `Direct image generation: ${model}`,
          );
        }
      }

      const providerName = resolveImageProviderName(model);
      signal.throwIfAborted();
      const result = await generateImage(providerName, {
        signal,
        prompt: payload.prompt,
        model,
        aspectRatio: payload.aspectRatio ?? "1:1",
        ...(payload.quality ? { quality: payload.quality } : {}),
      });
      signal.throwIfAborted();

      // Download and persist to Supabase Storage
      const { signedUrl, assetId } = await downloadAndUpload(
        result.url,
        result.mimeType,
        payload.prompt,
        user,
        options,
        signal,
        result.networkProxy,
      );
      signal.throwIfAborted();

      return reply.code(200).send({
        url: signedUrl,
        assetId,
        prompt: payload.prompt,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
      });
    } catch (error) {
      if (signal.aborted) {
        return reply
          .code(499)
          .send({ error: { code: "cancelled", message: "已停止生成图片。" } });
      }
      // Handle tier/credit errors
      if (error instanceof TierGuardError) {
        return reply.code(error.statusCode).send(
          applicationErrorResponseSchema.parse({
            error: { code: error.code, message: error.message },
          }),
        );
      }
      if (error instanceof CreditServiceError) {
        return reply.code(error.statusCode).send(
          applicationErrorResponseSchema.parse({
            error: { code: error.code, message: error.message },
          }),
        );
      }

      const message =
        error instanceof Error ? error.message : "Image generation failed.";

      if (message.includes("No provider registered")) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "provider_not_configured",
              message: "Image generation is not available.",
            },
          }),
        );
      }

      return reply.code(502).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "generation_failed",
            message,
          },
        }),
      );
    } finally {
      reply.raw.off("close", onDisconnect);
    }
  });

  app.get("/api/agent/video-sources", async (request, reply) => {
    const user = await options.auth.authenticate(request);
    if (!user)
      return reply
        .code(401)
        .send({ error: { code: "unauthorized", message: "请先登录。" } });
    if (!options.jobService) return reply.code(200).send({ sources: [] });
    const viewer = await options.viewerService.ensureViewer(user);
    const jobs = await options.jobService.listJobs(user, {
      status: "succeeded",
      jobType: "video_generation",
    });
    return {
      sources: jobs
        .filter((job) => job.workspace_id === viewer.workspace.id)
        .map((job) => getVideoExtensionSource(job))
        .filter(Boolean),
    };
  });

  // Inline image references include Base64 overhead; providers enforce their own count/size limits.
  app.post(
    "/api/agent/generate-video",
    { bodyLimit: 50 * 1024 * 1024 },
    async (request, reply) => {
      const user = await options.auth.authenticate(request);
      if (!user) {
        return reply.code(401).send(
          unauthenticatedErrorResponseSchema.parse({
            error: {
              code: "unauthorized",
              message: "Missing or invalid bearer token.",
            },
          }),
        );
      }

      let payload: z.infer<typeof generateVideoRequestSchema>;
      try {
        payload = generateVideoRequestSchema.parse(request.body);
      } catch {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "invalid_request",
              message: "Invalid request body.",
            },
          }),
        );
      }

      if (!options.jobService) {
        return reply.code(503).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "service_unavailable",
              message:
                "Video generation is not available (job service not configured).",
            },
          }),
        );
      }

      const jobService = options.jobService;
      const controller = new AbortController();
      const { signal } = controller;
      let jobId: string | undefined;
      let cancellation: Promise<void> | undefined;
      const cancel = () => {
        if (!jobId) return Promise.resolve();
        cancellation ??= jobService
          .cancelJob(user, jobId)
          .then(() => {})
          .catch((error) => {
            // A completion that won the race is already terminal and must stay so.
            if (
              !(
                error instanceof JobServiceError &&
                error.code === "job_not_found"
              )
            )
              request.log.error(
                { err: error, jobId },
                "Failed to cancel disconnected video request",
              );
          });
        return cancellation;
      };
      const onDisconnect = () => {
        if (!reply.raw.writableEnded) {
          controller.abort();
          void cancel();
        }
      };
      reply.raw.on("close", onDisconnect);
      if (reply.raw.destroyed || request.raw.aborted) controller.abort();

      try {
        signal.throwIfAborted();
        const model = options.modelConfigService
          ? (await options.modelConfigService.resolve("video", payload.model))
              .model.key
          : (payload.model ?? "google-official/veo-3.1-generate-preview");
        // ── Tier guard + credit checks ──
        const viewer = await options.viewerService.ensureViewer(user);
        const workspaceId = viewer.workspace.id;
        const videoModel = getAvailableVideoModels().find(
          (item) => item.id === model,
        );
        if (!videoModel)
          throw new GenerationError(
            "video",
            "invalid_input",
            "所选视频模型当前不可用。",
          );
        if (payload.lastFrame && !videoModel.capabilities.lastFrame)
          throw new GenerationError(
            "video",
            "invalid_input",
            "所选模型不支持尾帧控制。",
          );
        if (
          payload.referenceImages?.length &&
          !videoModel.capabilities.referenceImages
        )
          throw new GenerationError(
            "video",
            "invalid_input",
            "所选模型不支持参考图模式。",
          );
        if (payload.referenceAudios?.length && videoModel.provider !== "agnes")
          throw new GenerationError(
            "video",
            "invalid_input",
            "所选模型不支持参考音频。",
          );
        if (
          payload.inputVideo &&
          (videoModel.provider !== "agnes" || payload.sourceVideoJobId)
        )
          throw new GenerationError(
            "video",
            "invalid_input",
            "该视频输入方式仅用于 Agnes 参考视频。",
          );
        let source: ReturnType<typeof getVideoExtensionSource> = null;
        if (payload.sourceVideoJobId) {
          if (!videoModel.capabilities.videoExtension)
            throw new GenerationError(
              "video",
              "invalid_input",
              "所选模型不支持视频延长。",
            );
          const sourceJob = await options.jobService.getJob(
            user,
            payload.sourceVideoJobId,
          );
          source =
            sourceJob.workspace_id === workspaceId
              ? getVideoExtensionSource(sourceJob)
              : null;
          if (!source)
            throw new GenerationError(
              "video",
              "invalid_input",
              "该视频不能延长：请选择最近两天内生成、不超过 141 秒的 Veo 720p 视频。",
            );
          if (payload.aspectRatio && payload.aspectRatio !== source.aspectRatio)
            throw new GenerationError(
              "video",
              "invalid_input",
              "延长视频需要保持原画面比例。",
            );
        }
        if (videoModel.provider === "google")
          validateGoogleVideoInput(
            {
              prompt: payload.prompt,
              model,
              ...(payload.duration != null
                ? { duration: payload.duration }
                : {}),
              ...(payload.resolution ? { resolution: payload.resolution } : {}),
              ...(payload.inputImages
                ? { inputImages: payload.inputImages }
                : {}),
              ...(payload.firstFrame ? { firstFrame: payload.firstFrame } : {}),
              ...(payload.lastFrame ? { lastFrame: payload.lastFrame } : {}),
              ...(payload.referenceImages
                ? { referenceImages: payload.referenceImages }
                : {}),
              ...(source
                ? {
                    inputVideo: source.url,
                    inputVideoDuration: source.duration,
                  }
                : {}),
            },
            model.replace("google-official/", ""),
          );
        if (videoModel.provider === "agnes")
          buildAgnesVideoRequest({
            prompt: payload.prompt,
            model,
            ...(payload.duration != null ? { duration: payload.duration } : {}),
            ...(payload.resolution ? { resolution: payload.resolution } : {}),
            ...(payload.aspectRatio
              ? { aspectRatio: payload.aspectRatio }
              : {}),
            ...(payload.inputImages
              ? { inputImages: payload.inputImages }
              : {}),
            ...(payload.firstFrame ? { firstFrame: payload.firstFrame } : {}),
            ...(payload.lastFrame ? { lastFrame: payload.lastFrame } : {}),
            ...(payload.referenceImages
              ? { referenceImages: payload.referenceImages }
              : {}),
            ...(payload.referenceAudios
              ? { referenceAudios: payload.referenceAudios }
              : {}),
            ...(payload.inputVideo ? { inputVideo: payload.inputVideo } : {}),
          });
        let creditsCost = 0;

        if (options.creditService && options.tierGuard) {
          const sub = await options.creditService.getSubscription(workspaceId);
          options.tierGuard.checkModelAccess(sub.plan, model);
          if (payload.resolution) {
            options.tierGuard.checkVideoResolution(
              sub.plan,
              payload.resolution as VideoResolution,
            );
          }
          await options.tierGuard.checkConcurrency(workspaceId, sub.plan);
          creditsCost = options.tierGuard.calculateCreditCost(
            model,
            "video_generation",
            {
              ...(payload.duration != null
                ? { duration: payload.duration }
                : {}),
              ...(payload.resolution
                ? { resolution: payload.resolution as VideoResolution }
                : {}),
            },
          );
        }

        // ── Create job ──
        signal.throwIfAborted();
        const job = await options.jobService.createJob(user, {
          workspaceId,
          jobType: "video_generation",
          payload: {
            prompt: payload.prompt,
            model,
            ...(payload.duration != null ? { duration: payload.duration } : {}),
            ...(payload.resolution ? { resolution: payload.resolution } : {}),
            ...(payload.aspectRatio
              ? { aspect_ratio: payload.aspectRatio }
              : {}),
            ...(payload.inputImages?.length
              ? { input_images: payload.inputImages }
              : {}),
            ...(payload.firstFrame ? { first_frame: payload.firstFrame } : {}),
            ...(payload.lastFrame ? { last_frame: payload.lastFrame } : {}),
            ...(payload.referenceImages?.length
              ? { reference_images: payload.referenceImages }
              : {}),
            ...(payload.referenceAudios?.length
              ? { reference_audios: payload.referenceAudios }
              : {}),
            ...(payload.inputVideo ? { input_video: payload.inputVideo } : {}),
            ...(source
              ? {
                  input_video: source.url,
                  input_video_duration: source.duration,
                  aspect_ratio: source.aspectRatio,
                }
              : {}),
          },
        });
        jobId = job.id;
        signal.throwIfAborted();

        // ── Deduct credits BEFORE generation ──
        if (options.creditService && creditsCost > 0) {
          try {
            const txId = await options.creditService.deductCredits(
              workspaceId,
              user.id,
              creditsCost,
              job.id,
              `Direct video generation: ${model}`,
            );
            await options.jobService.setCreditsInfo(job.id, creditsCost, txId);
          } catch (deductError) {
            await options.jobService.cancelJob(user, job.id).catch(() => {});
            throw deductError;
          }
        }

        // ── Poll until terminal state ──
        const POLL_INTERVAL = 3_000;
        const MAX_WAIT = 300_000; // 5 minutes

        const result = await pollJobUntilDone(
          options.jobService,
          job.id,
          POLL_INTERVAL,
          MAX_WAIT,
          signal,
        );

        if ("error" in result) {
          return reply.code(502).send(
            applicationErrorResponseSchema.parse({
              error: {
                code: "generation_failed",
                message: result.error,
              },
            }),
          );
        }

        return reply.code(200).send({
          url: result.signed_url,
          assetId: result.asset_id,
          prompt: payload.prompt,
          mimeType: result.mime_type,
          width: result.width,
          height: result.height,
          durationSeconds: result.duration_seconds,
        });
      } catch (error) {
        if (signal.aborted) {
          await cancel();
          return reply.code(499).send({
            error: { code: "cancelled", message: "已停止生成视频。" },
          });
        }
        if (
          error instanceof GenerationError &&
          error.code === "invalid_input"
        ) {
          return reply.code(400).send({
            error: { code: "invalid_request", message: error.message },
          });
        }
        if (error instanceof TierGuardError) {
          return reply.code(error.statusCode).send(
            applicationErrorResponseSchema.parse({
              error: { code: error.code, message: error.message },
            }),
          );
        }
        if (error instanceof CreditServiceError) {
          return reply.code(error.statusCode).send(
            applicationErrorResponseSchema.parse({
              error: { code: error.code, message: error.message },
            }),
          );
        }
        if (error instanceof JobServiceError) {
          return reply.code(error.statusCode).send(
            applicationErrorResponseSchema.parse({
              error: { code: error.code, message: error.message },
            }),
          );
        }

        const message =
          error instanceof Error ? error.message : "Video generation failed.";

        return reply.code(502).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "generation_failed",
              message,
            },
          }),
        );
      } finally {
        reply.raw.off("close", onDisconnect);
      }
    },
  );
}

// ── Job polling helper ──────────────────────────────────────

type VideoJobResult = {
  signed_url: string;
  asset_id: string;
  width: number;
  height: number;
  duration_seconds: number;
  mime_type: string;
};

type PollResult = VideoJobResult | { error: string };

async function pollJobUntilDone(
  jobService: JobService,
  jobId: string,
  pollInterval: number,
  maxWait: number,
  signal?: AbortSignal,
): Promise<PollResult> {
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await waitForGeneration(pollInterval, signal);

    const current = await jobService.getJobAdmin(jobId);
    signal?.throwIfAborted();

    if (current.status === "succeeded" && current.result) {
      const r = current.result as Record<string, unknown>;
      return {
        signed_url: (r.signed_url as string) ?? "",
        asset_id: (r.asset_id as string) ?? "",
        width: (r.width as number) ?? 0,
        height: (r.height as number) ?? 0,
        duration_seconds: (r.duration_seconds as number) ?? 0,
        mime_type: (r.mime_type as string) ?? "video/mp4",
      };
    }

    if (current.status === "dead_letter" || current.status === "canceled") {
      return { error: current.error_message ?? `Job ${current.status}` };
    }

    if (
      current.status === "failed" &&
      current.attempt_count >= current.max_attempts
    ) {
      return {
        error: current.error_message ?? "Job failed after max retries",
      };
    }
  }

  return { error: `Job timed out after ${maxWait / 1000}s` };
}

// ── Image download + upload helper ──────────────────────────

async function downloadAndUpload(
  sourceUrl: string,
  mimeType: string,
  prompt: string,
  user: AuthenticatedUser,
  deps: { uploadService: UploadService; viewerService: ViewerService },
  signal?: AbortSignal,
  networkProxy?: ProviderProxy,
): Promise<{ signedUrl: string; assetId: string }> {
  const response = await withProviderProxy(networkProxy, () =>
    fetch(sourceUrl, { signal: signal ?? null }),
  );
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const ext = mimeType === "image/webp" ? "webp" : "png";
  const slug = prompt
    .slice(0, 40)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const fileName = `gen-${slug}-${Date.now()}.${ext}`;

  const viewer = await deps.viewerService.ensureViewer(user);
  signal?.throwIfAborted();

  const result = await deps.uploadService.uploadFile(user, {
    bucket: "project-assets",
    fileName,
    fileBuffer: buffer,
    mimeType,
    workspaceId: viewer.workspace.id,
  });

  return { signedUrl: result.url, assetId: result.asset.id };
}
