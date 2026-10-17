// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamEvent } from "@loomic/shared";
import { ChatSidebar } from "../src/components/chat-sidebar";
import type { WebSocketHandle } from "../src/hooks/use-websocket";

const {
  createSessionMock,
  deleteSessionMock,
  fetchMessagesMock,
  fetchSessionsMock,
  fetchBrandKitMock,
  fetchWorkspaceSkillsMock,
  saveMessageMock,
  updateSessionTitleMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  fetchMessagesMock: vi.fn(),
  fetchSessionsMock: vi.fn(),
  fetchBrandKitMock: vi.fn(),
  fetchWorkspaceSkillsMock: vi.fn(),
  saveMessageMock: vi.fn(),
  updateSessionTitleMock: vi.fn(),
}));

vi.mock("../src/lib/server-api", () => ({
  createSession: createSessionMock,
  deleteSession: deleteSessionMock,
  fetchMessages: fetchMessagesMock,
  fetchSessions: fetchSessionsMock,
  saveMessage: saveMessageMock,
  updateSessionTitle: updateSessionTitleMock,
  fetchImageModels: vi.fn(async () => ({ models: [] })),
  fetchWorkspaceSkills: fetchWorkspaceSkillsMock,
}));

vi.mock("../src/lib/brand-kit-api", () => ({
  fetchBrandKit: fetchBrandKitMock,
}));

vi.mock("../src/hooks/use-breakpoint", () => ({
  useBreakpoint: () => "desktop",
}));
vi.mock("../src/components/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("../src/components/agent-model-selector", () => ({
  AgentModelSelector: () => null,
}));
vi.mock("../src/components/image-model-preference", () => ({
  ImageModelPreferencePopover: () => null,
}));
vi.mock("../src/components/chat-skills", () => ({ ChatSkills: () => null }));

function createMockWs(
  listeners: Set<(event: StreamEvent) => void>,
): WebSocketHandle {
  return {
    connected: true,
    startRun: vi.fn((payload, onAck) => {
      // Simulate server ack
      onAck?.({
        type: "command.ack",
        action: "agent.run",
        payload: { runId: "run_123" },
      });
    }),
    cancelRun: vi.fn(),
    onEvent: vi.fn((cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    }),
    registerRPC: vi.fn(() => () => {}),
    resumeCanvas: vi.fn((_canvasId, onAck) =>
      onAck?.({
        type: "command.ack",
        action: "canvas.resume",
        payload: { activeRunId: null },
      }),
    ),
  };
}

describe("ChatSidebar", () => {
  let mockWs: WebSocketHandle;
  let listeners: Set<(event: StreamEvent) => void>;

  async function emit(event: StreamEvent) {
    await act(async () => {
      for (const cb of listeners) cb(event);
    });
  }

  function renderSidebar(currentBrandKitId: string | null = null) {
    return render(
      <ChatSidebar
        accessToken="token_abc"
        canvasId="canvas-1"
        open
        onToggle={() => {}}
        ws={mockWs}
        currentBrandKitId={currentBrandKitId}
      />,
    );
  }

  async function sendMessage() {
    const input = await screen.findByPlaceholderText(
      "描述你的想法，或输入“@”引用内容",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "发送消息" }),
      ).toBeInTheDocument(),
    );
    await userEvent.type(input, "hello loom{Enter}");
    await screen.findByRole("button", { name: "停止生成" });
    return input;
  }

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    listeners = new Set();
    mockWs = createMockWs(listeners);
    fetchBrandKitMock.mockReset();
    fetchWorkspaceSkillsMock.mockReset();
    fetchWorkspaceSkillsMock.mockResolvedValue({ skills: [] });
    createSessionMock.mockReset();
    createSessionMock.mockResolvedValue({
      session: {
        id: "session-created",
        title: "New Chat",
        updatedAt: "2026-03-24T00:00:00.000Z",
      },
    });
    deleteSessionMock.mockReset();
    fetchMessagesMock.mockReset();
    fetchMessagesMock.mockResolvedValue({ messages: [] });
    fetchSessionsMock.mockReset();
    fetchSessionsMock.mockResolvedValue({
      sessions: [
        {
          id: "session-real",
          title: "Existing Chat",
          updatedAt: "2026-03-24T00:00:00.000Z",
        },
      ],
    });
    saveMessageMock.mockReset();
    saveMessageMock.mockResolvedValue(undefined);
    updateSessionTitleMock.mockReset();
    updateSessionTitleMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("starts runs via WebSocket with the active real session id", async () => {
    render(
      <ChatSidebar
        accessToken="token_abc"
        canvasId="canvas-1"
        open
        onToggle={() => {}}
        ws={mockWs}
      />,
    );

    await sendMessage();

    await waitFor(() =>
      expect(mockWs.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-real",
          conversationId: "canvas-1",
          prompt: "hello loom",
          canvasId: "canvas-1",
        }),
        expect.any(Function),
      ),
    );
    expect(mockWs.startRun).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-canvas-1",
      }),
      expect.anything(),
    );
  });

  it("cancels the current run and retains its partial reply", async () => {
    renderSidebar();
    await sendMessage();
    await emit({
      type: "message.delta",
      runId: "run_123",
      messageId: "reply_123",
      delta: "已经输出的内容",
      timestamp: new Date().toISOString(),
    });
    await userEvent.click(screen.getByRole("button", { name: "停止生成" }));
    expect(mockWs.cancelRun).toHaveBeenCalledExactlyOnceWith("run_123");
    expect(screen.getByRole("button", { name: "正在停止" })).toBeDisabled();
    await emit({
      type: "run.canceled",
      runId: "run_123",
      timestamp: new Date().toISOString(),
    });
    expect(
      screen.getByRole("button", { name: "发送消息" }),
    ).toBeInTheDocument();
    expect(screen.getByText("已经输出的内容")).toBeInTheDocument();
    expect(
      screen.queryByText("获取回复失败，请重试。"),
    ).not.toBeInTheDocument();
  });

  it("preserves a skill mention and its slug when saving and starting a run", async () => {
    fetchWorkspaceSkillsMock.mockResolvedValue({
      skills: [
        {
          id: "skill-1",
          name: "分镜设计",
          slug: "storyboard",
          description: "规划分镜",
          enabled: true,
        },
      ],
    });
    renderSidebar();
    const input = await screen.findByPlaceholderText(
      "描述你的想法，或输入“@”引用内容",
    );
    await userEvent.type(input, "@");
    await userEvent.click(
      await screen.findByRole("button", { name: /分镜设计.*规划分镜/ }),
    );
    await userEvent.type(input, "帮我设计分镜{Enter}");

    const mention = {
      mentionType: "skill",
      id: "skill-1",
      label: "分镜设计",
      slug: "storyboard",
    };
    await waitFor(() =>
      expect(mockWs.startRun).toHaveBeenCalledWith(
        expect.objectContaining({ mentions: [mention] }),
        expect.any(Function),
      ),
    );
    expect(saveMessageMock).toHaveBeenCalledWith(
      "token_abc",
      "session-real",
      expect.objectContaining({
        role: "user",
        contentBlocks: expect.arrayContaining([
          { type: "mention", ...mention },
        ]),
      }),
    );
    await emit({
      type: "run.completed",
      runId: "run_123",
      timestamp: new Date().toISOString(),
    });
  });

  it("accepts brand assets with nullable content and file URL without losing their type", async () => {
    fetchBrandKitMock.mockResolvedValue({
      assets: [
        {
          id: "asset-1",
          display_name: "品牌标志",
          asset_type: "logo",
          text_content: null,
          file_url: null,
        },
      ],
    });
    renderSidebar("kit-1");
    const input = await screen.findByPlaceholderText(
      "描述你的想法，或输入“@”引用内容",
    );
    await userEvent.type(input, "@");
    await userEvent.click(
      await screen.findByRole("button", { name: /品牌标志.*logo/ }),
    );
    await userEvent.type(input, "使用这个素材{Enter}");

    const mention = {
      mentionType: "brand-kit-asset",
      id: "asset-1",
      label: "品牌标志",
      assetType: "logo",
      textContent: null,
      fileUrl: null,
    };
    await waitFor(() =>
      expect(mockWs.startRun).toHaveBeenCalledWith(
        expect.objectContaining({ mentions: [mention] }),
        expect.any(Function),
      ),
    );
    expect(saveMessageMock).toHaveBeenCalledWith(
      "token_abc",
      "session-real",
      expect.objectContaining({
        role: "user",
        contentBlocks: expect.arrayContaining([
          { type: "mention", ...mention },
        ]),
      }),
    );
    await emit({
      type: "run.completed",
      runId: "run_123",
      timestamp: new Date().toISOString(),
    });
  });

  it("queues a stop clicked before the server acknowledges the run", async () => {
    vi.mocked(mockWs.startRun).mockImplementation(() => {});
    renderSidebar();
    await sendMessage();
    await userEvent.click(screen.getByRole("button", { name: "停止生成" }));
    expect(mockWs.cancelRun).not.toHaveBeenCalled();
    await act(async () => {
      vi.mocked(mockWs.startRun).mock.calls[0]?.[1]?.({
        type: "command.ack",
        action: "agent.run",
        payload: { runId: "run_late" },
      });
    });
    expect(mockWs.cancelRun).toHaveBeenCalledExactlyOnceWith("run_late");
    await emit({
      type: "run.canceled",
      runId: "run_late",
      timestamp: new Date().toISOString(),
    });
    expect(screen.getByText("已停止生成。")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "发送消息" }),
    ).toBeInTheDocument();
  });

  it("can stop a run restored after reconnecting", async () => {
    vi.mocked(mockWs.resumeCanvas).mockImplementation((_id, onAck) =>
      onAck?.({
        type: "command.ack",
        action: "canvas.resume",
        payload: { activeRunId: "run_resumed" },
      }),
    );
    renderSidebar();
    await userEvent.click(
      await screen.findByRole("button", { name: "停止生成" }),
    );
    expect(mockWs.cancelRun).toHaveBeenCalledExactlyOnceWith("run_resumed");
    await emit({
      type: "run.canceled",
      runId: "run_resumed",
      timestamp: new Date().toISOString(),
    });
    expect(
      screen.getByRole("button", { name: "发送消息" }),
    ).toBeInTheDocument();
  });

  it("keeps the stop control associated with its session when switching chats", async () => {
    fetchSessionsMock.mockResolvedValue({
      sessions: [
        {
          id: "session-real",
          title: "Existing Chat",
          updatedAt: "2026-03-24T00:00:00.000Z",
        },
        {
          id: "session-other",
          title: "Other Chat",
          updatedAt: "2026-03-23T00:00:00.000Z",
        },
      ],
    });
    renderSidebar();
    await sendMessage();
    await userEvent.click(screen.getByRole("button", { name: "hello loom" }));
    await userEvent.click(screen.getByText("Other Chat"));
    expect(
      screen.queryByRole("button", { name: "停止生成" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Other Chat" }));
    await userEvent.click(screen.getByText("hello loom"));
    await userEvent.click(
      await screen.findByRole("button", { name: "停止生成" }),
    );
    expect(mockWs.cancelRun).toHaveBeenCalledExactlyOnceWith("run_123");
    await emit({
      type: "run.canceled",
      runId: "run_123",
      timestamp: new Date().toISOString(),
    });
  });
});
