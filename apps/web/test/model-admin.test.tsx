import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render as renderUI,
  screen,
  waitFor,
  within,
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
  deleteModel: vi.fn(),
  deleteProviderModels: vi.fn(),
  saveProvider: vi.fn(),
  saveOrder: vi.fn(),
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
  deleteConfiguredModel: state.deleteModel,
  deleteProviderModels: state.deleteProviderModels,
  saveProviderConfig: state.saveProvider,
  saveProviderOrder: state.saveOrder,
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
  deleteAdminUser: vi.fn(),
  setDefaultConfiguredModel: vi.fn(),
  updateSystemRole: vi.fn(),
}));
const provider = {
  id: "provider-1",
  createdBy: "admin",
  name: "Agnes AI",
  category: "manufacturer",
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
  state.deleteModel.mockReset().mockResolvedValue({ ok: true });
  state.deleteProviderModels.mockReset().mockResolvedValue({ deleted: 2 });
  state.saveModel.mockReset().mockResolvedValue({ ...model, enabled: true });
  state.saveProvider.mockReset().mockResolvedValue(provider);
  state.saveOrder.mockReset().mockResolvedValue({ ok: true });
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
  for (const name of [/文本/, /语音/, /图片/, /视频/])
    expect(screen.getByRole("tab", { name })).toBeInTheDocument();
  expect(state.revealKey).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "添加提供商" })).toHaveTextContent(
    "添加提供商",
  );
  expect(screen.getByPlaceholderText("••••••••••••••••")).toHaveAttribute(
    "type",
    "password",
  );
});
it("quickly toggles the selected provider without submitting or clearing unsaved fields", async () => {
  const user = userEvent.setup();
  let finish!: (value: typeof provider) => void;
  state.saveProvider.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<AdminPage />);
  const toggle = await screen.findByRole("switch", { name: "启用 Agnes AI" });
  await user.clear(screen.getByLabelText("配置名称"));
  await user.type(screen.getByLabelText("配置名称"), "未保存的名称");
  await user.type(screen.getByLabelText(/API Key/), "unsaved-test-key");
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-disabled", "true");
  await user.click(toggle);
  expect(state.saveProvider).toHaveBeenCalledExactlyOnceWith(
    "token",
    {
      name: provider.name,
      category: provider.category,
      preset: provider.preset,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      proxy: undefined,
      enabled: false,
    },
    provider.id,
  );
  await act(async () => {
    finish({ ...provider, enabled: false });
  });
  await waitFor(() =>
    expect(toggle).not.toHaveAttribute("aria-disabled", "true"),
  );
  expect(toggle).not.toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: "启用此提供商" }),
  ).not.toBeChecked();
  expect(screen.getByLabelText("配置名称")).toHaveValue("未保存的名称");
  expect(screen.getByLabelText(/API Key/)).toHaveValue("unsaved-test-key");
  expect(state.fetch).toHaveBeenCalledOnce();
  state.saveProvider.mockResolvedValueOnce(provider);
  toggle.focus();
  await user.keyboard(" ");
  await waitFor(() => expect(toggle).toBeChecked());
  expect(screen.getByRole("checkbox", { name: "启用此提供商" })).toBeChecked();
  expect(state.saveProvider).toHaveBeenLastCalledWith(
    "token",
    expect.objectContaining({ enabled: true }),
    provider.id,
  );
});

it("toggles another provider without selecting it or changing the open draft", async () => {
  const other = {
    ...provider,
    id: "provider-2",
    name: "Google",
    preset: "google",
    enabled: false,
  };
  state.fetch.mockResolvedValue({
    providers: [provider, other],
    models: [model],
    presets: [],
  });
  state.saveProvider.mockResolvedValue({ ...other, enabled: true });
  const user = userEvent.setup();
  render(<AdminPage />);
  const toggle = await screen.findByRole("switch", { name: "启用 Google" });
  await user.clear(screen.getByLabelText("配置名称"));
  await user.type(screen.getByLabelText("配置名称"), "未保存的名称");
  await user.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());
  expect(screen.getByRole("button", { name: "Agnes AI" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Google" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByLabelText("配置名称")).toHaveValue("未保存的名称");
  expect(state.saveProvider).toHaveBeenCalledExactlyOnceWith(
    "token",
    expect.objectContaining({ name: "Google", enabled: true }),
    other.id,
  );
});

it("retains the provider status and reports a failed quick toggle", async () => {
  state.saveProvider.mockRejectedValueOnce(new Error("启停保存失败"));
  const user = userEvent.setup();
  render(<AdminPage />);
  const toggle = await screen.findByRole("switch", { name: "启用 Agnes AI" });
  await user.click(toggle);
  expect(await screen.findByRole("alert")).toHaveTextContent("启停保存失败");
  expect(toggle).not.toHaveAttribute("aria-disabled", "true");
  expect(toggle).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "启用此提供商" })).toBeChecked();
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
it("defaults to all model types, filters by type and edits media using its own kind", async () => {
  const image = {
    ...model,
    id: "image-1",
    key: "agnes:image",
    apiModel: "agnes-image-next",
    name: "图片测试模型",
    kind: "image",
    adapter: "agnes",
  };
  const video = {
    ...model,
    id: "video-1",
    key: "agnes:video",
    apiModel: "agnes-video-next",
    name: "视频测试模型",
    kind: "video",
    adapter: "agnes",
    options: { limits: { maxDuration: 8, maxResolution: "720p" } },
  };
  const audio = {
    ...model,
    id: "audio-1",
    key: "agnes:audio",
    apiModel: "tts-next",
    name: "语音测试模型",
    kind: "audio",
  };
  state.fetch.mockResolvedValue({
    providers: [provider],
    models: [model, image, video, audio],
    presets: [],
  });
  const user = userEvent.setup();
  render(<AdminPage />);
  const all = await screen.findByRole("tab", { name: /^全部/ });
  expect(all).toHaveAttribute("aria-selected", "true");
  expect(all).toHaveTextContent("4");
  for (const item of [model, image, video, audio]) {
    expect(
      screen.getByRole("checkbox", { name: `启用 ${item.name}` }),
    ).toBeInTheDocument();
  }
  await user.click(screen.getByRole("tab", { name: /^图片/ }));
  expect(
    screen.getByRole("checkbox", { name: `启用 ${image.name}` }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: `启用 ${model.name}` }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: `启用 ${video.name}` }),
  ).not.toBeInTheDocument();
  await user.click(all);
  await user.click(screen.getByRole("button", { name: `编辑 ${video.name}` }));
  const editor = within(
    await screen.findByRole("dialog", { name: "编辑模型" }),
  );
  expect(editor.getByRole("combobox", { name: "媒体接口" })).toHaveTextContent(
    "Agnes 图片／视频接口",
  );
  expect(editor.getByLabelText(/高级参数/)).toHaveValue(
    JSON.stringify(video.options, null, 2),
  );
  await user.click(editor.getByRole("button", { name: "保存模型" }));
  await waitFor(() =>
    expect(state.saveModel).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        kind: "video",
        adapter: "agnes",
        options: video.options,
      }),
      video.id,
    ),
  );
});
it("opens manual addition directly in a focused dialog without fetching models", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(await screen.findByRole("button", { name: "手动添加" }));
  const editor = within(
    await screen.findByRole("dialog", { name: "添加模型" }),
  );
  const name = editor.getByLabelText("显示名称");
  await waitFor(() => expect(editor.getByLabelText("模型 ID")).toHaveFocus());
  expect(editor.getByRole("checkbox", { name: "启用到前台" })).toBeChecked();
  await user.type(name, "内部文本模型");
  await user.type(editor.getByLabelText("模型 ID"), "private-latest");
  await user.click(editor.getByRole("button", { name: "保存模型" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(state.saveModel).toHaveBeenCalledWith(
    "token",
    expect.objectContaining({
      providerId: provider.id,
      kind: "text",
      apiModel: "private-latest",
      name: "内部文本模型",
      enabled: true,
    }),
    undefined,
  );
  expect(state.discover).not.toHaveBeenCalled();
  expect(state.discoverDraft).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "补充预设" }),
  ).not.toBeInTheDocument();
});
it("fills the name from the first ID field without overwriting a custom name or changing the ID from the name", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(await screen.findByRole("button", { name: "手动添加" }));
  const editor = within(
    await screen.findByRole("dialog", { name: "添加模型" }),
  );
  const id = editor.getByLabelText("模型 ID");
  const name = editor.getByLabelText("显示名称");
  expect(editor.getAllByRole("textbox")[0]).toBe(id);
  expect(editor.queryByLabelText("说明")).not.toBeInTheDocument();
  await user.type(id, "custom-image-v1");
  expect(name).toHaveValue("custom-image-v1");
  await user.clear(id);
  await user.type(id, "custom-image-v2");
  expect(name).toHaveValue("custom-image-v2");
  await user.clear(name);
  await user.type(name, "内部图片模型");
  expect(id).toHaveValue("custom-image-v2");
  await user.clear(id);
  await user.type(id, "custom-image-v3");
  expect(name).toHaveValue("内部图片模型");
  await user.click(editor.getByRole("combobox", { name: "模型用途" }));
  for (const kind of ["文本", "语音", "图片", "视频"])
    expect(screen.getByRole("option", { name: kind })).toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: "图片" }));
  await user.click(editor.getByRole("combobox", { name: "API 协议" }));
  for (const protocol of ["OpenAI", "Anthropic", "Gemini"])
    expect(screen.getByRole("option", { name: protocol })).toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: "Gemini" }));
  await user.click(editor.getByRole("checkbox", { name: "启用到前台" }));
  await user.click(editor.getByRole("button", { name: "保存模型" }));
  await waitFor(() =>
    expect(state.saveModel).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        apiModel: "custom-image-v3",
        name: "内部图片模型",
        kind: "image",
        protocol: "gemini",
        adapter: "auto",
        enabled: false,
      }),
      undefined,
    ),
  );
});
it("edits a model in a dialog, discards cancelled changes and preserves its options on save", async () => {
  state.fetch.mockResolvedValue({
    providers: [provider],
    models: [
      {
        ...model,
        protocol: "anthropic",
        description: "已有说明",
        options: { temperature: 0.3 },
      },
    ],
    presets: [],
  });
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(
    await screen.findByRole("button", { name: "编辑 Agnes 测试模型" }),
  );
  let editor = within(await screen.findByRole("dialog", { name: "编辑模型" }));
  await user.type(editor.getByLabelText("显示名称"), "未保存");
  await user.click(editor.getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(state.saveModel).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "编辑 Agnes 测试模型" }));
  editor = within(await screen.findByRole("dialog", { name: "编辑模型" }));
  expect(editor.getByLabelText("显示名称")).toHaveValue(model.name);
  expect(editor.getByLabelText("模型 ID")).toHaveValue(model.apiModel);
  expect(
    editor.getByRole("checkbox", { name: "启用到前台" }),
  ).not.toBeChecked();
  expect(editor.getByRole("combobox", { name: "模型用途" })).toHaveTextContent(
    "文本",
  );
  expect(editor.getByRole("combobox", { name: "API 协议" })).toHaveTextContent(
    "Anthropic",
  );
  await user.click(editor.getByRole("combobox", { name: "模型用途" }));
  await user.click(screen.getByRole("option", { name: "语音" }));
  await user.click(editor.getByRole("combobox", { name: "API 协议" }));
  await user.click(screen.getByRole("option", { name: "OpenAI" }));
  await user.clear(editor.getByLabelText("显示名称"));
  await user.type(editor.getByLabelText("显示名称"), "新的显示名称");
  await user.click(editor.getByRole("button", { name: "保存模型" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(state.saveModel).toHaveBeenCalledWith(
    "token",
    expect.objectContaining({
      name: "新的显示名称",
      apiModel: model.apiModel,
      kind: "audio",
      protocol: "openai",
      description: "已有说明",
      options: { temperature: 0.3 },
      enabled: false,
    }),
    model.id,
  );
});
it("confirms deletion, retains the model on failure and blocks duplicate requests while retrying", async () => {
  const user = userEvent.setup();
  state.deleteModel.mockRejectedValueOnce(new Error("模型删除失败，请重试。"));
  render(<AdminPage />);
  await user.click(
    await screen.findByRole("button", { name: "删除 Agnes 测试模型" }),
  );
  let confirmation = within(
    await screen.findByRole("dialog", { name: "删除模型" }),
  );
  await waitFor(() =>
    expect(confirmation.getByRole("button", { name: "取消" })).toHaveFocus(),
  );
  expect(state.deleteModel).not.toHaveBeenCalled();
  await user.click(confirmation.getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "删除 Agnes 测试模型" }));
  confirmation = within(
    await screen.findByRole("dialog", { name: "删除模型" }),
  );
  await user.click(confirmation.getByRole("button", { name: "确认删除" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("模型删除失败");
  expect(screen.getByRole("dialog", { name: "删除模型" })).toHaveTextContent(
    model.name,
  );
  let finish!: (value: { ok: true }) => void;
  state.deleteModel.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await user.click(confirmation.getByRole("button", { name: "确认删除" }));
  expect(
    confirmation.getByRole("button", { name: "正在删除…" }),
  ).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "删除模型" })).toBeInTheDocument();
  await act(async () => finish({ ok: true }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("checkbox", { name: "启用 Agnes 测试模型" }),
  ).not.toBeInTheDocument();
  expect(state.deleteModel).toHaveBeenCalledTimes(2);
  expect(state.deleteModel).toHaveBeenLastCalledWith("token", model.id);
});
it("confirms deleting every type for only the current provider and supports retry without overlapping requests", async () => {
  const other = { ...provider, id: "provider-2", name: "其他提供商" };
  const image = { ...model, id: "image-1", kind: "image", name: "图片模型" };
  const otherModel = {
    ...model,
    id: "other-model",
    providerId: other.id,
    name: "其他提供商模型",
  };
  state.fetch.mockResolvedValue({
    providers: [provider, other],
    models: [model, image, otherModel],
    presets: [],
  });
  state.deleteProviderModels.mockRejectedValueOnce(
    new Error("全部删除失败，请重试。"),
  );
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(await screen.findByRole("tab", { name: /^图片/ }));
  await user.click(screen.getByRole("button", { name: "删除全部" }));
  let dialog = within(
    await screen.findByRole("dialog", { name: "删除全部模型" }),
  );
  expect(dialog.getByText("Agnes AI")).toBeInTheDocument();
  expect(dialog.getByText("共 2 个模型")).toBeInTheDocument();
  expect(dialog.getByText(/包含所有类型/)).toBeInTheDocument();
  await waitFor(() =>
    expect(dialog.getByRole("button", { name: "取消" })).toHaveFocus(),
  );
  await user.click(dialog.getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(state.deleteProviderModels).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "删除全部" }));
  dialog = within(await screen.findByRole("dialog", { name: "删除全部模型" }));
  await user.click(dialog.getByRole("button", { name: "确认删除全部" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("全部删除失败");
  expect(screen.getByText("图片模型")).toBeInTheDocument();
  let finish!: (value: { deleted: number }) => void;
  state.deleteProviderModels.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await user.click(dialog.getByRole("button", { name: "确认删除全部" }));
  expect(dialog.getByRole("button", { name: "正在删除…" })).toBeDisabled();
  await user.click(dialog.getByRole("button", { name: "正在删除…" }));
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("dialog", { name: "删除全部模型" }),
  ).toBeInTheDocument();
  expect(state.deleteProviderModels).toHaveBeenCalledTimes(2);
  await act(async () => finish({ deleted: 2 }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(state.deleteProviderModels).toHaveBeenLastCalledWith(
    "token",
    provider.id,
  );
  expect(state.deleteModel).not.toHaveBeenCalled();
  expect(screen.getByRole("tab", { name: /^全部/ })).toHaveTextContent("0");
  expect(screen.getByRole("button", { name: "删除全部" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: other.name }));
  await user.click(screen.getByRole("tab", { name: /^全部/ }));
  expect(
    screen.getByRole("checkbox", { name: "启用 其他提供商模型" }),
  ).toBeInTheDocument();
});

it("disables delete-all for an empty list and clears staged models without a database call", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(await screen.findByRole("button", { name: "添加提供商" }));
  expect(screen.getByRole("button", { name: "删除全部" })).toBeDisabled();
  await user.type(screen.getByLabelText("配置名称"), "新提供商");
  await user.click(screen.getByRole("button", { name: "手动添加" }));
  const editor = within(
    await screen.findByRole("dialog", { name: "添加模型" }),
  );
  await user.type(editor.getByLabelText("显示名称"), "待保存模型");
  await user.type(editor.getByLabelText("模型 ID"), "staged-test");
  await user.click(editor.getByRole("button", { name: "加入待保存模型" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "删除全部" }));
  const dialog = within(
    await screen.findByRole("dialog", { name: "删除全部模型" }),
  );
  expect(dialog.getByText("新提供商")).toBeInTheDocument();
  expect(dialog.getByText("共 1 个模型")).toBeInTheDocument();
  await user.click(dialog.getByRole("button", { name: "确认删除全部" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("checkbox", { name: "启用 待保存模型" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "删除全部" })).toBeDisabled();
  expect(state.deleteProviderModels).not.toHaveBeenCalled();
  expect(state.deleteModel).not.toHaveBeenCalled();
  expect(state.saveModel).not.toHaveBeenCalled();
});

it("adds, edits and removes a new provider's staged model without a database mutation", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(await screen.findByRole("button", { name: "添加提供商" }));
  await user.type(screen.getByLabelText("配置名称"), "本地提供商");
  await user.type(
    screen.getByLabelText("API Key", { exact: true }),
    "test-only-key",
  );
  await user.click(screen.getByRole("tab", { name: /^图片/ }));
  await user.click(screen.getByRole("button", { name: "手动添加" }));
  let editor = within(await screen.findByRole("dialog", { name: "添加模型" }));
  await user.type(editor.getByLabelText("显示名称"), "待保存图片模型");
  await user.type(editor.getByLabelText("模型 ID"), "private-image-next");
  await user.click(editor.getByRole("button", { name: "加入待保存模型" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("tab", { name: /^全部/ })).toHaveTextContent("1");
  await user.click(screen.getByRole("button", { name: "编辑 待保存图片模型" }));
  editor = within(await screen.findByRole("dialog", { name: "编辑模型" }));
  await user.clear(editor.getByLabelText("显示名称"));
  await user.type(editor.getByLabelText("显示名称"), "已编辑图片模型");
  await user.click(editor.getByRole("button", { name: "加入待保存模型" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "删除 已编辑图片模型" }));
  const confirmation = within(
    await screen.findByRole("dialog", { name: "删除模型" }),
  );
  await user.click(confirmation.getByRole("button", { name: "确认删除" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("checkbox", { name: "启用 已编辑图片模型" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /^全部/ })).toHaveTextContent("0");
  expect(state.saveModel).not.toHaveBeenCalled();
  expect(state.deleteModel).not.toHaveBeenCalled();
  expect(state.discoverDraft).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "保存提供商" }));
  await waitFor(() =>
    expect(state.createProvider).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ models: [] }),
    ),
  );
});
it("saves a staged model's chosen purpose and protocol together with its new provider", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(await screen.findByRole("button", { name: "添加提供商" }));
  await user.type(screen.getByLabelText("配置名称"), "内部网关");
  await user.type(
    screen.getByLabelText("API Key", { exact: true }),
    "test-only-key",
  );
  await user.click(screen.getByRole("button", { name: "手动添加" }));
  const editor = within(
    await screen.findByRole("dialog", { name: "添加模型" }),
  );
  await user.type(editor.getByLabelText("模型 ID"), "private-video-next");
  await user.click(editor.getByRole("combobox", { name: "模型用途" }));
  await user.click(screen.getByRole("option", { name: "视频" }));
  await user.click(editor.getByRole("combobox", { name: "API 协议" }));
  await user.click(screen.getByRole("option", { name: "OpenAI" }));
  await user.click(editor.getByRole("button", { name: "加入待保存模型" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "保存提供商" }));
  await waitFor(() =>
    expect(state.createProvider).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        models: [
          expect.objectContaining({
            apiModel: "private-video-next",
            name: "private-video-next",
            kind: "video",
            protocol: "openai",
          }),
        ],
      }),
    ),
  );
  expect(state.saveModel).not.toHaveBeenCalled();
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
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "搜索模型" })).toHaveFocus(),
  );
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
    screen.getByRole("button", { name: "添加所选模型（1）" }),
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
    "已添加并启用 1 个模型",
  );
  expect(state.saveModel).not.toHaveBeenCalled();
});
it("filters model types and keeps selections across filtering and search", async () => {
  state.discover.mockResolvedValueOnce({
    models: [
      {
        apiModel: model.apiModel,
        name: model.name,
        kind: "text",
        description: "",
      },
      {
        apiModel: "future-image",
        name: "最新图片模型",
        kind: "image",
        description: "",
      },
      {
        apiModel: "future-video",
        name: "future-video",
        kind: "video",
        description: "",
      },
    ],
    truncated: false,
  });
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(await screen.findByRole("button", { name: "获取模型列表" }));
  const dialog = within(
    await screen.findByRole("dialog", { name: "获取模型列表" }),
  );
  await user.click(dialog.getByRole("tab", { name: /^图片/ }));
  expect(
    dialog.queryByRole("checkbox", { name: "导入 future-video" }),
  ).not.toBeInTheDocument();
  await user.click(dialog.getByRole("checkbox", { name: "导入 future-image" }));
  await user.click(dialog.getByRole("tab", { name: /^视频/ }));
  expect(dialog.getAllByText("future-video")).toHaveLength(1);
  await user.click(dialog.getByRole("button", { name: "全选当前结果" }));
  await user.type(
    dialog.getByRole("textbox", { name: "搜索模型" }),
    "不存在的模型",
  );
  expect(dialog.getByText("没有匹配的模型。")).toBeInTheDocument();
  expect(
    dialog.getByRole("button", { name: "添加所选模型（2）" }),
  ).toBeEnabled();
  await user.click(dialog.getByRole("button", { name: "添加所选模型（2）" }));
  await waitFor(() =>
    expect(state.importModels).toHaveBeenCalledWith("token", provider.id, {
      models: [
        expect.objectContaining({ apiModel: "future-image", kind: "image" }),
        expect.objectContaining({ apiModel: "future-video", kind: "video" }),
      ],
    }),
  );
});
it("updates classification filters, clears empty searches and can clear all selections", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(await screen.findByRole("button", { name: "获取模型列表" }));
  const dialog = within(
    await screen.findByRole("dialog", { name: "获取模型列表" }),
  );
  await screen.findByRole("checkbox", { name: "导入 remote-image" });
  await user.click(dialog.getByRole("tab", { name: /^未分类/ }));
  await user.click(
    dialog.getByRole("combobox", { name: "private-id 模型类型" }),
  );
  await user.click(await screen.findByRole("option", { name: "图片" }));
  expect(dialog.getByText("没有匹配的模型。")).toBeInTheDocument();
  expect(dialog.getByRole("tab", { name: /^未分类/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.click(dialog.getByRole("tab", { name: /^图片/ }));
  await user.click(dialog.getByRole("button", { name: "全选当前结果" }));
  expect(
    dialog.getByRole("button", { name: "添加所选模型（2）" }),
  ).toBeEnabled();
  await user.type(dialog.getByRole("textbox", { name: "搜索模型" }), "未匹配");
  await user.click(dialog.getByRole("button", { name: "清除筛选" }));
  expect(dialog.getByRole("textbox", { name: "搜索模型" })).toHaveValue("");
  expect(
    dialog.getByRole("checkbox", { name: "导入 remote-image" }),
  ).toBeChecked();
  expect(
    dialog.getByRole("checkbox", { name: "导入 private-id" }),
  ).toBeChecked();
  await user.click(dialog.getByRole("button", { name: "清空选择" }));
  expect(
    dialog.getByRole("checkbox", { name: "导入 remote-image" }),
  ).not.toBeChecked();
  expect(
    dialog.getByRole("checkbox", { name: "导入 private-id" }),
  ).not.toBeChecked();
  expect(
    dialog.getByRole("button", { name: "添加所选模型（0）" }),
  ).toBeDisabled();
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
    screen.getByRole("button", { name: "添加所选模型（1）" }),
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
it("falls back to manual addition when the saved provider model list fails", async () => {
  state.discover.mockRejectedValueOnce(new Error("这个接口未提供模型列表。"));
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "获取模型列表" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("未提供模型列表");
  await userEvent.click(
    within(screen.getByRole("dialog", { name: "获取模型列表" })).getByRole(
      "button",
      { name: "手动添加" },
    ),
  );
  expect(
    await screen.findByRole("dialog", { name: "添加模型" }),
  ).toBeInTheDocument();
  const name = screen.getByLabelText("显示名称", { exact: true });
  await waitFor(() =>
    expect(screen.getByLabelText("模型 ID", { exact: true })).toHaveFocus(),
  );
  await userEvent.type(name, "私有模型");
  await userEvent.type(
    screen.getByLabelText("模型 ID", { exact: true }),
    "private-chat-model",
  );
  await userEvent.click(screen.getByRole("button", { name: "保存模型" }));
  await waitFor(() =>
    expect(state.saveModel).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        providerId: provider.id,
        apiModel: "private-chat-model",
        name: "私有模型",
        kind: "text",
        enabled: true,
      }),
      undefined,
    ),
  );
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
  await userEvent.click(screen.getByRole("button", { name: "另一个提供商" }));
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
    screen.getByRole("button", { name: "添加所选模型（1）" }),
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
  expect(
    screen.getByRole("checkbox", { name: "启用 Draft Chat" }),
  ).toBeChecked();
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
it("falls back to manual staging when a new provider returns an empty list", async () => {
  state.discoverDraft.mockResolvedValueOnce({ models: [], truncated: false });
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "添加提供商" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "获取模型列表" }));
  expect(
    await screen.findByText(/提供商没有返回可获取的模型/),
  ).toBeInTheDocument();
  await userEvent.click(
    within(screen.getByRole("dialog", { name: "获取模型列表" })).getByRole(
      "button",
      { name: "手动添加" },
    ),
  );
  expect(
    await screen.findByRole("dialog", { name: "添加模型" }),
  ).toBeInTheDocument();
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
  ).toBeChecked();
  expect(state.saveModel).not.toHaveBeenCalled();
  expect(state.createProvider).not.toHaveBeenCalled();
});
it("uses manufacturer presets for connection defaults and saves only models selected from discovery", async () => {
  state.fetch.mockResolvedValue({
    providers: [provider],
    models: [model],
    presets: [
      {
        id: "deepseek",
        name: "DeepSeek",
        category: "manufacturer",
        protocol: "openai",
        baseUrl: "https://api.deepseek.com",
      },
      {
        id: "minimax",
        name: "MiniMax",
        category: "manufacturer",
        protocol: "openai",
        baseUrl: "https://api.minimax.cn/v1",
      },
    ],
  });
  render(<AdminPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "添加提供商" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "MiniMax" }));
  expect(screen.getByLabelText("配置名称", { exact: true })).toHaveValue(
    "MiniMax",
  );
  expect(screen.getByLabelText("接口地址", { exact: true })).toHaveValue(
    "https://api.minimax.cn/v1",
  );
  await userEvent.click(screen.getByRole("button", { name: "DeepSeek" }));
  expect(screen.getByLabelText("配置名称", { exact: true })).toHaveValue(
    "DeepSeek",
  );
  expect(
    screen.queryByRole("button", { name: "补充预设" }),
  ).not.toBeInTheDocument();
  expect(state.discoverDraft).not.toHaveBeenCalled();
  await userEvent.type(
    screen.getByLabelText("API Key", { exact: true }),
    "draft-deepseek-key",
  );
  await userEvent.click(screen.getByRole("button", { name: "获取模型列表" }));
  await userEvent.click(
    await screen.findByRole("checkbox", { name: "导入 draft-chat" }),
  );
  expect(state.discoverDraft).toHaveBeenCalledWith(
    "token",
    expect.objectContaining({
      preset: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "draft-deepseek-key",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "添加所选模型（1）" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await userEvent.click(screen.getByRole("button", { name: "保存提供商" }));
  await waitFor(() =>
    expect(state.createProvider).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        provider: expect.objectContaining({ preset: "deepseek" }),
        models: [
          expect.objectContaining({ apiModel: "draft-chat", enabled: true }),
        ],
      }),
    ),
  );
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

const otherProvider = { ...provider, id: "provider-2", name: "Google" };
it("uses an unsaved custom proxy for connection tests and persists it with the provider", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  const mode = await screen.findByRole("combobox", { name: "代理方式" });
  expect(mode).toHaveTextContent("使用全局代理");
  await user.click(mode);
  await user.click(await screen.findByRole("option", { name: "自定义代理" }));
  await user.type(
    screen.getByLabelText("自定义代理地址"),
    "http://127.0.0.1:10808",
  );
  await user.click(screen.getByRole("button", { name: "测试连通性" }));
  await waitFor(() =>
    expect(state.testConnection).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        providerId: provider.id,
        proxy: { mode: "custom", url: "http://127.0.0.1:10808" },
      }),
    ),
  );
  await user.click(screen.getByRole("button", { name: "保存提供商" }));
  await waitFor(() =>
    expect(state.saveProvider).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        proxy: { mode: "custom", url: "http://127.0.0.1:10808" },
      }),
      provider.id,
    ),
  );
});
it("restores each provider's own proxy setting and allows direct connections", async () => {
  state.fetch.mockResolvedValue({
    providers: [
      { ...provider, proxy: { mode: "custom", url: "http://127.0.0.1:7890" } },
      otherProvider,
    ],
    models: [model],
    presets: [],
  });
  const user = userEvent.setup();
  render(<AdminPage />);
  expect(await screen.findByLabelText("自定义代理地址")).toHaveValue(
    "http://127.0.0.1:7890",
  );
  await user.click(screen.getByRole("button", { name: "Google" }));
  expect(screen.getByRole("combobox", { name: "代理方式" })).toHaveTextContent(
    "使用全局代理",
  );
  expect(screen.queryByLabelText("自定义代理地址")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Agnes AI" }));
  expect(screen.getByLabelText("自定义代理地址")).toHaveValue(
    "http://127.0.0.1:7890",
  );
  await user.click(screen.getByRole("combobox", { name: "代理方式" }));
  await user.click(await screen.findByRole("option", { name: "不使用代理" }));
  expect(
    screen.getByText("直接连接此提供商，忽略全局代理。"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "保存提供商" }));
  await waitFor(() =>
    expect(state.saveProvider).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        proxy: expect.objectContaining({ mode: "direct" }),
      }),
      provider.id,
    ),
  );
});
function providerNames() {
  return within(screen.getByRole("navigation", { name: "模型提供商" }))
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label"));
}
it("persists provider order without changing the selection or unsaved configuration", async () => {
  state.fetch.mockResolvedValue({
    providers: [provider, otherProvider],
    models: [model],
    presets: [],
  });
  const user = userEvent.setup();
  render(<AdminPage />);
  const handle = await screen.findByRole("button", { name: "排序 Agnes AI" });
  await user.clear(screen.getByLabelText("配置名称"));
  await user.type(screen.getByLabelText("配置名称"), "尚未保存的配置");
  handle.focus();
  await user.keyboard("{ArrowUp}");
  expect(state.saveOrder).not.toHaveBeenCalled();
  await user.keyboard("{ArrowDown}");
  await waitFor(() =>
    expect(state.saveOrder).toHaveBeenCalledExactlyOnceWith("token", {
      providerIds: [otherProvider.id, provider.id],
    }),
  );
  expect(providerNames()).toEqual(["Google", "Agnes AI"]);
  expect(screen.getByRole("button", { name: "Agnes AI" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByLabelText("配置名称")).toHaveValue("尚未保存的配置");
  expect(await screen.findByRole("status")).toHaveTextContent(
    "提供商排序已保存",
  );
  expect(state.saveProvider).not.toHaveBeenCalled();
});
it("restores the previous order after a rejected save and allows retry", async () => {
  state.fetch.mockResolvedValue({
    providers: [provider, otherProvider],
    models: [model],
    presets: [],
  });
  state.saveOrder.mockRejectedValueOnce(new Error("排序保存失败，请重试。"));
  const user = userEvent.setup();
  render(<AdminPage />);
  const handle = await screen.findByRole("button", { name: "排序 Agnes AI" });
  handle.focus();
  await user.keyboard("{ArrowDown}");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "排序保存失败，请重试。",
  );
  expect(providerNames()).toEqual(["Agnes AI", "Google"]);
  await user.keyboard("{ArrowDown}");
  await waitFor(() => expect(state.saveOrder).toHaveBeenCalledTimes(2));
  expect(providerNames()).toEqual(["Google", "Agnes AI"]);
});
it("blocks overlapping saves and keeps ordinary provider selection independent of sorting", async () => {
  state.fetch.mockResolvedValue({
    providers: [provider, otherProvider],
    models: [model],
    presets: [],
  });
  let finish!: (value: { ok: true }) => void;
  state.saveOrder.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.click(await screen.findByRole("button", { name: "Google" }));
  expect(state.saveOrder).not.toHaveBeenCalled();
  screen.getByRole("button", { name: "排序 Google" }).focus();
  await user.keyboard("{ArrowUp}{ArrowDown}");
  expect(state.saveOrder).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "排序 Google" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "添加提供商" })).toBeDisabled();
  await act(async () => finish({ ok: true }));
  expect(screen.getByRole("button", { name: "排序 Google" })).toBeEnabled();
  expect(providerNames()).toEqual(["Google", "Agnes AI"]);
});
