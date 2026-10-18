import { afterEach, expect, it, vi } from "vitest";
import { AgnesVideoProvider } from "./agnes-video.js";
import { GoogleVideoProvider } from "./google-video.js";
import { METASO_VIDEO_MODEL_ID, MetasoVideoProvider } from "./metaso-video.js";

const calls = vi.hoisted(() => ({ google: vi.fn() }));
vi.mock("@google/genai", async (original) => ({
  ...(await original<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateVideos: calls.google };
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });

it("aborts Gemini creation and its polling wait through the SDK signal", async () => {
  const controller = new AbortController();
  calls.google.mockResolvedValueOnce({ done: false, name: "operation" });
  const pending = new GoogleVideoProvider("test").generate({
    model: "google-official/veo-3.1-generate-preview",
    prompt: "云海",
    duration: 8,
    signal: controller.signal,
  });
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(calls.google).toHaveBeenCalledOnce());
  expect(calls.google.mock.calls[0]?.[0].config.abortSignal).toBe(
    controller.signal,
  );
  controller.abort();
  await assertion;
});

it("stops Agnes polling and backoff without creating another paid task", async () => {
  const controller = new AbortController();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({ video_id: "task" }))
    .mockResolvedValue(json({ status: "pending" }));
  vi.stubGlobal("fetch", fetch);
  const pending = new AgnesVideoProvider("test").generate({
    model: "agnes/agnes-video-2.5",
    prompt: "云海",
    duration: 8,
    signal: controller.signal,
  });
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  controller.abort();
  await assertion;
  expect(
    fetch.mock.calls.filter(([, init]) => init.method === "POST"),
  ).toHaveLength(1);
});

it("stops the Metaso polling wait immediately when canceled", async () => {
  const controller = new AbortController();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({ task_id: "task" }))
    .mockResolvedValue(json({ task: { status: "running" } }));
  const provider = new MetasoVideoProvider("test", undefined, {
    fetch: fetch as typeof globalThis.fetch,
  });
  const pending = provider.generate({
    model: METASO_VIDEO_MODEL_ID,
    prompt: "云海",
    signal: controller.signal,
  });
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  controller.abort();
  await assertion;
  expect(fetch).toHaveBeenCalledTimes(2);
});
