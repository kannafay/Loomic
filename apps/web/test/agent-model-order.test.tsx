import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentModelSelector } from "../src/components/agent-model-selector";
import { HomePrompt } from "../src/components/home-prompt";

const { fetchModels, fetchModelPreferences, auth } = vi.hoisted(() => ({
  fetchModels: vi.fn(),
  fetchModelPreferences: vi.fn(),
  auth: { session: { access_token: "token" }, loading: false },
}));
vi.mock("../src/lib/server-api", () => ({
  fetchModels,
  fetchModelPreferences,
}));
vi.mock("../src/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("../src/components/image-model-preference", () => ({
  ImageModelPreferencePopover: () => null,
}));

const models = [
  {
    id: "first",
    name: "第一个模型",
    provider: "Agnes AI",
    providerId: "agnes",
  },
  {
    id: "preferred",
    name: "偏好模型",
    provider: "Google",
    providerId: "google",
  },
];

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  fetchModels.mockReset().mockResolvedValue({ models });
  fetchModelPreferences
    .mockReset()
    .mockResolvedValue({ preferences: { text: null } });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("preserves server provider and model order, separates identically named configurations and retains selection after refresh", async () => {
  const models = [
    {
      id: "agnes-z",
      name: "Agnes Z",
      provider: "Agnes AI",
      providerId: "team",
    },
    {
      id: "agnes-a",
      name: "Agnes A",
      provider: "Agnes AI",
      providerId: "team",
    },
    { id: "google", name: "Gemini", provider: "Google", providerId: "google" },
    {
      id: "backup",
      name: "备用模型",
      provider: "Agnes AI",
      providerId: "backup",
    },
  ];
  fetchModels.mockResolvedValue({ models });
  localStorage.setItem("loomic:agent-model", "google");
  const user = userEvent.setup();
  render(<AgentModelSelector />);
  const selector = await screen.findByRole("combobox", { name: "对话模型" });
  await user.click(selector);
  await screen.findByRole("option", { name: "Agnes Z" });
  expect(
    screen.getAllByRole("group").map((group) =>
      within(group)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ),
  ).toEqual([["Agnes Z", "Agnes A"], ["Gemini"], ["备用模型"]]);
  expect(screen.getAllByRole("group", { name: "Agnes AI" })).toHaveLength(2);
  await user.click(screen.getByRole("option", { name: "Agnes A" }));
  expect(localStorage.getItem("loomic:agent-model")).toBe("agnes-a");
  fetchModels.mockResolvedValue({
    models: [models[3], models[2], models[0], models[1]],
  });
  await user.click(selector);
  await screen.findByRole("option", { name: "备用模型" });
  expect(
    screen.getAllByRole("group").map((group) =>
      within(group)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ),
  ).toEqual([["备用模型"], ["Gemini"], ["Agnes Z", "Agnes A"]]);
  expect(selector).toHaveTextContent("Agnes A");
});

it.each([
  [null, null, "first", "第一个模型"],
  [null, "preferred", "preferred", "偏好模型"],
  ["removed", "preferred", "preferred", "偏好模型"],
  ["removed", "missing-preference", "first", "第一个模型"],
])(
  "selects a concrete available model for stored %s and preference %s",
  async (stored, preference, expectedId, expectedName) => {
    if (stored) localStorage.setItem("loomic:agent-model", stored);
    fetchModelPreferences.mockResolvedValue({
      preferences: { text: preference },
    });
    render(<AgentModelSelector />);
    const selector = screen.getByRole("combobox", { name: "对话模型" });
    await waitFor(() => expect(selector).toHaveTextContent(expectedName));
    expect(localStorage.getItem("loomic:agent-model")).toBe(expectedId);
    await userEvent.click(selector);
    expect(
      screen.queryByRole("option", { name: /自动/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: expectedName })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
);

it("waits for personal preferences and submits the displayed concrete model from home", async () => {
  let resolvePreferences!: (value: { preferences: { text: string } }) => void;
  fetchModelPreferences.mockReturnValue(
    new Promise((resolve) => {
      resolvePreferences = resolve;
    }),
  );
  const onSubmit = vi.fn();
  render(<HomePrompt onSubmit={onSubmit} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), "设计一张海报{Enter}");
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  expect(localStorage.getItem("loomic:agent-model")).toBeNull();

  await act(async () =>
    resolvePreferences({ preferences: { text: "preferred" } }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "对话模型" }),
    ).toHaveTextContent("偏好模型"),
  );
  await user.click(screen.getByRole("button", { name: "发送" }));
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
    "设计一张海报",
    undefined,
    undefined,
    undefined,
    "preferred",
  );
});

it("clears an unavailable selection and blocks sending when the catalog is empty", async () => {
  localStorage.setItem("loomic:agent-model", "removed");
  fetchModels.mockResolvedValue({ models: [] });
  const onSubmit = vi.fn();
  render(<HomePrompt onSubmit={onSubmit} />);
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "对话模型" }),
    ).toHaveTextContent("暂无可用模型"),
  );
  await userEvent.type(screen.getByRole("textbox"), "草稿{Enter}");
  expect(localStorage.getItem("loomic:agent-model")).toBeNull();
  expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  expect(onSubmit).not.toHaveBeenCalled();
});
