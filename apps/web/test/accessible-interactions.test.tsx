import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ChatImage, ImagePill } from "../src/components/chat/image-lightbox";
import { ImageAttachmentBar } from "../src/components/image-attachment-bar";
import { SessionSelector } from "../src/components/session-selector";

const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);

// jsdom omits native dialog methods; browser focus handling is checked separately.
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
        this.querySelector("button")?.focus();
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
});
afterEach(cleanup);
afterAll(() => {
  for (const [name, descriptor] of [
    ["showModal", originalShowModal],
    ["close", originalClose],
  ] as const) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

describe("keyboard interactions", () => {
  it("opens an image preview with Enter and closes it with Escape", async () => {
    const user = userEvent.setup();
    render(
      <ChatImage
        src="https://example.com/sunrise.png"
        alt="雪山日出"
        className="rounded"
      />,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "查看雪山日出" })).toHaveFocus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: "图片预览" });
    expect(dialog).toHaveAttribute("open");
    await user.click(within(dialog).getByRole("img", { name: "雪山日出" }));
    expect(dialog).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "查看雪山日出" })).toHaveFocus();
  });

  it("opens an attachment pill with Space without closing when its zoom control is used", async () => {
    const user = userEvent.setup();
    render(<ImagePill src="https://example.com/reference.png" name="参考图" />);
    await user.tab();
    await user.keyboard(" ");
    const dialog = await screen.findByRole("dialog", { name: "图片预览" });
    await user.click(within(dialog).getByRole("button", { name: "放大 (+)" }));
    expect(within(dialog).getByText("125%")).toBeInTheDocument();
    await user.click(dialog);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps session selection separate from deletion and supports keyboard selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <SessionSelector
        sessions={[
          {
            id: "session-a",
            title: "当前会话",
            updatedAt: "2026-03-24T00:00:00Z",
          },
          {
            id: "session-b",
            title: "另一个会话",
            updatedAt: "2026-03-23T00:00:00Z",
          },
        ]}
        activeSessionId="session-a"
        onSelect={onSelect}
        onDelete={onDelete}
        onNewChat={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "当前会话" }));
    await user.click(screen.getByRole("button", { name: "删除另一个会话" }));
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "取消" }));
    screen.getByRole("button", { name: "另一个会话" }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("session-b");
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("retries a failed attachment using the keyboard", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ImageAttachmentBar
        attachments={[
          {
            id: "attachment-1",
            preview: "",
            uploading: false,
            error: "上传失败",
            source: "upload",
            mimeType: "image/png",
            file: new File(["image"], "reference.png", { type: "image/png" }),
          },
        ]}
        onRemove={vi.fn()}
        onRetry={onRetry}
      />,
    );
    await user.tab();
    expect(
      screen.getByRole("button", { name: "重新上传附件：上传失败" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRetry).toHaveBeenCalledExactlyOnceWith("attachment-1");
  });
});
