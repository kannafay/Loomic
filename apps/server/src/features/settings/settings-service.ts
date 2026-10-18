import {
  type ModelInfo,
  type ModelKind,
  type ModelPreferences,
  type WorkspaceSettings,
  modelPreferenceKinds,
  modelPreferencesSchema,
  resolvePreferredModel,
} from "@loomic/shared";
import { ModelConfigError } from "../model-config/errors.js";

import type {
  AuthenticatedUser,
  UserSupabaseClient,
} from "../../supabase/user.js";

const FALLBACK_MODEL = "gpt-5.4-mini";

export class SettingsServiceError extends Error {
  readonly statusCode: number;
  readonly code:
    | "settings_not_found"
    | "settings_read_failed"
    | "settings_update_failed";

  constructor(
    code:
      | "settings_not_found"
      | "settings_read_failed"
      | "settings_update_failed",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type SettingsService = {
  getModelPreferences(user: AuthenticatedUser): Promise<ModelPreferences>;
  updateModelPreferences(
    user: AuthenticatedUser,
    preferences: ModelPreferences,
  ): Promise<ModelPreferences>;
  resolveModelPreference(
    user: AuthenticatedUser,
    kind: ModelKind,
    override?: string,
  ): Promise<string>;
  getWorkspaceSettings(
    user: AuthenticatedUser,
    workspaceId: string,
  ): Promise<WorkspaceSettings>;
  updateWorkspaceSettings(
    user: AuthenticatedUser,
    workspaceId: string,
    settings: WorkspaceSettings,
  ): Promise<WorkspaceSettings>;
};

export function createSettingsService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
  /** Override the fallback model when no workspace setting exists. */
  defaultModel?: string;
  resolveModel?: (key?: string) => Promise<string>;
  listModels: (kind: ModelKind) => Promise<ModelInfo[]>;
}): SettingsService {
  const defaultModel = options.defaultModel ?? FALLBACK_MODEL;

  const service: SettingsService = {
    async getModelPreferences(user) {
      const { data, error } = await options
        .createUserClient(user.accessToken)
        .from("profiles")
        .select("model_preferences")
        .eq("id", user.id)
        .single();
      if (error)
        throw new SettingsServiceError(
          "settings_read_failed",
          "模型偏好加载失败，请重试。",
          500,
        );
      return modelPreferencesSchema.parse(data.model_preferences);
    },
    async updateModelPreferences(user, preferences) {
      const previous = await service.getModelPreferences(user);
      // An unchanged unavailable selection can be retained while another type is edited.
      // Newly selected models must belong to the requested type and be enabled.
      await Promise.all(
        modelPreferenceKinds.map(async (kind) => {
          const key = preferences[kind];
          if (key && key !== previous[kind]) {
            const models = await options.listModels(kind);
            if (!resolvePreferredModel(models, key))
              throw new ModelConfigError(
                "所选模型已停用或不存在，请重新选择。",
                400,
              );
          }
        }),
      );
      const { error } = await options
        .createUserClient(user.accessToken)
        .from("profiles")
        .update({ model_preferences: preferences })
        .eq("id", user.id)
        .select("id")
        .single();
      if (error)
        throw new SettingsServiceError(
          "settings_update_failed",
          "模型偏好保存失败，请重试。",
          500,
        );
      return preferences;
    },
    async resolveModelPreference(user, kind, override) {
      const preference =
        override ?? (await service.getModelPreferences(user))[kind];
      const model = resolvePreferredModel(
        await options.listModels(kind),
        preference,
      );
      if (!model)
        throw new ModelConfigError(
          preference
            ? "默认模型已停用或不存在，请到个人中心重新选择模型。"
            : "暂无可用模型，请联系管理员。",
          400,
        );
      return model.id;
    },
    async getWorkspaceSettings(user, workspaceId) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("workspace_settings")
        .select("default_model")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error) {
        throw new SettingsServiceError(
          "settings_read_failed",
          "Unable to load workspace settings.",
          500,
        );
      }

      const saved = data?.default_model;
      if (options.resolveModel) {
        try {
          return {
            defaultModel: await options.resolveModel(saved ?? undefined),
          };
        } catch {
          return { defaultModel: await options.resolveModel() };
        }
      }
      return { defaultModel: saved ?? defaultModel };
    },

    async updateWorkspaceSettings(user, workspaceId, settings) {
      if (options.resolveModel)
        await options.resolveModel(settings.defaultModel);
      const client = options.createUserClient(user.accessToken);
      const { error } = await client.from("workspace_settings").upsert(
        {
          workspace_id: workspaceId,
          default_model: settings.defaultModel,
        },
        { onConflict: "workspace_id" },
      );

      if (error) {
        throw new SettingsServiceError(
          "settings_update_failed",
          "Unable to update workspace settings.",
          500,
        );
      }

      return settings;
    },
  };
  return service;
}
