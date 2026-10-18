import { z } from "zod";

export const modelKindSchema = z.enum(["text", "audio", "image", "video"]);
export const providerCategorySchema = z.enum([
  "manufacturer",
  "third_party",
  "cloud",
  "custom",
]);
export const modelProtocolSchema = z.enum(["openai", "anthropic", "gemini"]);
export const systemRoleSchema = z.enum(["admin", "user"]);
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    return /^https?:\/\/[^/?#@]+(?:\/[^?#]*)?$/.test(value);
  }, "请填写不含密钥、查询参数或账号密码的 HTTP(S) 接口地址");

export const providerProxySchema = z
  .object({
    mode: z.enum(["global", "custom", "direct"]),
    url: z.string().trim().max(1000).default(""),
  })
  .superRefine((value, context) => {
    if (value.mode !== "custom") return;
    if (
      z
        .string()
        .url()
        .regex(/^http:\/\/[^/?#@\s\\]+\/?$/)
        .safeParse(value.url).success
    )
      return;
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "请填写 HTTP 代理地址，例如 http://127.0.0.1:10808",
    });
  });

export const providerWriteSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: providerCategorySchema,
  preset: z.string().trim().max(80).default("custom"),
  protocol: modelProtocolSchema,
  baseUrl: httpUrl,
  apiKey: z.string().trim().max(32000).optional(),
  proxy: providerProxySchema.optional(),
  enabled: z.boolean().default(true),
});
export const providerConfigSchema = providerWriteSchema
  .omit({ apiKey: true })
  .extend({
    id: z.string().uuid(),
    createdBy: z.string().uuid(),
    hasApiKey: z.boolean(),
  });
export const providerOrderSchema = z.object({
  providerIds: z
    .array(z.string().uuid())
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length, "提供商不能重复"),
});
export const providerConnectionSchema = providerWriteSchema
  .pick({
    protocol: true,
    baseUrl: true,
    apiKey: true,
    preset: true,
    proxy: true,
  })
  .extend({ providerId: z.string().uuid().optional() });
export const networkSettingsSchema = z
  .object({
    enabled: z.boolean(),
    proxyUrl: z
      .string()
      .trim()
      .max(1000)
      .refine(
        (value) => !value || /^http:\/\/[^/?#@]+\/?$/.test(value),
        "请填写 HTTP 代理地址，例如 http://127.0.0.1:10808",
      ),
    noProxy: z.string().trim().max(2000).default(""),
  })
  .refine(
    (value) => !value.enabled || !!value.proxyUrl,
    "启用代理时请填写代理地址",
  );
export const configuredModelWriteSchema = z.object({
  providerId: z.string().uuid(),
  kind: modelKindSchema,
  apiModel: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  adapter: z.enum(["auto", "agnes", "veo"]).default("auto"),
  enabled: z.boolean().default(false),
  options: z.record(z.unknown()).default({}),
});
export const configuredModelSchema = configuredModelWriteSchema.extend({
  id: z.string().uuid(),
  key: z.string().min(1),
  isDefault: z.boolean(),
});
export const providerCreationSchema = z.object({
  provider: providerWriteSchema,
  models: z
    .array(configuredModelWriteSchema.omit({ providerId: true }))
    .max(1000),
});
export const modelPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: providerCategorySchema,
  protocol: modelProtocolSchema,
  baseUrl: z.string(),
  models: z.array(
    configuredModelWriteSchema
      .omit({ providerId: true })
      .extend({ legacyKey: z.string().optional() }),
  ),
});
export const modelAdminResponseSchema = z.object({
  providers: z.array(providerConfigSchema),
  models: z.array(configuredModelSchema),
  presets: z.array(modelPresetSchema),
});
export const discoveredModelSchema = configuredModelWriteSchema
  .pick({ apiModel: true, name: true, description: true })
  .extend({ kind: modelKindSchema.nullable() });
export const modelDiscoveryResponseSchema = z.object({
  models: z.array(discoveredModelSchema),
  truncated: z.boolean(),
});
export const discoveredModelImportSchema = z.object({
  models: z
    .array(discoveredModelSchema.extend({ kind: modelKindSchema }))
    .min(1)
    .max(1000),
});
export type DiscoveredModel = z.infer<typeof discoveredModelSchema>;
export type ProviderConnection = z.infer<typeof providerConnectionSchema>;
export type NetworkSettings = z.infer<typeof networkSettingsSchema>;
export type ProviderCreation = z.infer<typeof providerCreationSchema>;
export type ProviderConnectionTest = {
  status: "connected" | "reachable";
  latencyMs: number;
  modelCount?: number;
  message: string;
};
export type ModelDiscoveryResponse = z.infer<
  typeof modelDiscoveryResponseSchema
>;
export type DiscoveredModelImport = z.infer<typeof discoveredModelImportSchema>;
export type ModelKind = z.infer<typeof modelKindSchema>;
export type ModelProtocol = z.infer<typeof modelProtocolSchema>;
export type ProviderWrite = z.infer<typeof providerWriteSchema>;
export type ProviderProxy = z.infer<typeof providerProxySchema>;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type ProviderOrder = z.infer<typeof providerOrderSchema>;
export type ConfiguredModelWrite = z.infer<typeof configuredModelWriteSchema>;
export type ConfiguredModel = z.infer<typeof configuredModelSchema>;
export type ModelPreset = z.infer<typeof modelPresetSchema>;
export type ModelAdminResponse = z.infer<typeof modelAdminResponseSchema>;
export type SystemRole = z.infer<typeof systemRoleSchema>;
