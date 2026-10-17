import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "../src/components/ui/button";
import { ImageModelPreferencePopover } from "../src/components/image-model-preference";

const fetchImageModels = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/server-api", () => ({
  fetchImageModels,
  fetchVideoModels: async () => ({ models: [] }),
}));
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("replaces a previously disabled selection when the user chooses an enabled model", async () => {
  localStorage.setItem(
    "loomic:image-model-preference",
    JSON.stringify({ mode: "manual", models: ["disabled/model"] }),
  );
  fetchImageModels.mockResolvedValue({
    models: [
      { id: "agnes/enabled", displayName: "Agnes 测试模型", description: "" },
    ],
  });
  render(
    <ImageModelPreferencePopover open onOpenChange={() => {}}>
      <Button>生成模型偏好</Button>
    </ImageModelPreferencePopover>,
  );
  await userEvent.click(
    await screen.findByRole("checkbox", { name: "Agnes 测试模型" }),
  );
  expect(
    JSON.parse(localStorage.getItem("loomic:image-model-preference")!),
  ).toEqual({ mode: "manual", models: ["agnes/enabled"] });
});
it("explains when the administrator has not enabled any models", async () => {
  fetchImageModels.mockResolvedValue({ models: [] });
  render(
    <ImageModelPreferencePopover open onOpenChange={() => {}}>
      <Button>生成模型偏好</Button>
    </ImageModelPreferencePopover>,
  );
  expect(
    await screen.findByText("暂无可用模型，请管理员先启用。"),
  ).toBeInTheDocument();
});
