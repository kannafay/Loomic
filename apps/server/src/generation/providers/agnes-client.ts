import { normalizeAgnesApiBase } from "../../config/agnes.js";
import { GenerationError } from "../utils.js";

export class AgnesApiError extends GenerationError {
  constructor(code: string, message: string, readonly status?: number, readonly retryAfterMs?: number) {
    super("agnes", code, message);
  }
}

export class AgnesClient {
  readonly baseUrl: string;

  constructor(private readonly apiKey: string, baseUrl?: string) {
    if (!apiKey.trim()) throw new AgnesApiError("invalid_config", "请配置 AGNES_API_KEY。");
    this.baseUrl = normalizeAgnesApiBase(baseUrl);
  }

  async request(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Record<string, unknown>> {
    const url = new URL(path, `${this.baseUrl}/`);
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.apiKey.trim()}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      throw new AgnesApiError(timedOut ? "timeout" : "network_error", timedOut ? "Agnes 请求超时，请稍后重试。" : "无法连接 Agnes，请检查网络或代理。");
    }

    const body: unknown = await response.json().catch(() => null);
    const data = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
    if (!response.ok) {
      const error = data?.error;
      const detail = error && typeof error === "object" ? (error as Record<string, unknown>).message : data?.detail;
      const message = typeof detail === "string" ? this.sanitize(detail) : `Agnes 请求失败（HTTP ${response.status}）。`;
      const code = response.status === 400 ? "invalid_input"
        : [401, 403].includes(response.status) ? "authentication_error"
        : response.status === 429 ? "rate_limit" : "api_error";
      const retryAfter = response.headers.get("retry-after");
      const retrySeconds = retryAfter ? Number(retryAfter) : Number.NaN;
      const retryAfterMs = retryAfter
        ? Number.isFinite(retrySeconds) ? Math.max(0, retrySeconds * 1_000) : Math.max(0, Date.parse(retryAfter) - Date.now())
        : undefined;
      throw new AgnesApiError(code, message, response.status, Number.isFinite(retryAfterMs) ? retryAfterMs : undefined);
    }
    if (!data) throw new AgnesApiError("malformed_response", "Agnes 返回了无效的 JSON 数据。");
    return data;
  }

  sanitize(message: string): string {
    return message.replaceAll(this.apiKey.trim(), "[已隐藏]").slice(0, 500);
  }
}

export function requireAgnesImageInput(value: string): string {
  if (value.startsWith("data:")) {
    const match = value.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) throw new AgnesApiError("invalid_input", "请选择 PNG、JPEG 或 WebP 图片。");
    if (Buffer.byteLength(match[1]!, "base64") > 8 * 1024 * 1024) throw new AgnesApiError("invalid_input", "每张参考图片不能超过 8 MB。");
    return value;
  }
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return value;
  } catch { /* Report the expected format without echoing image data. */ }
  throw new AgnesApiError("invalid_input", "请上传图片或填写有效的 HTTP(S) 图片链接。");
}

/** Audio/video references still use public URLs; image inputs are sent inline. */
export function requireAgnesMediaUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new AgnesApiError("invalid_input", "参考音频和视频需要公网 HTTP(S) 链接。"); }
  const host = url.hostname.toLowerCase();
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
    || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)
    || host === "[::1]" || host === "[::]" || /^\[(?:fc|fd|fe[89ab])/i.test(host)) {
    throw new AgnesApiError("invalid_input", "Agnes 无法读取此音频或视频的本地地址，请填写公网链接。");
  }
  return value;
}
