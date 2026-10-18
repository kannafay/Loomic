import { afterEach, expect, it, vi } from "vitest";
import { AgnesImageProvider } from "./agnes-image.js";
import { GoogleImageProvider } from "./google-image.js";
import { OpenAIImageProvider } from "./openai-image.js";

const calls = vi.hoisted(() => ({ google: vi.fn(), openai: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: calls.google };
  },
}));
vi.mock("openai", () => ({
  default: class {
    images = { generate: calls.openai };
  },
  toFile: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("passes cancellation through the Gemini SDK and preserves the abort reason", async () => {
  const controller = new AbortController();
  calls.google.mockImplementationOnce(
    ({ config }: { config: { abortSignal: AbortSignal } }) =>
      new Promise((_, reject) => {
        config.abortSignal.addEventListener(
          "abort",
          () => reject(config.abortSignal.reason),
          { once: true },
        );
      }),
  );
  const pending = new GoogleImageProvider("test").generate({
    model: "google-official/gemini-3-pro-image-preview",
    prompt: "雪山",
    signal: controller.signal,
  });
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await assertion;
  expect(calls.google.mock.calls[0]?.[0].config.abortSignal).toBe(
    controller.signal,
  );
});

it("combines Agnes timeout and caller cancellation without reporting a timeout for a stopped request", async () => {
  const controller = new AbortController();
  let outgoing: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_, reject) => {
          outgoing = init.signal ?? undefined;
          outgoing?.addEventListener("abort", () => reject(outgoing?.reason), {
            once: true,
          });
        }),
    ),
  );
  const pending = new AgnesImageProvider("test").generate({
    model: "agnes/agnes-image-2.5-flash",
    prompt: "雪山",
    signal: controller.signal,
  });
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(outgoing).toBeDefined());
  controller.abort();
  await assertion;
  expect(outgoing?.aborted).toBe(true);
});

it("passes cancellation as OpenAI request options", async () => {
  const controller = new AbortController();
  calls.openai.mockImplementationOnce(
    (_body: unknown, options: { signal: AbortSignal }) =>
      new Promise((_, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(options.signal.reason),
          { once: true },
        );
      }),
  );
  const pending = new OpenAIImageProvider("test").generate({
    model: "openai-official/gpt-image-2",
    prompt: "雪山",
    signal: controller.signal,
  });
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await assertion;
  expect(calls.openai.mock.calls[0]?.[1]).toEqual({
    signal: controller.signal,
  });
});
