const MODEL_DESCRIPTIONS: Record<string, string> = {
  "nano-banana-pro": "支持图片生成与编辑，最多输入 14 张参考图，最高 4K，适合多图参考编辑。",
  "nano-banana-2": "快速生成图片，支持对话式编辑、角色一致性和多图融合，最多输入 14 张图片。",
  "nano-banana": "支持图片编辑与风格转换，最多输入 14 张图片。",
  "gemini-3-pro-image-preview": "Gemini 3 Pro 图片生成与编辑预览版，最多输入 14 张图片，最高 4K，具备进阶推理能力。",
  "gemini-3.1-flash-image-preview": "Gemini 3.1 图片生成与编辑预览版，最多输入 14 张图片，生成速度更快。",
  "gemini-2.5-flash-image": "Gemini 原生图片生成与编辑，最多输入 14 张图片，兼顾稳定性、速度与质量。",
  "imagen-4": "Google Imagen 4 文生图模型，专注高质量图片生成，不支持参考图输入。",
  "gpt-image-1.5": "支持多图输入与透明背景，指令遵循能力更强。",
  "gpt-image-2.5-sunburst": "高质量图片生成与精确的多图编辑。",
  "gpt-image-2.5-flare": "快速、高质量的图片生成与多图编辑。",
  "gpt-image-2": "支持多种图片尺寸的生成与编辑。",
  "flux-kontext-max": "高性能文字指令图片编辑，增强文字排版效果，支持单张参考图。",
  "flux-kontext-pro": "精确遵循文字指令，保持编辑结果一致，支持单张参考图。",
  "seedream-5-lite": "内置推理与示例编辑能力，支持多图输入，最高 3K。",
  "seedream-4.5": "增强空间理解能力，支持多图输入，最高 4K。",
  "seedream-4": "统一文生图与精准图片编辑，支持多图输入，最高 4K。",
  "recraft-v3": "支持长文本渲染与丰富风格的文生图模型，不支持参考图输入。",
  "kling-v3-video": "支持文生视频与图生视频、原生音频及最多 6 个场景，时长 3–15 秒，最高 1080p。",
  "kling-v3-omni-video": "支持文生视频、图生视频及视频编辑，最多 7 张参考图，时长 3–15 秒，最高 1080p。",
  "kling-v2.6": "支持文生视频、图生视频及口型同步音频，时长 5–10 秒，最高 1080p。",
  "kling-o1": "使用自然语言编辑已有视频，时长 3–10 秒，最高 4K。",
  "seedance-1.5-pro": "支持文生视频、图生视频及 9 种语言的口型同步音频，时长 5–10 秒，最高 1080p。",
  "wan-2.6": "支持文生视频、图生视频和音频，最长 10 秒，最高 1080p。",
  "sora-2": "支持文生视频、图生视频及同步对白与音效，时长 4–12 秒，最高 1080p。",
  "sora-2-pro": "支持文生视频、图生视频及高质量同步音频，时长 4–12 秒，最高 1080p。",
  "veo-3": "Google 视频模型，支持文生视频及原生对白、音效和环境音，时长 8 秒，最高 1080p。",
  "veo-3.1": "支持文生视频、图生视频、原生音频、参考图和尾帧控制，时长 4–8 秒，最高 1080p。",
  "veo-3.1-fast": "快速视频生成，支持文生视频、图生视频和原生音频，时长 4–8 秒，最高 1080p。",
  "hailuo-2.3": "支持文生视频与图生视频，时长 6–10 秒，最高 1080p，不含音频。",
  "minimax-h3": "通过 Metaso 提供，支持文生视频和首尾帧生成，时长 4–15 秒，分辨率为 768P 或 2K。",
};

export function getModelDescription(id: string, original: string): string {
  const slug = id.split("/").pop() ?? id;
  if (MODEL_DESCRIPTIONS[slug]) return MODEL_DESCRIPTIONS[slug];
  if (/^veo-3\.1-(?:fast-|lite-)?generate-(?:preview|001)$/.test(slug)) {
    if (slug.includes("lite")) return "轻量视频模型，支持文生视频、图生视频和原生音频，时长 4–8 秒，最高 1080p。";
    return `${slug.includes("fast") ? "快速" : "高质量"}视频生成，支持文生视频、图生视频和原生音频，时长 4–8 秒，最高 4K。`;
  }
  if (/^veo-3\.0-(?:fast-)?generate-001$/.test(slug)) return "稳定的视频生成模型，支持文生视频、图生视频和原生音频，最高 4K。";
  if (slug === "veo-2.0-generate-001") return "支持文生视频和图生视频，时长 5–8 秒，分辨率为 720p，不含音频。";
  return /[\u3400-\u9fff]/.test(original) ? original : "模型能力请参考服务商说明。";
}
