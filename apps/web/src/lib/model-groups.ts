type ModelProvider = {
  provider?: string | undefined;
  providerId?: string | undefined;
  providerName?: string | undefined;
};

const PROVIDER_NAMES: Record<string, string> = {
  google: "Google",
  "google-vertex": "Google Vertex AI",
  openai: "OpenAI",
  "openai-official": "OpenAI",
  agnes: "Agnes AI",
  replicate: "Replicate",
  volces: "火山引擎",
};

export function getModelProviderName(model: ModelProvider) {
  return (
    model.providerName ??
    (model.provider
      ? (PROVIDER_NAMES[model.provider] ?? model.provider)
      : "其他提供商")
  );
}

/** Preserve catalog order and keep separately configured accounts apart. */
export function groupModelsByProvider<T extends ModelProvider>(
  models: readonly T[],
) {
  const groups = new Map<string, { key: string; name: string; models: T[] }>();
  for (const model of models) {
    const key = model.providerId
      ? `configured:${model.providerId}`
      : `legacy:${model.provider ?? "unknown"}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, name: getModelProviderName(model), models: [] };
      groups.set(key, group);
    }
    group.models.push(model);
  }
  return [...groups.values()];
}
