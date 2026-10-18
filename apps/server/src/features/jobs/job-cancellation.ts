import type { ExecutorContext } from "./job-executor.js";

export class JobCanceledError extends Error {
  readonly code = "job_canceled";
  constructor() {
    super("任务已取消。");
    this.name = "JobCanceledError";
  }
}

export async function runCancellableJob<T>(
  id: string,
  ctx: ExecutorContext,
  execute: (context: ExecutorContext) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let finished = false;
  let checking = false;
  const check = async () => {
    const status = await ctx.jobService.getJobStatus(id);
    if (!finished && status === "canceled")
      controller.abort(new JobCanceledError());
    controller.signal.throwIfAborted();
  };
  await check();
  const timer = setInterval(() => {
    if (checking) return;
    checking = true;
    void check()
      .catch((error) => {
        if (!controller.signal.aborted)
          console.warn(`[job:${id}] Cancellation check failed:`, error);
      })
      .finally(() => {
        checking = false;
      });
  }, 1_000);
  try {
    const result = await execute({ ...ctx, signal: controller.signal });
    await check();
    return result;
  } catch (error) {
    controller.signal.throwIfAborted();
    throw error;
  } finally {
    finished = true;
    clearInterval(timer);
  }
}
