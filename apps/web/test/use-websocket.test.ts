import type { RunCreateRequest, StreamEvent } from "@loomic/shared";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWebSocket } from "../src/hooks/use-websocket";

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn<(data: string) => void>();
  close = vi.fn(() => this.disconnect(1000));

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  disconnect(code: number) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

function latestSocket() {
  const socket = MockWebSocket.instances.at(-1);
  if (!socket) throw new Error("Expected a WebSocket connection");
  return socket;
}

const run: RunCreateRequest = {
  sessionId: "session-1",
  conversationId: "conversation-1",
  canvasId: "canvas-1",
  prompt: "hello",
};
const streamEvent: StreamEvent = {
  type: "message.delta",
  runId: "run-1",
  messageId: "reply-1",
  delta: "Hello from Loomic",
  timestamp: "2026-03-23T12:00:00.000Z",
};

describe("useWebSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubEnv("NEXT_PUBLIC_SERVER_BASE_URL", "https://api.example.com");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    MockWebSocket.instances = [];
    sessionStorage.clear();
    sessionStorage.setItem("ws_connection_id", "connection-1");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });

  it("connects to the configured server with an encoded token and stable tab identity", () => {
    const getToken = () => "token +/=";
    const { result } = renderHook(() => useWebSocket(getToken));

    const url = new URL(latestSocket().url);
    expect(url.origin).toBe("wss://api.example.com");
    expect(url.pathname).toBe("/api/ws");
    expect(url.searchParams.get("token")).toBe("token +/=");
    expect(url.searchParams.get("connectionId")).toBe("connection-1");
    expect(result.current.connected).toBe(false);

    act(() => latestSocket().open());
    expect(result.current.connected).toBe(true);
  });

  it("waits for authentication before opening a connection", async () => {
    let token: string | null = null;
    const getToken = () => token;
    renderHook(() => useWebSocket(getToken));
    expect(MockWebSocket.instances).toHaveLength(0);

    token = "new-token";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(new URL(latestSocket().url).searchParams.get("token")).toBe(
      "new-token",
    );
  });

  it("sends run and cancellation commands and acknowledges a run only once", () => {
    const getToken = () => "token";
    const { result } = renderHook(() => useWebSocket(getToken));
    const socket = latestSocket();
    act(() => socket.open());
    const onAck = vi.fn();

    result.current.startRun(run, onAck);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "command", action: "agent.run", payload: run }),
    );
    const ack = {
      type: "command.ack",
      action: "agent.run",
      payload: { runId: "run-1" },
    };
    act(() => {
      socket.receive(ack);
      socket.receive(ack);
    });
    expect(onAck).toHaveBeenCalledExactlyOnceWith(ack);

    result.current.cancelRun("run-1");
    expect(socket.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: "command",
        action: "agent.cancel",
        payload: { runId: "run-1" },
      }),
    );
  });

  it("does not retain an acknowledgement callback for an unsent command", () => {
    const getToken = () => "token";
    const { result } = renderHook(() => useWebSocket(getToken));
    const onAck = vi.fn();
    result.current.startRun(run, onAck);
    expect(latestSocket().send).not.toHaveBeenCalled();

    act(() => {
      latestSocket().open();
      latestSocket().receive({
        type: "command.ack",
        action: "agent.run",
        payload: { runId: "unrelated" },
      });
    });
    expect(onAck).not.toHaveBeenCalled();
  });

  it("delivers streamed events and removes unsubscribed listeners", () => {
    const getToken = () => "token";
    const { result } = renderHook(() => useWebSocket(getToken));
    const listener = vi.fn();
    const unsubscribe = result.current.onEvent(listener);

    act(() => latestSocket().receive({ type: "event", event: streamEvent }));
    expect(listener).toHaveBeenCalledExactlyOnceWith(streamEvent);

    unsubscribe();
    act(() => latestSocket().receive({ type: "event", event: streamEvent }));
    expect(listener).toHaveBeenCalledOnce();
  });

  it("isolates invalid messages and failing event listeners", () => {
    const getToken = () => "token";
    const { result } = renderHook(() => useWebSocket(getToken));
    const listener = vi.fn();
    result.current.onEvent(() => {
      throw new Error("listener failed");
    });
    result.current.onEvent(listener);

    act(() => {
      latestSocket().onmessage?.({ data: "invalid json" });
      latestSocket().receive({ type: "event", event: null });
      latestSocket().receive({ type: "unknown" });
    });
    expect(listener).not.toHaveBeenCalled();
    act(() => latestSocket().receive({ type: "event", event: streamEvent }));
    expect(listener).toHaveBeenCalledExactlyOnceWith(streamEvent);
  });

  it("resumes a canvas and dispatches its acknowledgement separately from run creation", () => {
    const getToken = () => "token";
    const { result } = renderHook(() => useWebSocket(getToken));
    act(() => latestSocket().open());
    const onRunAck = vi.fn();
    const onResumeAck = vi.fn();
    result.current.startRun(run, onRunAck);
    result.current.resumeCanvas("canvas-1", onResumeAck);
    expect(latestSocket().send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: "command",
        action: "canvas.resume",
        payload: { canvasId: "canvas-1", lastSeq: 0 },
      }),
    );

    const ack = {
      type: "command.ack",
      action: "canvas.resume",
      payload: { activeRunId: "run-1" },
    };
    act(() => latestSocket().receive(ack));
    expect(onResumeAck).toHaveBeenCalledExactlyOnceWith(ack);
    expect(onRunAck).not.toHaveBeenCalled();
  });

  it("reconnects with backoff, a refreshed token, and existing event listeners", async () => {
    let token = "old-token";
    const getToken = () => token;
    const { result } = renderHook(() => useWebSocket(getToken));
    const listener = vi.fn();
    result.current.onEvent(listener);
    act(() => latestSocket().open());
    act(() => latestSocket().disconnect(4001));
    expect(result.current.connected).toBe(false);
    token = "refreshed-token";

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    const retryUrl = new URL(latestSocket().url);
    expect(retryUrl.searchParams.get("token")).toBe("refreshed-token");
    expect(retryUrl.searchParams.get("connectionId")).toBe("connection-1");

    act(() => latestSocket().disconnect(1006));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
    act(() => {
      latestSocket().open();
      latestSocket().receive({ type: "event", event: streamEvent });
    });
    expect(result.current.connected).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(streamEvent);
  });

  it("handles RPC results, handler errors, and unregistered methods", async () => {
    const getToken = () => "token";
    const { result } = renderHook(() => useWebSocket(getToken));
    const socket = latestSocket();
    act(() => socket.open());
    const handler = vi.fn(async (params: Record<string, unknown>) => ({
      url: params.url,
    }));
    const unregister = result.current.registerRPC("screenshot", handler);
    const request = {
      type: "rpc.request",
      id: "rpc-1",
      method: "screenshot",
      params: { url: "https://example.com/image.png" },
    };

    await act(async () => {
      socket.receive(request);
    });
    expect(handler).toHaveBeenCalledWith(request.params);
    expect(socket.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: "rpc.response",
        id: "rpc-1",
        result: request.params,
      }),
    );

    handler.mockRejectedValueOnce(new Error("Capture failed"));
    await act(async () => {
      socket.receive({ ...request, id: "rpc-2" });
    });
    expect(socket.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: "rpc.response",
        id: "rpc-2",
        error: "Capture failed",
      }),
    );

    unregister();
    await act(async () => {
      socket.receive({ ...request, id: "rpc-3" });
    });
    expect(socket.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: "rpc.response",
        id: "rpc-3",
        error: "No handler for method: screenshot",
      }),
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it.each(["connected", "reconnecting", "waiting-token"])(
    "cleans up a %s connection without retrying after unmount",
    async (state) => {
      const getToken = () => (state === "waiting-token" ? null : "token");
      const { unmount } = renderHook(() => useWebSocket(getToken));
      if (state === "connected") act(() => latestSocket().open());
      if (state === "reconnecting") act(() => latestSocket().disconnect(1006));
      const connections = MockWebSocket.instances.length;

      unmount();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(MockWebSocket.instances).toHaveLength(connections);
      if (state === "connected")
        expect(latestSocket().close).toHaveBeenCalledOnce();
    },
  );
});
