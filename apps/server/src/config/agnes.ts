export const AGNES_DEFAULT_API_BASE = "https://api.agnes-ai.cn/v1";

export function normalizeAgnesApiBase(value = AGNES_DEFAULT_API_BASE): string {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("AGNES_API_BASE 必须是有效的 HTTP(S) API 地址。");
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path || "/v1";
  return url.toString().replace(/\/+$/, "");
}
