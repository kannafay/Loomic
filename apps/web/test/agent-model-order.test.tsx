import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AgentModelSelector } from "../src/components/agent-model-selector";

const { fetchModels } = vi.hoisted(() => ({ fetchModels: vi.fn() }));
vi.mock("../src/lib/server-api", () => ({ fetchModels }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("preserves server provider and model order, separates identically named configurations and retains selection after refresh", async () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
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
  ).toEqual([
    ["自动（工作空间默认）"],
    ["Agnes Z", "Agnes A"],
    ["Gemini"],
    ["备用模型"],
  ]);
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
  ).toEqual([
    ["自动（工作空间默认）"],
    ["备用模型"],
    ["Gemini"],
    ["Agnes Z", "Agnes A"],
  ]);
  expect(selector).toHaveTextContent("Agnes A");
});
