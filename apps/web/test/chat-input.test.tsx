import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatInput } from "../src/components/chat-input";

vi.mock("../src/components/agent-model-selector", () => ({
  AgentModelSelector: () => null,
}));
vi.mock("../src/components/image-model-preference", () => ({
  ImageModelPreferencePopover: () => null,
}));
beforeEach(() => localStorage.setItem("loomic:agent-model", "chat-model"));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("blocks sending until a concrete conversation model is selected", async () => {
  localStorage.clear();
  const onSend = vi.fn();
  render(<ChatInput onSend={onSend} />);
  await userEvent.type(screen.getByRole("textbox"), "待发送消息{Enter}");
  expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  expect(onSend).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveValue("待发送消息");
});

it("allows stopping with an empty draft even while sending or uploads are disabled", async () => {
  const onSend = vi.fn();
  const onStop = vi.fn();
  render(
    <ChatInput
      onSend={onSend}
      onStop={onStop}
      isStreaming
      disabled
      isUploading
    />,
  );
  const stop = screen.getByRole("button", { name: "停止生成" });
  expect(stop).toBeEnabled();
  await userEvent.click(stop);
  expect(onStop).toHaveBeenCalledOnce();
  expect(onSend).not.toHaveBeenCalled();
});

it("retains the next draft when stopping and blocks Enter until the current run ends", async () => {
  const onSend = vi.fn();
  const onStop = vi.fn();
  const { rerender } = render(
    <ChatInput onSend={onSend} onStop={onStop} isStreaming />,
  );
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "下一条消息{Enter}");
  expect(onSend).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "停止生成" }));
  expect(input).toHaveValue("下一条消息");
  rerender(<ChatInput onSend={onSend} onStop={onStop} />);
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  expect(onSend).toHaveBeenCalledExactlyOnceWith("下一条消息");
  expect(input).toHaveValue("");
});
