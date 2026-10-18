import sharp from "sharp";
import type {
  GeneratedImage,
  ImageGenerateParams,
  ImageProvider,
  ModelInfo,
} from "../types.js";
import { GenerationError, fetchAsBase64 } from "../utils.js";
import { AgnesApiError, AgnesClient } from "./agnes-client.js";

const MODELS: readonly ModelInfo[] = ["2.5", "2.1", "2.0"].map((version) => ({
  id: `agnes/agnes-image-${version}-flash`,
  displayName: `Agnes Image ${version} Flash`,
  description: "支持文字生成图片、图片编辑和多图融合，最高 4K。",
  iconUrl: "/providers/agnes.ico",
}));
const RATIOS = new Set([
  "1:1",
  "3:4",
  "4:3",
  "16:9",
  "9:16",
  "2:3",
  "3:2",
  "21:9",
]);

export class AgnesImageProvider implements ImageProvider {
  readonly name = "agnes";
  readonly models: readonly ModelInfo[];
  private readonly client: AgnesClient;

  constructor(
    apiKey: string,
    baseUrl?: string,
    models: readonly ModelInfo[] = MODELS,
  ) {
    this.client = new AgnesClient(apiKey, baseUrl);
    this.models = models;
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    if (!this.models.some((model) => model.id === params.model))
      throw new AgnesApiError("model_not_found", "所选 Agnes 图片模型不可用。");
    const ratio = params.aspectRatio ?? "1:1";
    if (!RATIOS.has(ratio))
      throw new AgnesApiError("invalid_input", "该图片比例不受 Agnes 支持。");
    try {
      // Inline inputs also work with local Supabase: Agnes never has to fetch a private URL.
      const images = await Promise.all(
        (params.inputImages ?? []).map(async (url) => {
          const input = await fetchAsBase64(this.name, url, params.signal);
          return `data:${input.mimeType};base64,${input.data}`;
        }),
      );
      const result = await this.client.request(
        "images/generations",
        {
          method: "POST",
          signal: params.signal ?? null,
          body: JSON.stringify({
            model: params.model.slice("agnes/".length),
            prompt: params.prompt,
            size:
              params.quality === "standard"
                ? "1K"
                : params.quality === "ultra"
                  ? "4K"
                  : "2K",
            ratio,
            ...(images.length ? {} : { return_base64: true }),
            extra_body: {
              response_format: "b64_json",
              ...(images.length ? { image: images } : {}),
            },
          }),
        },
        360_000,
      );
      const image = Array.isArray(result.data)
        ? (result.data[0] as { b64_json?: unknown; url?: unknown } | undefined)
        : undefined;
      let bytes: Buffer;
      if (typeof image?.b64_json === "string" && image.b64_json) {
        bytes = Buffer.from(
          image.b64_json.replace(/^data:[^;]+;base64,/, ""),
          "base64",
        );
      } else if (typeof image?.url === "string" && image.url) {
        const response = await fetch(image.url, {
          signal: params.signal
            ? AbortSignal.any([params.signal, AbortSignal.timeout(60_000)])
            : AbortSignal.timeout(60_000),
        });
        if (!response.ok)
          throw new AgnesApiError("no_output", "Agnes 图片下载失败。");
        bytes = Buffer.from(await response.arrayBuffer());
      } else {
        throw new AgnesApiError("no_output", "Agnes 未返回图片。");
      }
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height)
        throw new AgnesApiError("no_output", "Agnes 返回的图片无法读取。");
      const mimeType =
        metadata.format === "jpeg"
          ? "image/jpeg"
          : metadata.format === "webp"
            ? "image/webp"
            : "image/png";
      return {
        url: `data:${mimeType};base64,${bytes.toString("base64")}`,
        mimeType,
        width: metadata.width,
        height: metadata.height,
      };
    } catch (error) {
      params.signal?.throwIfAborted();
      if (error instanceof GenerationError) throw error;
      throw new AgnesApiError(
        "api_error",
        this.client.sanitize(
          error instanceof Error ? error.message : "Agnes 图片生成失败。",
        ),
      );
    }
  }
}
