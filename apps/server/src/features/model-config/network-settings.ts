import { type NetworkSettings, networkSettingsSchema } from "@loomic/shared";
import {
  applyNetworkProxy,
  resolveProxyConfiguration,
} from "../../config/network-proxy.js";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { ModelConfigError } from "./errors.js";

export function networkConfiguration(value: NetworkSettings) {
  try {
    return value.enabled
      ? resolveProxyConfiguration({
          GLOBAL_AGENT_HTTP_PROXY: value.proxyUrl,
          GLOBAL_AGENT_NO_PROXY: value.noProxy,
        })
      : null;
  } catch {
    throw new ModelConfigError(
      "代理地址无效，请填写 HTTP 代理地址，例如 http://127.0.0.1:10808。",
    );
  }
}
export function createNetworkSettingsService(options: {
  getAdminClient: () => AdminSupabaseClient;
  requireAdmin: (userId: string) => Promise<void>;
}) {
  let checkedAt = 0;
  let revision = 0;
  let pending: Promise<void> | null = null;
  async function networkSettings(): Promise<NetworkSettings> {
    const { data, error } = await options
      .getAdminClient()
      .from("system_network_settings")
      .select("enabled,proxy_url,no_proxy")
      .eq("id", 1)
      .maybeSingle();
    if (error)
      throw new ModelConfigError(
        "全局网络设置读取失败，请检查数据库迁移。",
        503,
      );
    return networkSettingsSchema.parse(
      data
        ? {
            enabled: data.enabled,
            proxyUrl: data.proxy_url,
            noProxy: data.no_proxy,
          }
        : { enabled: false, proxyUrl: "", noProxy: "" },
    );
  }
  async function syncNetworkSettings(force = false): Promise<void> {
    if (!force && Date.now() - checkedAt < 2000) return;
    if (pending) return pending;
    const currentRevision = revision;
    pending = (async () => {
      const value = await networkSettings();
      if (revision !== currentRevision) return;
      applyNetworkProxy(networkConfiguration(value));
      checkedAt = Date.now();
    })().finally(() => {
      pending = null;
    });
    return pending;
  }
  async function saveNetworkSettings(userId: string, input: NetworkSettings) {
    await options.requireAdmin(userId);
    const value = networkSettingsSchema.parse(input);
    const configuration = networkConfiguration(value);
    const { error } = await options
      .getAdminClient()
      .from("system_network_settings")
      .upsert({
        id: 1,
        enabled: value.enabled,
        proxy_url: value.proxyUrl.replace(/\/$/, ""),
        no_proxy: value.noProxy,
        updated_by: userId,
      });
    if (error) throw new ModelConfigError("全局网络设置保存失败。", 503);
    revision++;
    applyNetworkProxy(configuration);
    checkedAt = Date.now();
    return { ...value, proxyUrl: value.proxyUrl.replace(/\/$/, "") };
  }
  return { networkSettings, saveNetworkSettings, syncNetworkSettings };
}
