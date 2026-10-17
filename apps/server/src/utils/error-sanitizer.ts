/**
 * Sanitize error messages before sending to the frontend.
 * Logs full error detail server-side, returns user-friendly message.
 */

import { isRecord } from "@loomic/shared";

const PROVIDER_PATTERN =
  /google|vertex|openai|replicate|langchain|gaxios|undici|fetch failed/i;
const DB_PATTERN =
  /supabase|postgres|pgmq|database|relation|column|constraint/i;
const AUTH_PATTERN =
  /jwt|token|unauthorized|forbidden|credential|service.account/i;
const INFRA_PATTERN =
  /econnrefused|econnreset|etimedout|dns|socket|tls|certificate/i;

export function sanitizeErrorForClient(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Log full detail server-side for debugging
  console.error("[error-sanitizer] Raw error:", raw);
  if (error instanceof Error) {
    // Log nested cause chain (LangChain wraps errors multiple levels deep)
    let cause: unknown = error.cause;
    const seen = new Set<unknown>();
    while (cause && !seen.has(cause)) {
      seen.add(cause);
      console.error(
        "[error-sanitizer] Caused by:",
        isRecord(cause) ? (cause.message ?? cause) : cause,
      );
      cause = isRecord(cause) ? cause.cause : undefined;
    }
    // Log response details if present (Google API errors attach response/details)
    const details = error as Error & { response?: unknown; details?: unknown };
    if (isRecord(details.response)) {
      console.error(
        "[error-sanitizer] Response status:",
        details.response.status,
      );
      console.error(
        "[error-sanitizer] Response data:",
        JSON.stringify(
          details.response.data ?? details.response.body ?? "",
        ).substring(0, 2000),
      );
    }
    if (details.details) {
      console.error(
        "[error-sanitizer] Details:",
        JSON.stringify(details.details).substring(0, 2000),
      );
    }
    if (error.stack) {
      console.error("[error-sanitizer] Stack:", error.stack);
    }
  }

  // Map to user-friendly messages
  if (PROVIDER_PATTERN.test(raw)) {
    return "AI 服务暂时不可用，请稍后重试。";
  }
  if (DB_PATTERN.test(raw)) {
    return "数据服务异常，请稍后重试。";
  }
  if (AUTH_PATTERN.test(raw)) {
    return "认证失败，请刷新页面重新登录。";
  }
  if (INFRA_PATTERN.test(raw)) {
    return "网络连接异常，请检查网络后重试。";
  }
  if (raw.includes("abort") || raw.includes("cancel")) {
    return "请求已取消。";
  }
  if (raw.length > 100) {
    // Long messages are likely stack traces or JSON errors
    return "请求处理失败，请重试。";
  }

  // Short, non-technical messages can pass through
  return "请求处理失败，请重试。";
}
