import type {
  DiscoveredModel,
  ModelDiscoveryResponse,
  ModelKind,
  ModelProtocol,
  ProviderProxy,
} from "@loomic/shared";
import { withProviderProxy } from "../../config/network-proxy.js";
import { ModelConfigError } from "./errors.js";
import { MODEL_PRESETS } from "./presets.js";

type DiscoveryProvider = {
  protocol: ModelProtocol;
  baseUrl: string;
  apiKey: string;
  preset: string;
  proxy?: ProviderProxy | undefined;
};
type RecordValue = Record<string, unknown>;
const MAX_MODELS = 1000;
const record = (value: unknown): RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const string = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function suggestKind(
  provider: DiscoveryProvider,
  id: string,
  model: RecordValue,
): ModelKind | null {
  const known = MODEL_PRESETS.find(
    (preset) => preset.id === provider.preset,
  )?.models.find((item) => item.apiModel === id);
  if (known) return known.kind;
  if (provider.protocol === "anthropic") return "text";
  if (/embed|rerank|moderation|(?:^|[-_])aqa(?:$|[-_])/i.test(id)) return null;
  const outputs = strings(model.output_modalities).map((value) =>
    value.toLowerCase(),
  );
  for (const kind of ["video", "image", "audio", "text"] as const) {
    if (outputs.includes(kind)) return kind;
  }
  const endpoints = strings(model.supported_endpoint_types)
    .join(" ")
    .toLowerCase();
  if (/video|veo|sora|seedance|kling/i.test(id) || /video/.test(endpoints))
    return "video";
  if (
    /image|imagen|dall-e|flux|stable-diffusion|banana/i.test(id) ||
    /image/.test(endpoints)
  )
    return "image";
  if (
    /audio|tts|whisper|speech|music/i.test(id) ||
    /audio|speech/.test(endpoints)
  )
    return "audio";
  if (
    strings(model.supportedGenerationMethods).includes("generateContent") ||
    /chat|responses/.test(endpoints)
  )
    return "text";
  if (
    /^(?:gpt-|o[134](?:-|$)|claude-|gemini-|deepseek|minimax-(?:m\d|text-|vl-)|qwen|llama|mistral|agnes-)/i.test(
      id,
    )
  )
    return "text";
  return null;
}

function modelListUrl(provider: DiscoveryProvider) {
  const base = provider.baseUrl.replace(/\/+$/, "");
  if (provider.protocol === "gemini") {
    const url = new URL(
      `${base}${/\/v\d+(?:beta\d*)?$/.test(base) ? "" : "/v1beta"}/models`,
    );
    url.searchParams.set("pageSize", "1000");
    return url;
  }
  if (provider.protocol === "anthropic") {
    const url = new URL(`${base}${/\/v1$/.test(base) ? "" : "/v1"}/models`);
    url.searchParams.set("limit", "1000");
    return url;
  }
  return new URL(`${base}/models`);
}

export async function discoverProviderModels(
  provider: DiscoveryProvider,
): Promise<ModelDiscoveryResponse> {
  const url = modelListUrl(provider);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (provider.protocol === "anthropic") {
    headers["anthropic-version"] = "2023-06-01";
    if (provider.apiKey) headers["x-api-key"] = provider.apiKey;
  } else if (provider.apiKey) {
    headers[
      provider.protocol === "gemini" ? "x-goog-api-key" : "Authorization"
    ] =
      provider.protocol === "gemini"
        ? provider.apiKey
        : `Bearer ${provider.apiKey}`;
  }
  const models = new Map<string, DiscoveredModel>();
  const cursors = new Set<string>();
  const signal = AbortSignal.timeout(25_000);
  const safeText = (value: string, length: number) =>
    (provider.apiKey
      ? value.replaceAll(provider.apiKey, "[已隐藏]")
      : value
    ).slice(0, length);
  for (let page = 0; page < 10; page++) {
    let payload: RecordValue;
    try {
      const response = await withProviderProxy(provider.proxy, () =>
        fetch(url, { headers, signal, redirect: "error" }),
      );
      if (!response.ok) {
        await response.body?.cancel();
        const message =
          response.status === 401 || response.status === 403
            ? "模型列表鉴权失败，请检查 API Key 和账号权限。"
            : response.status === 404 ||
                response.status === 405 ||
                response.status === 501
              ? "这个地址未提供模型列表接口，请检查接口地址，或手动添加模型。"
              : response.status === 429
                ? "模型列表请求过于频繁，请稍后重试。"
                : `获取模型列表失败（HTTP ${response.status}），请检查提供商服务。`;
        throw new ModelConfigError(message, 502, response.status);
      }
      payload = record(await response.json());
    } catch (error) {
      if (error instanceof ModelConfigError) throw error;
      throw new ModelConfigError(
        signal.aborted
          ? "获取模型列表超时，请检查网络或代理后重试。"
          : "无法获取模型列表，请检查接口地址、网络和代理配置。",
        502,
      );
    }
    const entries =
      provider.protocol === "gemini" ? payload.models : payload.data;
    if (!Array.isArray(entries))
      throw new ModelConfigError(
        "接口返回的模型列表格式不受支持，可继续手动添加模型。",
        502,
      );
    for (const entry of entries) {
      const item = record(entry);
      const rawId = string(
        provider.protocol === "gemini" ? item.name : item.id,
      );
      const id =
        provider.protocol === "gemini" ? rawId.replace(/^models\//, "") : rawId;
      if (
        !id ||
        id.length > 200 ||
        (provider.apiKey && id.includes(provider.apiKey)) ||
        models.has(id)
      )
        continue;
      if (models.size >= MAX_MODELS)
        return { models: [...models.values()], truncated: true };
      const known = MODEL_PRESETS.find(
        (preset) => preset.id === provider.preset,
      )?.models.find((model) => model.apiModel === id);
      const displayName =
        string(item.displayName) ||
        string(item.display_name) ||
        (provider.protocol !== "gemini" ? string(item.name) : "");
      models.set(id, {
        apiModel: id,
        name: safeText(displayName || known?.name || id, 120),
        description: safeText(
          string(item.description) || known?.description || "",
          2000,
        ),
        kind: suggestKind(provider, id, item),
      });
    }
    const cursor =
      provider.protocol === "gemini"
        ? string(payload.nextPageToken)
        : payload.has_more === true
          ? string(payload.last_id) || string(record(entries.at(-1)).id)
          : "";
    if (payload.has_more === true && !cursor)
      throw new ModelConfigError(
        "模型列表缺少下一页标识，请稍后重试或手动添加。",
        502,
      );
    if (!cursor) return { models: [...models.values()], truncated: false };
    if (cursors.has(cursor) || models.size >= MAX_MODELS)
      return { models: [...models.values()], truncated: true };
    cursors.add(cursor);
    url.searchParams.set(
      provider.protocol === "gemini"
        ? "pageToken"
        : provider.protocol === "anthropic"
          ? "after_id"
          : "after",
      cursor,
    );
  }
  return { models: [...models.values()], truncated: true };
}
