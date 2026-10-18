import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditableProjectName } from "../src/components/editable-project-name";
import { ToastProvider } from "../src/components/toast";
import { useChatSessions } from "../src/hooks/use-chat-sessions";
import { useGenerationErrorHandler } from "../src/hooks/use-generation-error-handler";

const api = vi.hoisted(() => ({
  update: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  sessions: vi.fn(),
  messages: vi.fn(),
}));
vi.mock("../src/lib/server-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/server-api")>()),
  updateProject: api.update,
  createSession: api.createSession,
  deleteSession: api.deleteSession,
  fetchSessions: api.sessions,
  fetchMessages: api.messages,
}));
beforeEach(() => {
  api.update.mockReset().mockResolvedValue(undefined);
  api.createSession.mockReset();
  api.deleteSession.mockReset();
  api.sessions.mockReset().mockResolvedValue({
    sessions: [
      { id: "session-a", title: "对话 A", updatedAt: "2026-10-17T00:00:00Z" },
      { id: "session-b", title: "对话 B", updatedAt: "2026-10-17T00:00:00Z" },
    ],
  });
  api.messages.mockReset().mockResolvedValue({ messages: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("restores the saved project name on failure and allows retrying the same new name", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  api.update.mockRejectedValueOnce(new Error("save failed"));
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <EditableProjectName
        accessToken="token"
        projectId="project-a"
        initialName="原项目"
      />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "原项目" }));
  const input = screen.getByRole("textbox", { name: "项目名称" });
  await user.clear(input);
  await user.type(input, "新项目{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "项目名称保存失败",
  );
  await user.click(screen.getByRole("button", { name: "原项目" }));
  await user.clear(screen.getByRole("textbox", { name: "项目名称" }));
  await user.type(
    screen.getByRole("textbox", { name: "项目名称" }),
    "新项目{Enter}",
  );
  expect(await screen.findByRole("status")).toHaveTextContent("项目名称已更新");
  expect(api.update).toHaveBeenCalledTimes(2);
});

it("notifies when a new conversation cannot be created", async () => {
  api.createSession.mockRejectedValueOnce(new Error("create failed"));
  const { result } = renderHook(
    () =>
      useChatSessions({
        canvasId: "canvas-a",
        accessToken: "token",
        initialSessionId: "session-a",
      }),
    { wrapper: ToastProvider },
  );
  await waitFor(() => expect(result.current.sessionsLoading).toBe(false));
  await act(async () => result.current.handleNewChat());
  expect(await screen.findByRole("alert")).toHaveTextContent("新建对话失败");
  expect(result.current.activeSessionId).toBe("session-a");
});

it("restores the conversation list and reports a failed background deletion", async () => {
  api.deleteSession.mockRejectedValueOnce(new Error("delete failed"));
  const { result } = renderHook(
    () =>
      useChatSessions({
        canvasId: "canvas-a",
        accessToken: "token",
        initialSessionId: "session-a",
      }),
    { wrapper: ToastProvider },
  );
  await waitFor(() => expect(result.current.sessionsLoading).toBe(false));
  await act(async () => result.current.handleDeleteSession("session-a"));
  expect(await screen.findByRole("alert")).toHaveTextContent("删除对话失败");
  await waitFor(() => expect(result.current.sessions).toHaveLength(2));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("reports generation failures through one shared notification", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { result } = renderHook(() => useGenerationErrorHandler(), {
    wrapper: ToastProvider,
  });
  act(() =>
    result.current.handleGenerationError(
      new Error("provider unavailable"),
      "图片生成失败，请重试。",
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "图片生成失败，请重试。",
  );
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});
