import "@testing-library/jest-dom/vitest";
import { type ModelKind, modelPreferencesSchema } from "@loomic/shared";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ModelPreferencesSection } from "../src/components/model-preferences-section";
import { ToastProvider } from "../src/components/toast";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("offers all types, provider groups in server order, an empty type and a persisted automatic option", async () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const onSave = vi.fn();
  const fetchModels = vi.fn(async (kind: ModelKind) => ({
    models:
      kind === "audio"
        ? []
        : [
            {
              id: `${kind}-z`,
              name: `${kind} Z`,
              provider: "Agnes AI",
              providerId: "agnes",
            },
            {
              id: `${kind}-a`,
              name: `${kind} A`,
              provider: "Agnes AI",
              providerId: "agnes",
            },
            {
              id: `${kind}-g`,
              name: `${kind} G`,
              provider: "Google",
              providerId: "google",
            },
          ],
  }));
  render(
    <ToastProvider>
      <ModelPreferencesSection
        preferences={modelPreferencesSchema.parse({ image: "image-g" })}
        onSave={onSave}
        fetchModels={fetchModels}
      />
    </ToastProvider>,
  );
  const user = userEvent.setup();
  const selector = screen.getByRole("combobox", { name: "默认图片模型" });
  await waitFor(() => expect(selector).toBeEnabled());
  expect(screen.getAllByRole("combobox")).toHaveLength(4);
  expect(screen.getByRole("combobox", { name: "默认语音模型" })).toBeDisabled();
  expect(
    screen.getByRole("combobox", { name: "默认对话模型" }),
  ).toHaveTextContent("自动（按列表顺序）");
  expect(screen.getByText("当前自动选择：text Z")).toBeVisible();
  await user.click(selector);
  expect(
    screen.getAllByRole("group").map((group) =>
      within(group)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ),
  ).toEqual([["自动（按列表顺序）"], ["image Z", "image A"], ["image G"]]);
  await user.click(screen.getByRole("option", { name: "自动（按列表顺序）" }));
  await user.click(screen.getByRole("button", { name: "保存偏好" }));
  expect(onSave).toHaveBeenCalledExactlyOnceWith({
    text: null,
    audio: null,
    image: null,
    video: null,
  });
});

it("does not replace an unavailable saved model or persist a guessed choice after a catalog failure", async () => {
  const fetchModels = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ models: [] });
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <ModelPreferencesSection
        preferences={modelPreferencesSchema.parse({ video: "removed" })}
        onSave={onSave}
        fetchModels={fetchModels}
      />
    </ToastProvider>,
  );
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "保存偏好" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "重新加载" }));
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "默认视频模型" }),
    ).toBeEnabled(),
  );
  expect(
    screen.getByRole("combobox", { name: "默认视频模型" }),
  ).toHaveTextContent("所选模型不可用");
  expect(onSave).not.toHaveBeenCalled();
});
