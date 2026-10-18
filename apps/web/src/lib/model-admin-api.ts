import type {
  AdminUser,
  AdminUserCreate,
  AdminUserUpdate,
  ConfiguredModel,
  ConfiguredModelWrite,
  DiscoveredModelImport,
  ModelAdminResponse,
  ModelDiscoveryResponse,
  NetworkSettings,
  ProviderConfig,
  ProviderConnection,
  ProviderConnectionTest,
  ProviderCreation,
  ProviderWrite,
  SystemRole,
} from "@loomic/shared";
import { getServerBaseUrl } from "./env";

async function request<T>(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${getServerBaseUrl()}/api/admin${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result?.error?.message ?? "后台配置请求失败，请重试。");
  return result as T;
}
export const fetchModelAdmin = (token: string) =>
  request<ModelAdminResponse>(token, "/models");
export const fetchProviderApiKey = (token: string, id: string) =>
  request<{ apiKey: string }>(token, `/providers/${id}/api-key`, "POST");
export const createProviderWithModels = (
  token: string,
  value: ProviderCreation,
) =>
  request<ProviderConfig>(
    token,
    "/providers/create-with-models",
    "POST",
    value,
  );
export const discoverDraftProviderModels = (
  token: string,
  value: ProviderConnection,
) =>
  request<ModelDiscoveryResponse>(
    token,
    "/providers/discover-models",
    "POST",
    value,
  );
export const testProviderConnection = (
  token: string,
  value: ProviderConnection,
) =>
  request<ProviderConnectionTest>(
    token,
    "/providers/test-connection",
    "POST",
    value,
  );
export const fetchNetworkSettings = (token: string) =>
  request<NetworkSettings>(token, "/network");
export const saveNetworkSettings = (token: string, value: NetworkSettings) =>
  request<NetworkSettings>(token, "/network", "PUT", value);
export const saveProviderConfig = (
  token: string,
  value: ProviderWrite,
  id?: string,
) =>
  request<ProviderConfig>(
    token,
    id ? `/providers/${id}` : "/providers",
    id ? "PUT" : "POST",
    value,
  );
export const importPresetModels = (token: string, id: string) =>
  request(token, `/providers/${id}/import-models`, "POST");
export const fetchProviderModels = (token: string, id: string) =>
  request<ModelDiscoveryResponse>(token, `/providers/${id}/discover-models`);
export const importDiscoveredModels = (
  token: string,
  id: string,
  value: DiscoveredModelImport,
) =>
  request<{ imported: number; skipped: number }>(
    token,
    `/providers/${id}/import-discovered-models`,
    "POST",
    value,
  );
export const saveConfiguredModel = (
  token: string,
  value: ConfiguredModelWrite,
  id?: string,
) =>
  request<ConfiguredModel>(
    token,
    id ? `/models/${id}` : "/models",
    id ? "PUT" : "POST",
    value,
  );
export const setDefaultConfiguredModel = (token: string, id: string) =>
  request(token, `/models/${id}/default`, "POST");
export type { AdminUser } from "@loomic/shared";
export const createAdminUser = (token: string, value: AdminUserCreate) =>
  request<{ user: AdminUser }>(token, "/users", "POST", value);
export const updateAdminUser = (
  token: string,
  id: string,
  value: AdminUserUpdate,
) => request<{ user: AdminUser }>(token, `/users/${id}`, "PUT", value);
export const fetchAdminUsers = (token: string) =>
  request<{ users: AdminUser[] }>(token, "/users");
export const deleteAdminUser = (token: string, id: string) =>
  request<{ ok: true }>(token, `/users/${id}`, "DELETE");
export const updateSystemRole = (token: string, id: string, role: SystemRole) =>
  request(token, `/users/${id}/role`, "PUT", { role });
