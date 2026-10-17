import { randomUUID } from "node:crypto";
import {
  type ConfiguredModel,
  type ConfiguredModelWrite,
  type Database,
  type DiscoveredModelImport,
  type Json,
  type ModelKind,
  type ProviderConfig,
  type ProviderConnection,
  type ProviderConnectionTest,
  type ProviderCreation,
  type ProviderWrite,
  type SystemRole,
  configuredModelSchema,
  configuredModelWriteSchema,
  discoveredModelImportSchema,
  providerConfigSchema,
  providerConnectionSchema,
  providerCreationSchema,
  providerWriteSchema,
} from "@loomic/shared";
import { z } from "zod";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { ModelConfigError } from "./errors.js";
import { discoverProviderModels } from "./model-discovery.js";
import { createNetworkSettingsService } from "./network-settings.js";
import { MODEL_PRESETS } from "./presets.js";
import { decryptApiKey, encryptApiKey } from "./secrets.js";
export { ModelConfigError } from "./errors.js";

type ProviderRow = Database["public"]["Tables"]["model_providers"]["Row"];
export type PrivateProvider = ProviderConfig & { apiKey: string };
export type ConfiguredCatalog = {
  providers: PrivateProvider[];
  models: ConfiguredModel[];
};
function dbError(error: { code?: string } | null) {
  if (error)
    throw new ModelConfigError(
      error.code === "23505"
        ? "同一提供商中已存在这个模型。"
        : "模型配置保存失败，请重试。",
      error.code === "23505" ? 409 : 500,
    );
}
function validateModelOptions(value: Record<string, unknown>) {
  const schema = z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(1).max(1000000).optional(),
      capabilities: z
        .object({
          textToVideo: z.boolean().optional(),
          imageToVideo: z.boolean().optional(),
          videoToVideo: z.boolean().optional(),
          audio: z.boolean().optional(),
          lastFrame: z.boolean().optional(),
          referenceImages: z.boolean().optional(),
          videoExtension: z.boolean().optional(),
        })
        .optional(),
      limits: z
        .object({
          maxDuration: z.number().int().min(1).max(600).optional(),
          maxInputImages: z.number().int().min(0).max(100).optional(),
          maxResolution: z.enum(["480p", "720p", "1080p", "2160p"]).optional(),
          allowedDurations: z
            .array(z.number().int().min(1).max(600))
            .min(1)
            .optional(),
        })
        .optional(),
    })
    .passthrough();
  if (!schema.safeParse(value).success)
    throw new ModelConfigError(
      "请检查高级参数中的温度、Token 上限和视频能力数值。",
    );
  if (JSON.stringify(value).length > 32000)
    throw new ModelConfigError("高级参数过长。");
}
function publicProvider(row: ProviderRow): ProviderConfig {
  return providerConfigSchema.parse({
    id: row.id,
    createdBy: row.created_by,
    name: row.name,
    category: row.category,
    preset: row.preset,
    protocol: row.protocol,
    baseUrl: row.base_url,
    enabled: row.enabled,
    hasApiKey: !!row.api_key_ciphertext,
  });
}
function publicModel(
  row: Database["public"]["Tables"]["configured_models"]["Row"],
): ConfiguredModel {
  return configuredModelSchema.parse({
    id: row.id,
    providerId: row.provider_id,
    key: row.model_key,
    kind: row.kind,
    apiModel: row.api_model,
    name: row.name,
    description: row.description,
    adapter: row.adapter,
    enabled: row.enabled,
    isDefault: row.is_default,
    options: row.options,
  });
}

export function createModelConfigService(options: {
  getAdminClient: () => AdminSupabaseClient;
  secret: string;
}) {
  let cachedCatalog: ConfiguredCatalog | null = null;
  let cachedAt = 0;
  const invalidate = () => {
    cachedCatalog = null;
    cachedAt = 0;
  };
  const network: ReturnType<typeof createNetworkSettingsService> =
    createNetworkSettingsService({
      getAdminClient: options.getAdminClient,
      requireAdmin: (userId) => service.requireAdmin(userId),
    });
  const service = {
    ...network,
    invalidate,
    async role(userId: string): Promise<SystemRole> {
      const { data, error } = await options
        .getAdminClient()
        .from("system_user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new ModelConfigError("用户权限读取失败。", 503);
      return data?.role === "admin" ? "admin" : "user";
    },
    async requireAdmin(userId: string) {
      if ((await service.role(userId)) !== "admin")
        throw new ModelConfigError("只有管理员可以配置后台。", 403);
    },
    async list() {
      const client = options.getAdminClient();
      const [providers, models] = await Promise.all([
        client.from("model_providers").select("*").order("created_at"),
        client.from("configured_models").select("*").order("created_at"),
      ]);
      if (providers.error || models.error)
        throw new ModelConfigError("模型配置读取失败。", 503);
      return {
        providers: providers.data.map(publicProvider),
        models: models.data.map(publicModel),
        presets: MODEL_PRESETS,
      };
    },
    async catalog(force = false): Promise<ConfiguredCatalog> {
      if (!force && cachedCatalog && Date.now() - cachedAt < 2000)
        return cachedCatalog;
      const client = options.getAdminClient();
      const [providers, models] = await Promise.all([
        client.from("model_providers").select("*").eq("enabled", true),
        client
          .from("configured_models")
          .select("*")
          .eq("enabled", true)
          .order("created_at"),
      ]);
      if (providers.error || models.error)
        throw new ModelConfigError("启用模型读取失败，请联系管理员。", 503);
      const privateProviders = providers.data.map((row) => ({
        ...publicProvider(row),
        apiKey: row.api_key_ciphertext
          ? decryptApiKey(row.api_key_ciphertext, options.secret)
          : "",
      }));
      const providerIds = new Set(privateProviders.map((p) => p.id));
      cachedCatalog = {
        providers: privateProviders,
        models: models.data
          .filter((m) => providerIds.has(m.provider_id))
          .map(publicModel),
      };
      cachedAt = Date.now();
      return cachedCatalog;
    },
    async resolve(kind: ModelKind, key?: string) {
      const catalog = await service.catalog();
      const models = catalog.models.filter((m) => m.kind === kind);
      const model = key
        ? models.find((m) => m.key === key)
        : (models.find((m) => m.isDefault) ?? models[0]);
      if (!model)
        throw new ModelConfigError(
          key
            ? "所选模型已停用或不存在，请重新选择。"
            : "管理员尚未启用此类型的模型。",
          400,
        );
      const provider = catalog.providers.find((p) => p.id === model.providerId);
      if (!provider) throw new ModelConfigError("模型提供商不可用。", 400);
      return { model, provider };
    },
    async saveProvider(userId: string, input: ProviderWrite, id?: string) {
      await service.requireAdmin(userId);
      const value = providerWriteSchema.parse(input);
      const client = options.getAdminClient();
      let existing: ProviderRow | null = null;
      if (id) {
        const result = await client
          .from("model_providers")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (result.error || !result.data)
          throw new ModelConfigError("提供商不存在。", 404);
        existing = result.data;
      }
      if (!existing && !value.apiKey && value.category !== "custom")
        throw new ModelConfigError("请填写 API Key。");
      const providerId = id ?? randomUUID();
      const { apiKey: _key, ..._public } = value;
      const result = await client
        .from("model_providers")
        .upsert({
          id: providerId,
          created_by: existing?.created_by ?? userId,
          name: value.name,
          category: value.category,
          preset: value.preset,
          protocol: value.protocol,
          base_url: value.baseUrl.replace(/\/+$/, ""),
          enabled: value.enabled,
          api_key_ciphertext: value.apiKey
            ? encryptApiKey(value.apiKey, options.secret)
            : (existing?.api_key_ciphertext ?? ""),
        })
        .select("*")
        .single();
      dbError(result.error);
      invalidate();
      if (!result.data) throw new ModelConfigError("提供商保存失败。", 500);
      return publicProvider(result.data);
    },
    async createProviderWithModels(userId: string, input: ProviderCreation) {
      await service.requireAdmin(userId);
      const { provider, models } = providerCreationSchema.parse(input);
      if (!provider.apiKey && provider.category !== "custom")
        throw new ModelConfigError("请填写 API Key。");
      if (
        provider.protocol === "anthropic" &&
        models.some((model) => model.kind !== "text")
      )
        throw new ModelConfigError("Anthropic 接口目前只支持文本模型。");
      const identities = new Set(
        models.map((model) => `${model.kind}:${model.apiModel}`),
      );
      if (identities.size !== models.length)
        throw new ModelConfigError("待保存的模型中存在重复的类型和模型 ID。");
      for (const model of models) validateModelOptions(model.options);
      const id = randomUUID();
      const providerRow = {
        id,
        created_by: userId,
        name: provider.name,
        category: provider.category,
        preset: provider.preset,
        protocol: provider.protocol,
        base_url: provider.baseUrl.replace(/\/+$/, ""),
        api_key_ciphertext: provider.apiKey
          ? encryptApiKey(provider.apiKey, options.secret)
          : "",
        enabled: provider.enabled,
      };
      const rows = models.map((model) => ({
        id: randomUUID(),
        kind: model.kind,
        api_model: model.apiModel,
        name: model.name,
        description: model.description,
        adapter: model.adapter,
        enabled: model.enabled,
        options: model.options,
      }));
      const { error } = await options
        .getAdminClient()
        .rpc("create_model_provider_with_models", {
          p_provider: providerRow as Json,
          p_models: rows as Json,
        });
      dbError(error);
      invalidate();
      return publicProvider({ ...providerRow, created_at: "", updated_at: "" });
    },
    async saveModel(
      userId: string,
      input: ConfiguredModelWrite,
      id?: string,
      legacyKey?: string,
    ) {
      await service.requireAdmin(userId);
      const value = configuredModelWriteSchema.parse(input);
      validateModelOptions(value.options);
      const client = options.getAdminClient();
      const { data: provider, error } = await client
        .from("model_providers")
        .select("id,protocol,preset")
        .eq("id", value.providerId)
        .maybeSingle();
      if (error || !provider)
        throw new ModelConfigError("请先保存提供商配置。");
      if (provider.protocol === "anthropic" && value.kind !== "text")
        throw new ModelConfigError(
          "Anthropic Messages 接口只支持文本模型；媒体生成请选择 OpenAI 或 Gemini 接口。",
        );
      const modelId = id ?? randomUUID();
      let oldModel: ConfiguredModel | undefined;
      if (id) {
        const { data: old, error: oldError } = await client
          .from("configured_models")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (oldError || !old) throw new ModelConfigError("模型不存在。", 404);
        oldModel = publicModel(old);
        if (oldModel.providerId !== value.providerId)
          throw new ModelConfigError("请在原提供商内编辑模型。");
      }
      const result = await client
        .from("configured_models")
        .upsert({
          id: modelId,
          provider_id: value.providerId,
          model_key: oldModel?.key ?? legacyKey ?? `configured/${modelId}`,
          kind: value.kind,
          api_model: value.apiModel,
          name: value.name,
          description: value.description,
          adapter: value.adapter,
          enabled: value.enabled,
          options: value.options as Json,
          is_default:
            (oldModel?.isDefault &&
              oldModel.kind === value.kind &&
              value.enabled) ||
            false,
        })
        .select("*")
        .single();
      dbError(result.error);
      invalidate();
      if (!result.data) throw new ModelConfigError("模型配置保存失败。", 500);
      return publicModel(result.data);
    },
    async setDefault(userId: string, id: string) {
      await service.requireAdmin(userId);
      const { error } = await options
        .getAdminClient()
        .rpc("set_default_configured_model", { p_model_id: id });
      if (error)
        throw new ModelConfigError("请先启用模型和提供商，再设为默认。");
      invalidate();
    },
    async importPresetModels(userId: string, providerId: string) {
      await service.requireAdmin(userId);
      const client = options.getAdminClient();
      const { data: provider, error: readError } = await client
        .from("model_providers")
        .select("preset")
        .eq("id", providerId)
        .maybeSingle();
      if (readError || !provider)
        throw new ModelConfigError("提供商不存在。", 404);
      const preset = MODEL_PRESETS.find((p) => p.id === provider.preset);
      if (!preset) throw new ModelConfigError("没有可导入的预设模型。");
      const rows = preset.models.map((model) => {
        const id = randomUUID();
        return {
          id,
          provider_id: providerId,
          model_key: `configured/${id}`,
          kind: model.kind,
          api_model: model.apiModel,
          name: model.name,
          description: model.description,
          adapter: model.adapter,
          enabled: false,
          options: model.options as Json,
        };
      });
      if (rows.length) {
        const { error } = await client.from("configured_models").upsert(rows, {
          onConflict: "provider_id,kind,api_model",
          ignoreDuplicates: true,
        });
        dbError(error);
      }
      invalidate();
    },
    async discoverModels(userId: string, providerId: string) {
      await service.requireAdmin(userId);
      await network.syncNetworkSettings();
      const { data: provider, error } = await options
        .getAdminClient()
        .from("model_providers")
        .select("*")
        .eq("id", providerId)
        .maybeSingle();
      if (error || !provider) throw new ModelConfigError("提供商不存在。", 404);
      return discoverProviderModels({
        protocol: provider.protocol as ProviderConfig["protocol"],
        baseUrl: provider.base_url,
        preset: provider.preset,
        apiKey: provider.api_key_ciphertext
          ? decryptApiKey(provider.api_key_ciphertext, options.secret)
          : "",
      });
    },
    async discoverDraftModels(userId: string, input: ProviderConnection) {
      await service.requireAdmin(userId);
      const value = providerConnectionSchema.parse(input);
      let apiKey = value.apiKey ?? "";
      if (value.providerId && !apiKey) {
        const { data, error } = await options
          .getAdminClient()
          .from("model_providers")
          .select("api_key_ciphertext")
          .eq("id", value.providerId)
          .maybeSingle();
        if (error || !data) throw new ModelConfigError("提供商不存在。", 404);
        apiKey = data.api_key_ciphertext
          ? decryptApiKey(data.api_key_ciphertext, options.secret)
          : "";
      }
      await network.syncNetworkSettings();
      return discoverProviderModels({ ...value, apiKey });
    },
    async testProviderConnection(
      userId: string,
      input: ProviderConnection,
    ): Promise<ProviderConnectionTest> {
      const started = performance.now();
      try {
        const result = await service.discoverDraftModels(userId, input);
        return {
          status: "connected",
          latencyMs: Math.round(performance.now() - started),
          modelCount: result.models.length,
          message: `接口连接及鉴权通过，返回 ${result.models.length} 个模型。`,
        };
      } catch (error) {
        if (
          error instanceof ModelConfigError &&
          [404, 405, 501].includes(error.upstreamStatus ?? 0)
        ) {
          return {
            status: "reachable",
            latencyMs: Math.round(performance.now() - started),
            message:
              "服务可达，但未提供模型列表接口，无法验证 Key。请检查接口地址，或手动添加模型。",
          };
        }
        throw error;
      }
    },
    async importDiscoveredModels(
      userId: string,
      providerId: string,
      input: DiscoveredModelImport,
    ) {
      await service.requireAdmin(userId);
      const { models } = discoveredModelImportSchema.parse(input);
      const client = options.getAdminClient();
      const { data: provider, error: readError } = await client
        .from("model_providers")
        .select("preset,protocol")
        .eq("id", providerId)
        .maybeSingle();
      if (readError || !provider)
        throw new ModelConfigError("提供商不存在。", 404);
      if (
        provider.protocol === "anthropic" &&
        models.some((model) => model.kind !== "text")
      ) {
        throw new ModelConfigError("Anthropic 接口目前只支持文本模型。");
      }
      const preset = MODEL_PRESETS.find((item) => item.id === provider.preset);
      const unique = [
        ...new Map(
          models.map((model) => [`${model.kind}:${model.apiModel}`, model]),
        ).values(),
      ];
      const rows = unique.map((model) => {
        const id = randomUUID();
        const known = preset?.models.find(
          (item) =>
            item.apiModel === model.apiModel && item.kind === model.kind,
        );
        return {
          id,
          provider_id: providerId,
          model_key: `configured/${id}`,
          kind: model.kind,
          api_model: model.apiModel,
          name: model.name,
          description: model.description,
          adapter:
            known?.adapter ??
            (provider.preset === "agnes" &&
            (model.kind === "image" || model.kind === "video")
              ? "agnes"
              : "auto"),
          options: (known?.options ?? {}) as Json,
          enabled: false,
        };
      });
      const { data, error } = await client
        .from("configured_models")
        .upsert(rows, {
          onConflict: "provider_id,kind,api_model",
          ignoreDuplicates: true,
        })
        .select("id");
      dbError(error);
      invalidate();
      return {
        imported: data?.length ?? 0,
        skipped: unique.length - (data?.length ?? 0),
      };
    },
    async users(userId: string) {
      await service.requireAdmin(userId);
      const [profiles, roles] = await Promise.all([
        options
          .getAdminClient()
          .from("profiles")
          .select("id,display_name,email")
          .order("created_at")
          .limit(500),
        options
          .getAdminClient()
          .from("system_user_roles")
          .select("user_id,role"),
      ]);
      if (profiles.error || roles.error)
        throw new ModelConfigError("用户列表读取失败。", 503);
      const admins = new Set(
        roles.data.filter((r) => r.role === "admin").map((r) => r.user_id),
      );
      return profiles.data.map((p) => ({
        id: p.id,
        name: p.display_name ?? "未命名用户",
        email: p.email ?? "",
        role: admins.has(p.id) ? ("admin" as const) : ("user" as const),
      }));
    },
    async setRole(userId: string, targetId: string, role: SystemRole) {
      await service.requireAdmin(userId);
      const { error } = await options
        .getAdminClient()
        .rpc("set_system_user_role", { p_user_id: targetId, p_role: role });
      if (error)
        throw new ModelConfigError(
          "角色修改失败；系统必须保留至少一位管理员。",
        );
    },
  };
  return service;
}
export type ModelConfigService = ReturnType<typeof createModelConfigService>;
