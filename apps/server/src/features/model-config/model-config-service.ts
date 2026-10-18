import { randomUUID } from "node:crypto";
import {
  type AdminUserCreate,
  type AdminUserUpdate,
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
  type ProviderOrder,
  type ProviderWrite,
  type SystemRole,
  configuredModelSchema,
  configuredModelWriteSchema,
  discoveredModelImportSchema,
  providerConfigSchema,
  providerConnectionSchema,
  providerCreationSchema,
  providerOrderSchema,
  providerWriteSchema,
} from "@loomic/shared";
import { z } from "zod";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { ModelConfigError } from "./errors.js";
import { discoverProviderModels } from "./model-discovery.js";
import { createNetworkSettingsService } from "./network-settings.js";
import { PROVIDER_PRESETS } from "./provider-presets.js";
import { decryptApiKey, encryptApiKey } from "./secrets.js";
import {
  createManagedUser,
  deleteManagedUser,
  updateManagedUser,
} from "./user-administration.js";
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
function publicProvider(row: Omit<ProviderRow, "sort_order">): ProviderConfig {
  return providerConfigSchema.parse({
    id: row.id,
    createdBy: row.created_by,
    name: row.name,
    category: row.category,
    preset: row.preset,
    protocol: row.protocol,
    baseUrl: row.base_url,
    enabled: row.enabled,
    proxy: { mode: row.proxy_mode ?? "global", url: row.proxy_url ?? "" },
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
    protocol: row.protocol ?? undefined,
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
        client
          .from("model_providers")
          .select("*")
          .order("sort_order")
          .order("created_at")
          .order("id"),
        client.from("configured_models").select("*").order("created_at"),
      ]);
      if (providers.error || models.error)
        throw new ModelConfigError("模型配置读取失败。", 503);
      return {
        providers: providers.data.map(publicProvider),
        models: models.data.map(publicModel),
        presets: PROVIDER_PRESETS,
      };
    },
    async reorderProviders(userId: string, input: ProviderOrder) {
      await service.requireAdmin(userId);
      const { providerIds } = providerOrderSchema.parse(input);
      const { error } = await options
        .getAdminClient()
        .rpc("reorder_model_providers", { p_provider_ids: providerIds });
      if (error)
        throw new ModelConfigError(
          error.code === "P0001"
            ? "提供商列表已变化，请刷新页面后重新排序。"
            : "提供商排序保存失败，请重试。",
          error.code === "P0001" ? 409 : 503,
        );
      invalidate();
    },
    async revealProviderApiKey(userId: string, providerId: string) {
      await service.requireAdmin(userId);
      const { data, error } = await options
        .getAdminClient()
        .from("model_providers")
        .select("api_key_ciphertext")
        .eq("id", providerId)
        .maybeSingle();
      if (error) throw new ModelConfigError("密钥读取失败，请重试。", 503);
      if (!data) throw new ModelConfigError("提供商不存在。", 404);
      try {
        return {
          apiKey: data.api_key_ciphertext
            ? decryptApiKey(data.api_key_ciphertext, options.secret)
            : "",
        };
      } catch {
        throw new ModelConfigError("密钥读取失败，请重试。", 500);
      }
    },
    async catalog(force = false): Promise<ConfiguredCatalog> {
      if (!force && cachedCatalog && Date.now() - cachedAt < 2000)
        return cachedCatalog;
      const client = options.getAdminClient();
      const [providers, models] = await Promise.all([
        client
          .from("model_providers")
          .select("*")
          .eq("enabled", true)
          .order("sort_order")
          .order("created_at")
          .order("id"),
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
      // Provider order is the administrator's display order. Keep each
      // provider's models in the same order as the administration list.
      cachedCatalog = {
        providers: privateProviders,
        models: privateProviders.flatMap((provider) =>
          models.data
            .filter((model) => model.provider_id === provider.id)
            .map(publicModel),
        ),
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
      const row = {
        id: providerId,
        created_by: existing?.created_by ?? userId,
        name: value.name,
        category: value.category,
        preset: value.preset,
        protocol: value.protocol,
        base_url: value.baseUrl.replace(/\/+$/, ""),
        enabled: value.enabled,
        proxy_mode: value.proxy?.mode ?? existing?.proxy_mode ?? "global",
        proxy_url: value.proxy
          ? value.proxy.mode === "custom"
            ? value.proxy.url.replace(/\/$/, "")
            : ""
          : (existing?.proxy_url ?? ""),
        api_key_ciphertext: value.apiKey
          ? encryptApiKey(value.apiKey, options.secret)
          : (existing?.api_key_ciphertext ?? ""),
      };
      const table = client.from("model_providers");
      const result = await (existing
        ? table.update(row).eq("id", providerId)
        : table.insert(row)
      )
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
        models.some(
          (model) =>
            (model.protocol ?? provider.protocol) === "anthropic" &&
            model.kind !== "text",
        )
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
        proxy_mode: provider.proxy?.mode ?? "global",
        proxy_url:
          provider.proxy?.mode === "custom"
            ? provider.proxy.url.replace(/\/$/, "")
            : "",
      };
      const rows = models.map((model) => ({
        id: randomUUID(),
        kind: model.kind,
        protocol: model.protocol ?? null,
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
          p_provider: providerRow as NonNullable<Json>,
          p_models: rows as NonNullable<Json>,
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
      const protocol = value.protocol ?? oldModel?.protocol ?? null;
      if (
        (protocol ?? provider.protocol) === "anthropic" &&
        value.kind !== "text"
      )
        throw new ModelConfigError(
          "Anthropic Messages 接口只支持文本模型；媒体生成请选择 OpenAI 或 Gemini 接口。",
        );
      const result = await client
        .from("configured_models")
        .upsert({
          id: modelId,
          provider_id: value.providerId,
          model_key: oldModel?.key ?? legacyKey ?? `configured/${modelId}`,
          kind: value.kind,
          protocol,
          api_model: value.apiModel,
          name: value.name,
          description: value.description,
          adapter: value.adapter,
          enabled: value.enabled,
          options: value.options as NonNullable<Json>,
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
    async deleteProviderModels(userId: string, providerId: string) {
      await service.requireAdmin(userId);
      const client = options.getAdminClient();
      const provider = await client
        .from("model_providers")
        .select("id")
        .eq("id", providerId)
        .maybeSingle();
      if (provider.error)
        throw new ModelConfigError("模型删除失败，请重试。", 503);
      if (!provider.data) throw new ModelConfigError("提供商不存在。", 404);
      const { error, count } = await client
        .from("configured_models")
        .delete({ count: "exact" })
        .eq("provider_id", providerId);
      if (error) throw new ModelConfigError("模型删除失败，请重试。", 503);
      invalidate();
      return { deleted: count ?? 0 };
    },
    async deleteModel(userId: string, id: string) {
      await service.requireAdmin(userId);
      const { data, error } = await options
        .getAdminClient()
        .from("configured_models")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw new ModelConfigError("模型删除失败，请重试。", 503);
      if (!data) throw new ModelConfigError("模型不存在或已删除。", 404);
      invalidate();
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
        proxy: publicProvider(provider).proxy,
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
      const unique = [
        ...new Map(
          models.map((model) => [`${model.kind}:${model.apiModel}`, model]),
        ).values(),
      ];
      const rows = unique.map((model) => {
        const id = randomUUID();
        return {
          id,
          provider_id: providerId,
          model_key: `configured/${id}`,
          kind: model.kind,
          api_model: model.apiModel,
          name: model.name,
          description: model.description,
          adapter:
            provider.preset === "agnes" &&
            (model.kind === "image" || model.kind === "video")
              ? "agnes"
              : "auto",
          options: {},
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
    async createUser(userId: string, value: AdminUserCreate) {
      await service.requireAdmin(userId);
      return createManagedUser(options.getAdminClient(), value);
    },
    async deleteUser(userId: string, targetId: string) {
      await service.requireAdmin(userId);
      await deleteManagedUser(options.getAdminClient(), userId, targetId);
    },
    async updateUser(userId: string, targetId: string, value: AdminUserUpdate) {
      await service.requireAdmin(userId);
      return updateManagedUser(
        options.getAdminClient(),
        targetId,
        await service.role(targetId),
        value,
      );
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
