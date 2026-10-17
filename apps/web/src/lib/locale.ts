import type { SubscriptionPlan } from "@loomic/shared";

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: "免费版",
  starter: "入门版",
  pro: "专业版",
  ultra: "旗舰版",
  business: "企业版",
};

export function getPlanLabel(plan?: string | null): string {
  if (!plan) return PLAN_LABELS.free;
  return PLAN_LABELS[plan as SubscriptionPlan] ?? "未知套餐";
}

export function getBillingPeriodLabel(period: string): string {
  return period === "yearly" ? "按年付费" : "按月付费";
}

export function getCreditDescription(
  description: string | null,
): string | null {
  if (!description) return null;
  if (description === "Seed: initial free-tier credits")
    return "免费版初始积分";
  if (description === "Auto-refund: job failed")
    return "任务失败，积分已自动退还";
  const upgrade = /^Plan upgraded to (\w+) — monthly credits granted$/.exec(
    description,
  );
  if (upgrade) return `升级至${getPlanLabel(upgrade[1])}，已发放每月积分`;
  const grant = /^(\w+) plan — (initial )?monthly credits granted$/.exec(
    description,
  );
  if (grant)
    return `${getPlanLabel(grant[1])}：已发放${grant[2] ? "首月" : "每月"}积分`;
  return description
    .replace(/^(?:Direct )?[Ii]mage generation: /, "图片生成：")
    .replace(/^(?:Direct )?[Vv]ideo generation: /, "视频生成：");
}

const ELEMENT_LABELS: Record<string, string> = {
  rectangle: "矩形",
  ellipse: "椭圆",
  diamond: "菱形",
  arrow: "箭头",
  line: "线条",
  freedraw: "手绘",
  text: "文本",
  image: "图片",
  frame: "画框",
  magicframe: "智能画框",
  embeddable: "嵌入内容",
};

export function getCanvasElementLabel(type: string): string {
  return ELEMENT_LABELS[type] ?? "图形";
}

export function localizeSystemSkill<
  T extends { source: string; slug: string; name: string; description: string },
>(skill: T): T {
  if (skill.source !== "system") return skill;
  if (skill.slug === "canvas-design")
    return {
      ...skill,
      name: "画布设计",
      description:
        "运用设计理念，通过代码生成海报、视觉作品及其他静态设计，输出 PNG 图片或 PDF 文件。",
    };
  if (skill.slug === "json-image-prompt")
    return {
      ...skill,
      name: "结构化图片提示词",
      description:
        "使用结构化 JSON 提示词生成图片，提升图像、插画、照片和海报的生成一致性、可控性与质量。",
    };
  return skill;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "邮箱或密码错误，请重新输入。",
  email_not_confirmed: "邮箱尚未验证，请先查收验证邮件。",
  user_already_exists: "该邮箱已注册，请直接登录。",
  email_exists: "该邮箱已注册，请直接登录。",
  user_not_found: "账号不存在，请先注册。",
  signup_disabled: "暂未开放新账号注册。",
  otp_disabled: "该邮箱暂时无法使用登录链接，请使用密码登录或先注册。",
  otp_expired: "验证链接已过期，请重新获取。",
  weak_password: "密码强度不足，请至少使用 6 个字符。",
  over_email_send_rate_limit: "邮件发送过于频繁，请稍后重试。",
  over_request_rate_limit: "操作过于频繁，请稍后重试。",
  request_timeout: "请求超时，请稍后重试。",
  session_not_found: "登录状态已失效，请重新登录。",
  bad_jwt: "登录状态已失效，请重新登录。",
  unauthorized: "登录状态已失效，请重新登录。",
  project_name_conflict: "同名项目已存在，请使用其他名称。",
  project_slug_taken: "项目标识已被使用，请更换项目名称。",
  project_create_failed: "项目创建失败，请重试。",
  project_query_failed: "项目加载失败，请重试。",
  project_update_failed: "项目更新失败，请重试。",
  project_delete_failed: "项目删除失败，请重试。",
  project_not_found: "项目不存在或已被删除。",
  canvas_not_found: "画布不存在或已被删除。",
  canvas_query_failed: "画布加载失败，请重试。",
  canvas_save_failed: "画布保存失败，请重试。",
  brand_kit_not_found: "品牌套件不存在或已被删除。",
  brand_kit_create_failed: "品牌套件创建失败，请重试。",
  brand_kit_update_failed: "品牌套件保存失败，请重试。",
  brand_kit_delete_failed: "品牌套件删除失败，请重试。",
  brand_kit_query_failed: "品牌套件加载失败，请重试。",
  asset_not_found: "素材不存在或已被删除。",
  upload_failed: "文件上传失败，请重试。",
  credits_insufficient: "积分不足，请领取每日积分或升级套餐。",
  insufficient_credits: "积分不足，请领取每日积分或升级套餐。",
  concurrency_limit: "当前进行中的任务已达套餐上限，请等待任务完成后再试。",
  model_not_accessible: "当前套餐暂不支持此模型，请更换模型或升级套餐。",
  resolution_not_allowed: "所选分辨率超出套餐限制，请降低分辨率或升级套餐。",
  model_not_found: "所选模型不可用，请更换模型。",
  provider_not_found: "生成服务尚未配置，请先配置模型服务的 API Key。",
  payments_not_configured: "支付服务尚未配置。",
  generation_failed: "生成失败，请稍后重试。",
  safety_filter: "内容未通过模型服务的安全检查，请修改描述后重试。",
  bootstrap_failed: "工作空间初始化失败，请重试。",
};

export function getUserFacingError(
  error: unknown,
  fallback = "操作失败，请稍后重试。",
): string {
  const detail: { code?: string; message?: string } =
    error && typeof error === "object"
      ? (error as { code?: string; message?: string })
      : { message: typeof error === "string" ? error : "" };
  const message = detail.message ?? "";
  if (/[\u3400-\u9fff]/.test(message)) return message;
  const translated = detail.code ? ERROR_MESSAGES[detail.code] : undefined;
  if (translated) return translated;
  if (/invalid login credentials/i.test(message))
    return ERROR_MESSAGES.invalid_credentials ?? fallback;
  if (/already registered|already exists/i.test(message))
    return ERROR_MESSAGES.user_already_exists ?? fallback;
  if (/email not confirmed/i.test(message))
    return ERROR_MESSAGES.email_not_confirmed ?? fallback;
  if (/password.*(?:least|short|weak)/i.test(message))
    return ERROR_MESSAGES.weak_password ?? fallback;
  if (
    /invalid.*(?:api.?key|credential)|api.?key.*(?:invalid|missing|not found)|GOOGLE_API_KEY|OPENAI_API_KEY/i.test(
      message,
    )
  ) {
    return "模型服务的 API Key 未配置或无效，请检查配置后重试。";
  }
  if (
    /quota|rate.?limit|too many requests|resource.?exhausted/i.test(message)
  ) {
    return "模型服务的额度不足或请求过于频繁，请检查额度或稍后重试。";
  }
  if (/fetch|network|failed to connect|load failed/i.test(message))
    return "网络连接失败，请检查服务状态后重试。";
  if (/timed? ?out|timeout|abort/i.test(message))
    return "请求超时，请稍后重试。";
  return fallback;
}
