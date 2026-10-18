import type { BackgroundJobStatus } from "@loomic/shared";
import { afterEach, expect, it, vi } from "vitest";
import { JobCanceledError, runCancellableJob } from "./job-cancellation.js";
import type { ExecutorContext } from "./job-executor.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture(initial: BackgroundJobStatus = "running") {
  let status = initial;
  const getJobStatus = vi.fn(async () => status);
  return {
    ctx: { jobService: { getJobStatus } } as unknown as ExecutorContext,
    getJobStatus,
    cancel: () => {
      status = "canceled";
    },
  };
}

it("never starts a canceled queued task", async () => {
  const fixtureData = fixture("canceled");
  const execute = vi.fn();
  await expect(
    runCancellableJob("job", fixtureData.ctx, execute),
  ).rejects.toBeInstanceOf(JobCanceledError);
  expect(execute).not.toHaveBeenCalled();
});

it("aborts a running executor when the persisted status changes and stops monitoring", async () => {
  vi.useFakeTimers();
  const data = fixture();
  let signal: AbortSignal | undefined;
  const pending = runCancellableJob(
    "job",
    data.ctx,
    async (ctx) =>
      new Promise((_, reject) => {
        signal = ctx.signal;
        signal?.addEventListener("abort", () => reject(signal?.reason), {
          once: true,
        });
      }),
  );
  const assertion = expect(pending).rejects.toBeInstanceOf(JobCanceledError);
  await vi.advanceTimersByTimeAsync(0);
  data.cancel();
  await vi.advanceTimersByTimeAsync(1_000);
  await assertion;
  expect(signal?.aborted).toBe(true);
  const checks = data.getJobStatus.mock.calls.length;
  await vi.advanceTimersByTimeAsync(5_000);
  expect(data.getJobStatus).toHaveBeenCalledTimes(checks);
});

it("discards a result if cancellation won the race just before completion", async () => {
  const data = fixture();
  await expect(
    runCancellableJob("job", data.ctx, async () => {
      data.cancel();
      return { url: "late.mp4" };
    }),
  ).rejects.toBeInstanceOf(JobCanceledError);
});

it("returns completed results and does not keep a timer after success or failure", async () => {
  vi.useFakeTimers();
  const data = fixture();
  await expect(
    runCancellableJob("job", data.ctx, async () => "saved"),
  ).resolves.toBe("saved");
  const error = new Error("provider unavailable");
  await expect(
    runCancellableJob("job", data.ctx, async () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(vi.getTimerCount()).toBe(0);
});
