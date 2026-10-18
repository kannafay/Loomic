import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AgentSection } from "../src/components/agent-section";
import { ProfileSection } from "../src/components/profile-section";
import { ToastProvider, useToast } from "../src/components/toast";

afterEach(cleanup);

function Notifications() {
  const { success, error } = useToast();
  return (
    <>
      <button type="button" onClick={() => success("操作已完成。")}>
        成功
      </button>
      <button type="button" onClick={() => error("操作失败，请重试。")}>
        失败
      </button>
    </>
  );
}

it("announces success as a temporary notification and removes it automatically", async () => {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <Notifications />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "成功" }));
  expect(await screen.findByRole("status")).toHaveTextContent("操作已完成");
  await waitFor(
    () => expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    { timeout: 4500 },
  );
});

it("announces errors and allows dismissing a notification with the keyboard", async () => {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <Notifications />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "失败" }));
  const notification = await screen.findByRole("alert");
  expect(notification).toHaveTextContent("操作失败");
  const close = within(notification).getByRole("button", { name: "关闭通知" });
  await user.tab();
  expect(close).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});

it("shows profile save success in the shared toast", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <ProfileSection
        displayName="原名称"
        email="member@example.test"
        onSave={onSave}
      />
    </ToastProvider>,
  );
  await user.clear(screen.getByLabelText("显示名称"));
  await user.type(screen.getByLabelText("显示名称"), "新名称");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledExactlyOnceWith("新名称");
  const notification = await screen.findByRole("status");
  expect(notification).toHaveAttribute("data-slot", "toast");
  expect(notification).toHaveTextContent("个人资料已更新");
});

it("keeps the agent model draft after a failed save and notifies again on retry", async () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error("save failed"))
    .mockResolvedValue(undefined);
  const user = userEvent.setup();
  try {
    render(
      <ToastProvider>
        <AgentSection
          defaultModel="model-a"
          fetchModels={vi.fn().mockResolvedValue({
            models: [
              { id: "model-a", name: "模型 A", provider: "测试提供商" },
              { id: "model-b", name: "模型 B", provider: "测试提供商" },
            ],
          })}
          onSave={onSave}
        />
      </ToastProvider>,
    );
    await user.click(await screen.findByRole("combobox", { name: "默认模型" }));
    await user.click(
      await screen.findByRole("option", { name: "模型 B (测试提供商)" }),
    );
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("设置更新失败");
    expect(
      screen.getByRole("combobox", { name: "默认模型" }),
    ).toHaveTextContent("模型 B");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "助手设置已更新",
    );
    expect(onSave).toHaveBeenLastCalledWith("model-b");
  } finally {
    vi.unstubAllGlobals();
  }
});
