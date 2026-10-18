import { getVideoProvider } from "./providers/registry.js";
import type { GeneratedVideo, VideoGenerateParams } from "./types.js";
import { GenerationError } from "./utils.js";

export async function generateVideo(
  providerName: string,
  input: VideoGenerateParams,
): Promise<GeneratedVideo> {
  let params = input;
  const provider = getVideoProvider(providerName);
  const providerKind = provider.catalogProvider ?? provider.name;
  const model = provider.models.find((item) => item.id === params.model);
  if (params.lastFrame && !model?.capabilities.lastFrame)
    throw new GenerationError(
      providerName,
      "invalid_input",
      "当前模型不支持尾帧控制。",
    );
  if (params.referenceImages?.length && !model?.capabilities.referenceImages)
    throw new GenerationError(
      providerName,
      "invalid_input",
      "当前模型不支持参考图模式。",
    );
  if (
    params.inputVideo &&
    !model?.capabilities.videoExtension &&
    !model?.capabilities.videoToVideo
  )
    throw new GenerationError(
      providerName,
      "invalid_input",
      "当前模型不支持视频输入。",
    );
  if (params.referenceAudios?.length && providerKind !== "agnes")
    throw new GenerationError(
      providerName,
      "invalid_input",
      "当前模型不支持参考音频输入。",
    );
  if (
    params.firstFrame &&
    providerKind !== "google" &&
    providerKind !== "agnes"
  )
    params = { ...params, inputImages: [params.firstFrame] };
  return provider.generate(params);
}
