import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useChatRuns } from "../src/hooks/use-chat-runs";

afterEach(cleanup);

it("finishing a different or stale run does not clear the visible run", () => {
  const { result } = renderHook(() => useChatRuns(vi.fn()));
  let oldRun: NonNullable<ReturnType<typeof result.current.startRun>>;
  act(() => {
    const started = result.current.startRun("first");
    if (!started) throw new Error("Expected a new run");
    oldRun = started;
  });
  act(() => {
    result.current.startRun("second");
    result.current.resumeRun("first", "resumed");
  });
  act(() => {
    result.current.finishRun(oldRun);
  });
  expect(Object.keys(result.current.runs)).toEqual(["first", "second"]);
});

it("resends a pending stop when its run is restored after reconnecting", () => {
  const cancelRun = vi.fn();
  const { result } = renderHook(() => useChatRuns(cancelRun));
  act(() => {
    result.current.startRun("session");
  });
  act(() => {
    result.current.stopRun("session");
  });
  expect(cancelRun).not.toHaveBeenCalled();
  act(() => {
    result.current.resumeRun("session", "run-resumed");
  });
  expect(cancelRun).toHaveBeenCalledExactlyOnceWith("run-resumed");
  expect(result.current.runs.session?.stopping).toBe(true);
});
