import { expect, it } from "vitest";
import { createJobService } from "./job-service.js";

function database(status: string) {
  const row: Record<string, unknown> = {
    id: "job",
    status,
    created_by: "owner",
  };
  const client = {
    from: () => {
      const filters: Array<() => boolean> = [];
      let update: Record<string, unknown> | undefined;
      const result = () => {
        if (!filters.every((matches) => matches()))
          return { data: null, error: null };
        if (update) Object.assign(row, update);
        return { data: { ...row }, error: null };
      };
      const query = {
        update: (values: Record<string, unknown>) => {
          update = values;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters.push(() => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          filters.push(() => values.includes(row[key]));
          return query;
        },
        select: () => query,
        maybeSingle: async () => result(),
        // biome-ignore lint/suspicious/noThenProperty: PostgREST queries are awaitable thenables.
        then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
  const service = createJobService({
    createUserClient: () => client,
    getAdminClient: () => client,
    pgmq: {},
  } as unknown as Parameters<typeof createJobService>[0]);
  return { row, service };
}

it("keeps canceled jobs terminal across late success, failure and retry updates", async () => {
  const { row, service } = database("canceled");
  await service.markRunning("job");
  await service.markSucceeded("job", { url: "late.mp4" });
  await service.markFailed("job", "provider_error", "late failure");
  await service.markDeadLetter("job", "provider_error", "late failure");
  expect(row.status).toBe("canceled");
  expect(row).not.toHaveProperty("result");
});

it("still completes active jobs and starts retryable failed jobs", async () => {
  const { row, service } = database("failed");
  await service.markRunning("job");
  expect(row.status).toBe("running");
  await service.markSucceeded("job", { url: "saved.mp4" });
  expect(row.status).toBe("succeeded");
  await service.markFailed("job", "late", "late");
  expect(row.status).toBe("succeeded");
});

it.each(["queued", "running", "failed"])(
  "only lets the creator cancel an active or retrying job (%s)",
  async (status) => {
    const { row, service } = database(status);
    await expect(
      service.cancelJob(
        { id: "another", accessToken: "token" } as Parameters<
          typeof service.cancelJob
        >[0],
        "job",
      ),
    ).rejects.toMatchObject({ code: "job_not_found" });
    expect(row.status).toBe(status);
    const canceled = await service.cancelJob(
      { id: "owner", accessToken: "token" } as Parameters<
        typeof service.cancelJob
      >[0],
      "job",
    );
    expect(canceled.status).toBe("canceled");
    expect(row.canceled_at).toEqual(expect.any(String));
  },
);
