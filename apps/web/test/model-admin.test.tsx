import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render as renderUI,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminPage from "../src/app/(workspace)/admin/page";
import { ToastProvider } from "../src/components/toast";

const render = (ui: ReactNode) => renderUI(ui, { wrapper: ToastProvider });

const state = vi.hoisted(() => ({
  role: "admin",
  fetch: vi.fn(),
  saveModel: vi.fn(),
  saveProvider: vi.fn(),
  revealKey: vi.fn(),
  discover: vi.fn(),
  importModels: vi.fn(),
  discoverDraft: vi.fn(),
  createProvider: vi.fn(),
  testConnection: vi.fn(),
  fetchNetwork: vi.fn(),
  saveNetwork: vi.fn(),
}));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    role: state.role,
    roleLoading: false,
    loading: false,
    session: { access_token: "token", user: { id: "admin" } },
    refreshRole: vi.fn(),
  }),
}));
vi.mock("../src/lib/model-admin-api", () => ({
  fetchModelAdmin: state.fetch,
  saveConfiguredModel: state.saveModel,
  saveProviderConfig: state.saveProvider,
  fetchProviderApiKey: state.revealKey,
  fetchProviderModels: state.discover,
  importDiscoveredModels: state.importModels,
  discoverDraftProviderModels: state.discoverDraft,
  createProviderWithModels: state.createProvider,
  testProviderConnection: state.testConnection,
  fetchNetworkSettings: state.fetchNetwork,
  saveNetworkSettings: state.saveNetwork,
  fetchAdminUsers: vi.fn(async () => ({ users: [] })),
  createAdminUser: vi.fn(),
  updateAdminUser: vi.fn(),
  importPresetModels: vi.fn(),
  setDefaultConfiguredModel: vi.fn(),
  updateSystemRole: vi.fn(),
}));
const provider = {
  id: "provider-1",
  createdBy: "admin",
  name: "Agnes AI",
  category: "third_party",
  preset: "agnes",
  protocol: "openai",
  baseUrl: "https://api.agnes-ai.cn/v1",
  enabled: true,
  hasApiKey: true,
};
const model = {
  id: "model-1",
  key: "agnes:test",
  providerId: provider.id,
  apiModel: "agnes-test",
  kind: "text",
  name: "Agnes 测试模型",
  enabled: false,
  isDefault: false,
  adapter: "auto",
  description: "",
  options: {},
};
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  state.role = "admin";
  state.fetch
    .mockReset()
    .mockResolvedValue({ providers: [provider], models: [model], presets: [] });
  state.saveModel.mockReset().mockResolvedValue({ ...model, enabled: true });
  state.saveProvider.mockReset().mockResolvedValue(provider);
  state.revealKey.mockReset().mockResolvedValue({ apiKey: "saved-test-key" });
  state.discover.mockReset().mockResolvedValue({
    models: [
      {
        apiModel: model.apiModel,
        name: model.name,
        kind: "text",
        description: "",
      },
      {
        apiModel: "remote-image",
        name: "Remote Image",
        kind: "image",
        description: "Image description",
      },
      { apiModel: "private-id", name: "私有模型", kind: null, description: "" },
    ],
    truncated: false,
  });
  state.importModels.mockReset().mockResolvedValue({ imported: 1, skipped: 0 });
  state.discoverDraft.mockReset().mockResolvedValue({
    models: [
      {
        apiModel: "draft-chat",
        name: "Draft Chat",
        kind: "text",
        description: "",
      },
    ],
    truncated: false,
  });
  state.createProvider.mockReset().mockResolvedValue(provider);
  state.testConnection.mockReset().mockResolvedValue({
    status: "connected",
    latencyMs: 12,
    modelCount: 2,
    message: "接口连接及鉴权通过，返回 2 个模型。",
  });
  state.fetchNetwork.mockReset().mockResolvedValue({
    enabled: true,
    proxyUrl: "http://127.0.0.1:10808",
    noProxy: "",
  });
  state.saveNetwork
    .mockReset()
    .mockImplementation(async (_token, value) => value);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("does not load administrator configuration for an ordinary user", () => {
  state.role = "user";
  render(<AdminPage />);
  expect(screen.getByText(/只有管理员可以访问后台/)).toBeInTheDocument();
  expect(state.fetch).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/API Key/)).not.toBeInTheDocument();
});
it("opens the user management panel from the administrator tabs", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  await screen.findByRole("checkbox", { name: "启用 Agnes 测试模型" });
  await user.click(screen.getByRole("tab", { name: "用户管理" }));
  expect(
    await screen.findByRole("table", { name: "用户及后台访问角色" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("暂无用户")).toBeInTheDocument();
});
it("keeps saved keys masked and exposes the four model types", async () => {
  render(<AdminPage />);
  await screen.findByRole("checkbox", { name: "启用 Agnes 测试模型" });
  expect(screen.getByLabelText(/API Key/)).toHaveValue("");
  for (const name of [/文本/, /语音/, /图片/, /视频生成/])
    expect(screen.getByRole("tab", { name })).toBeInTheDocument();
  expect(state.revealKey).not.toHaveBeenCalled();
  expect(screen.getByPlaceholderText("••••••••••••••••")).toHaveAttribute(
    "type",
    "password",
  );
});
it("reveals and copies a saved key without changing the key being submitted", async () => {
  const user = userEvent.setup();
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  render(<AdminPage />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "显示密钥" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "显示密钥" }));
  const input = screen.getByLabelText(/API Key/);
  await waitFor(() => expect(input).toHaveValue("saved-test-key"));
  expect(input).toHaveAttribute("type", "text");
  expect(state.revealKey).toHaveBeenCalledExactlyOnceWith("token", provider.id);
  await user.click(screen.getByRole("button", { name: "隐藏密钥" }));
  expect(input).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "复制密钥" }));
  expect(writeText).toHaveBeenCalledWith("saved-test-key");
  expect(await screen.findByRole("status")).toHaveTextContent("密钥已复制");
  expect(input).toHaveAttribute("type", "password");
  expect(state.revealKey).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "保存提供商" }));
  await waitFor(() =>
    expect(state.saveProvider).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ apiKey: "" }),
      provider.id,
    ),
  );
  await waitFor(() => expect(screen.getByLabelText(/API Key/)).toHaveValue(""));
  expect(screen.getByLabelText(/API Key/)).toHaveAttribute("type", "password");
});
it("uses the entered key for preview and copy, and reports clipboard failures", async () => {
  const user = userEvent.setup();
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValueOnce(new Error("clipboard denied"))
    .mockResolvedValue(undefined);
  render(<AdminPage />);
  await user.click(await screen.findByRole("button", { name: "添加提供商" }));
  expect(screen.getByRole("button", { name: "显示密钥" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "复制密钥" })).toBeDisabled();
  await user.type(
    screen.getByLabelText("API Key", { exact: true }),
    "draft-only-key",
  );
  await user.click(screen.getByRole("button", { name: "显示密钥" }));
  expect(screen.getByLabelText("API Key", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await user.click(screen.getByRole("button", { name: "复制密钥" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("复制失败");
  await user.click(screen.getByRole("button", { name: "复制密钥" }));
  expect(writeText).toHaveBeenLastCalledWith("draft-only-key");
  expect(await screen.findByRole("status")).toHaveTextContent("密钥已复制");
  expect(state.revealKey).not.toHaveBeenCalled();
});
it("does not copy an old provider key after switching providers during a request", async () => {
  const user = userEvent.setup();
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  const other = { ...provider, id: "provider-2", name: "另一个提供商" };
  state.fetch.mockResolvedValue({
    providers: [provider, other],
    models: [model],
    presets: [],
  });
  let resolveKey!: (value: { apiKey: string }) => void;
  state.revealKey.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveKey = resolve;
      }),
  );
  render(<AdminPage />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "复制密钥" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "复制密钥" }));
  await user.click(screen.getByRole("button", { name: other.name }));
  await act(async () => resolveKey({ apiKey: "old-provider-key" }));
  expect(writeText).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/API Key/)).toHaveValue("");
  expect(screen.getByLabelText(/API Key/)).toHaveAttribute("type", "password");
  expect(screen.getByRole("button", { name: "显示密钥" })).toBeEnabled();
});
it("does not overwrite a newly entered key with a delayed saved-key response", async () => {
  const user = userEvent.setup();
  let resolveKey!: (value: { apiKey: string }) => void;
  state.revealKey.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveKey = resolve;
      }),
  );
  render(<AdminPage />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "显示密钥" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "显示密钥" }));
  await user.type(screen.getByLabelText(/API Key/), "new-draft-key");
  await act(async () => resolveKey({ apiKey: "old-saved-key" }));
  expect(screen.getByLabelText(/API Key/)).toHaveValue("new-draft-key");
  expect(screen.getByLabelText(/API Key/)).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "显示密钥" }));
  expect(screen.getByLabelText(/API Key/)).toHaveValue("new-draft-key");
  expect(screen.getByLabelText(/API Key/)).toHaveAttribute("type", "text");
  expect(state.revealKey).toHaveBeenCalledOnce();
});
it("allows retrying a failed saved-key read without exposing error details", async () => {
  const user = userEvent.setup();
  state.revealKey.mockRejectedValueOnce(new Error("private-error-fixture"));
  render(<AdminPage />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "显示密钥" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "显示密钥" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("密钥读取失败");
  expect(screen.queryByText(/private-error-fixture/)).toBeNull();
  expect(screen.getByLabelText(/API Key/)).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "显示密钥" }));
  await waitFor(() =>
    expect(screen.getByLabelText(/API Key/)).toHaveValue("saved-test-key"),
  );
});
it("enables a model explicitly through the administrator API", async () => {
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("checkbox", { name: "启用 Agnes 测试模型" }),
  );
  await waitFor(() =>
    expect(state.saveModel).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        providerId: provider.id,
        apiModel: model.apiModel,
        enabled: true,
      }),
      model.id,
    ),
  );
  const notification = await screen.findByRole("status");
  expect(notification).toHaveTextContent("模型已启用，前台可以选择。");
  expect(notification).toHaveAttribute("data-slot", "toast");
});
it("shows failed model updates as a toast and keeps the existing selection", async () => {
  state.saveModel.mockRejectedValueOnce(new Error("模型更新失败，请重试。"));
  render(<AdminPage />);
  const checkbox = await screen.findByRole("checkbox", {
    name: "启用 Agnes 测试模型",
  });
  await userEvent.click(checkbox);
  const notification = await screen.findByRole("alert");
  expect(notification).toHaveTextContent("模型更新失败");
  expect(notification).toHaveAttribute("data-slot", "toast");
  expect(checkbox).not.toBeChecked();
});
it("keeps configuration loading failures on the page", async () => {
  state.fetch.mockRejectedValueOnce(new Error("模型配置读取失败。"));
  render(<AdminPage />);
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("模型配置读取失败");
  expect(error).not.toHaveAttribute("data-slot", "toast");
});
it("fetches the saved provider list without enabling or overwriting existing models", async () => {
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "获取模型列表" }),
  );
  const image = await screen.findByRole("checkbox", {
    name: "导入 remote-image",
  });
  expect(state.discover).toHaveBeenCalledWith("token", provider.id);
  expect(image).not.toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: `导入 ${model.apiModel}` }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    screen.getByRole("checkbox", { name: "导入 private-id" }),
  ).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(image);
  await userEvent.click(
    screen.getByRole("button", { name: "导入所选模型（1）" }),
  );
  await waitFor(() =>
    expect(state.importModels).toHaveBeenCalledWith("token", provider.id, {
      models: [
        {
          apiModel: "remote-image",
          name: "Remote Image",
          kind: "image",
          description: "Image description",
        },
      ],
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "已导入 1 个模型",
  );
  expect(state.saveModel).not.toHaveBeenCalled();
});
it("lets administrators classify unknown models and select only matching search results", async () => {
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "获取模型列表" }),
  );
  await userEvent.click(
    await screen.findByRole("combobox", { name: "private-id 模型类型" }),
  );
  await userEvent.click(await screen.findByRole("option", { name: "文本" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "搜索模型" }),
    "private-id",
  );
  await userEvent.click(screen.getByRole("button", { name: "全选当前结果" }));
  expect(
    screen.getByRole("checkbox", { name: "导入 private-id" }),
  ).toBeChecked();
  await userEvent.click(
    screen.getByRole("button", { name: "导入所选模型（1）" }),
  );
  await waitFor(() =>
    expect(state.importModels).toHaveBeenCalledWith("token", provider.id, {
      models: [
        expect.objectContaining({ apiModel: "private-id", kind: "text" }),
      ],
    }),
  );
});
it("recovers from a provider discovery failure through retry", async () => {
  state.discover.mockRejectedValueOnce(new Error("模型列表鉴权失败"));
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "获取模型列表" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "模型列表鉴权失败",
  );
  await userEvent.click(screen.getByRole("button", { name: "重新获取" }));
  expect(
    await screen.findByRole("checkbox", { name: "导入 remote-image" }),
  ).toBeInTheDocument();
  expect(state.discover).toHaveBeenCalledTimes(2);
  expect(state.importModels).not.toHaveBeenCalled();
});
it("can switch providers during discovery without showing stale results or locking configuration", async () => {
  const other = { ...provider, id: "other-provider", name: "另一个提供商" };
  state.fetch.mockResolvedValue({
    providers: [provider, other],
    models: [model],
    presets: [],
  });
  let resolveListing!: (value: unknown) => void;
  state.discover.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveListing = resolve;
      }),
  );
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "获取模型列表" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "正在获取模型列表",
  );
  expect(
    screen.getByRole("dialog", { name: "获取模型列表" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await userEvent.click(screen.getByRole("button", { name: /另一个提供商/ }));
  await act(async () => {
    resolveListing({
      models: [
        {
          apiModel: "stale-model",
          name: "Stale",
          kind: "text",
          description: "",
        },
      ],
      truncated: false,
    });
  });
  expect(
    screen.getByRole("heading", { name: "另一个提供商" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "获取的模型列表" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存提供商" })).toBeEnabled();
});
it("fetches and stages models before a new provider exists, then saves them together", async () => {
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "添加提供商" }),
  );
  await userEvent.type(
    screen.getByLabelText("配置名称", { exact: true }),
    "临时团队模型",
  );
  await userEvent.type(
    screen.getByLabelText("API Key", { exact: true }),
    "draft-only-key",
  );
  await userEvent.click(screen.getByRole("button", { name: "获取模型列表" }));
  expect(
    await screen.findByRole("dialog", { name: "获取模型列表" }),
  ).toBeInTheDocument();
  await userEvent.click(
    await screen.findByRole("checkbox", { name: "导入 draft-chat" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "导入所选模型（1）" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(state.discoverDraft).toHaveBeenCalledWith(
    "token",
    expect.objectContaining({ apiKey: "draft-only-key" }),
  );
  expect(state.createProvider).not.toHaveBeenCalled();
  expect(state.saveProvider).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "启用 Draft Chat" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "保存提供商" }));
  await waitFor(() =>
    expect(state.createProvider).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        provider: expect.objectContaining({
          name: "临时团队模型",
          apiKey: "draft-only-key",
        }),
        models: [
          expect.objectContaining({ apiModel: "draft-chat", enabled: true }),
        ],
      }),
    ),
  );
  expect(state.importModels).not.toHaveBeenCalled();
});
it("stages a manually added model before creating a provider", async () => {
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "添加提供商" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "添加模型" }));
  await userEvent.type(
    screen.getByLabelText("显示名称", { exact: true }),
    "手动模型",
  );
  await userEvent.type(
    screen.getByLabelText("模型 ID", { exact: true }),
    "manual-model",
  );
  await userEvent.click(screen.getByRole("button", { name: "加入待保存模型" }));
  expect(
    await screen.findByRole("checkbox", { name: "启用 手动模型" }),
  ).not.toBeChecked();
  expect(state.saveModel).not.toHaveBeenCalled();
  expect(state.createProvider).not.toHaveBeenCalled();
});
it("tests the current unsaved connection without saving or invoking generation", async () => {
  render(<AdminPage />);
  await userEvent.clear(
    await screen.findByLabelText("接口地址", { exact: true }),
  );
  await userEvent.type(
    screen.getByLabelText("接口地址", { exact: true }),
    "https://draft.example/v1",
  );
  await userEvent.click(screen.getByRole("button", { name: "测试连通性" }));
  await waitFor(() =>
    expect(state.testConnection).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        providerId: provider.id,
        baseUrl: "https://draft.example/v1",
      }),
    ),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "接口连接及鉴权通过",
  );
  expect(state.saveProvider).not.toHaveBeenCalled();
});
it("loads and saves one global proxy configuration", async () => {
  render(<AdminPage />);
  await userEvent.click(await screen.findByRole("tab", { name: "网络设置" }));
  expect(await screen.findByLabelText("代理地址", { exact: true })).toHaveValue(
    "http://127.0.0.1:10808",
  );
  await userEvent.clear(screen.getByLabelText("代理地址", { exact: true }));
  await userEvent.type(
    screen.getByLabelText("代理地址", { exact: true }),
    "http://127.0.0.1:7890",
  );
  await userEvent.click(screen.getByRole("button", { name: "保存网络设置" }));
  await waitFor(() =>
    expect(state.saveNetwork).toHaveBeenCalledWith("token", {
      enabled: true,
      proxyUrl: "http://127.0.0.1:7890",
      noProxy: "",
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("全局代理已保存");
});
