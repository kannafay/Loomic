import {
  type GenerateVideosParameters,
  VideoGenerationReferenceType,
} from "@google/genai";
import type { VideoGenerateParams } from "../types.js";
import { GenerationError, fetchAsBase64 } from "../utils.js";

export function googleVideoCapabilities(apiModel: string) {
  const advanced =
    apiModel.startsWith("veo-3.1-") && !apiModel.includes("lite");
  return {
    lastFrame: apiModel.startsWith("veo-3."),
    referenceImages: advanced,
    videoExtension: advanced,
  };
}

/** Keep frame interpolation, asset references and continuation as distinct inputs. */
export function validateGoogleVideoInput(
  params: VideoGenerateParams,
  apiModel: string,
) {
  const caps = googleVideoCapabilities(apiModel);
  const invalid = (message: string): never => {
    throw new GenerationError("google", "invalid_input", message);
  };
  if ((params.inputImages?.length ?? 0) > 2)
    invalid("首尾帧最多两张图片；多图参考请使用参考图模式。");
  if (params.firstFrame && params.inputImages?.length)
    invalid("请勿重复指定首帧。");
  const firstFrame = params.firstFrame ?? params.inputImages?.[0];
  const lastFrame = params.lastFrame ?? params.inputImages?.[1];
  const references = params.referenceImages ?? [];
  if (lastFrame && !firstFrame) invalid("上传尾帧时还需要上传首帧。");
  if (lastFrame && !caps.lastFrame) invalid("当前模型不支持尾帧控制。");
  if (references.length && !caps.referenceImages)
    invalid("当前模型不支持多图参考，请选择 Veo 3.1 或 Veo 3.1 Fast。");
  if (references.length > 3) invalid("最多上传 3 张参考图。");
  if (params.inputVideo && !caps.videoExtension)
    invalid("当前模型不支持视频延长，请选择 Veo 3.1 或 Veo 3.1 Fast。");
  if (references.length && (firstFrame || lastFrame || params.inputVideo))
    invalid("参考图不能与首尾帧或视频延长同时使用。");
  if (params.inputVideo && (firstFrame || lastFrame))
    invalid("视频延长不能同时指定首尾帧。");

  const durationSeconds = params.duration ?? 8;
  const resolution = params.resolution ?? "720p";
  if (
    (references.length ||
      params.inputVideo ||
      resolution === "1080p" ||
      resolution === "4k") &&
    durationSeconds !== 8
  ) {
    invalid("多图参考、视频延长及高清输出需要将时长设为 8 秒。");
  }
  if (params.inputVideo && resolution !== "720p")
    invalid("视频延长仅支持 720p。");
  if (
    params.inputVideo &&
    (typeof params.inputVideoDuration !== "number" ||
      !Number.isFinite(params.inputVideoDuration) ||
      !(params.inputVideoDuration > 0 && params.inputVideoDuration <= 141))
  )
    invalid("请选择不超过 141 秒的 Veo 视频，并提供原视频时长。");
  const durations = apiModel.startsWith("veo-2.") ? [5, 6, 7, 8] : [4, 6, 8];
  if (!durations.includes(durationSeconds))
    invalid(`当前模型支持的时长为 ${durations.join("、")} 秒。`);
  if (
    (apiModel.startsWith("veo-2.") && resolution !== "720p") ||
    (apiModel.includes("lite") && resolution === "4k")
  )
    invalid("当前模型不支持所选分辨率。");
  return { firstFrame, lastFrame, references };
}

export async function buildGoogleVideoInput(
  params: VideoGenerateParams,
  apiModel: string,
) {
  const { firstFrame, lastFrame, references } = validateGoogleVideoInput(
    params,
    apiModel,
  );
  const invalid = (message: string): never => {
    throw new GenerationError("google", "invalid_input", message);
  };
  const imageInput = async (source: string) => {
    const image = await fetchAsBase64("google", source);
    if (!["image/png", "image/jpeg", "image/webp"].includes(image.mimeType))
      invalid("图片仅支持 PNG、JPEG 和 WebP。");
    return { imageBytes: image.data, mimeType: image.mimeType };
  };
  const result: Pick<GenerateVideosParameters, "image" | "video"> & {
    config: NonNullable<GenerateVideosParameters["config"]>;
  } = {
    config: {},
  };
  if (firstFrame) result.image = await imageInput(firstFrame);
  if (lastFrame) result.config.lastFrame = await imageInput(lastFrame);
  if (references.length)
    result.config.referenceImages = await Promise.all(
      references.map(async (source) => ({
        image: await imageInput(source),
        referenceType: VideoGenerationReferenceType.ASSET,
      })),
    );
  if (params.inputVideo) {
    const video = await fetchAsBase64("google", params.inputVideo);
    if (video.mimeType !== "video/mp4") invalid("视频延长需要 MP4 格式。");
    result.video = { videoBytes: video.data, mimeType: video.mimeType };
  }
  return result;
}
