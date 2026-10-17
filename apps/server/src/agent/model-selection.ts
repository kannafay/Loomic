import type {
  ImageGenerationPreference,
  MessageMention,
  VideoGenerationPreference,
} from "@loomic/shared";

/** Manual selection is an allowlist, never a suggestion to the language model. */
export function selectedGenerationModels<T extends { id: string }>(
  models: T[],
  preference?: ImageGenerationPreference | VideoGenerationPreference,
  mentions: MessageMention[] = [],
): T[] {
  const mentioned = mentions
    .filter((m) => m.mentionType === "image-model")
    .map((m) => m.id);
  const requested = mentioned.length
    ? mentioned
    : preference?.mode === "manual"
      ? preference.models
      : [];
  if (!requested.length) return models;
  const selected = models.filter((model) => requested.includes(model.id));
  if (requested.some((id) => !selected.some((model) => model.id === id))) {
    throw new Error(
      "手动选择的模型已停用或不可用，请重新选择。不会自动切换到其他提供商。",
    );
  }
  return selected;
}
