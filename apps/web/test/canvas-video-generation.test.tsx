import "@testing-library/jest-dom/vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CanvasToolMenu } from "../src/components/canvas-tool-menu";
import {
  type VideoGeneratorData,
  createVideoGeneratorElement,
  updateVideoGeneratorElement,
} from "../src/lib/canvas-video-generator";
import type {
  GenerateVideoResponse,
  VideoModelInfo,
} from "../src/lib/server-api";

const requests = vi.hoisted(() => ({
  generate: vi.fn(),
  error: vi.fn(),
  catalog: vi.fn(),
}));
const google = {
  id: "team/veo",
  displayName: "Veo",
  description: "",
  provider: "google",
  capabilities: {
    textToVideo: true,
    imageToVideo: true,
    videoToVideo: false,
    lastFrame: true,
    referenceImages: true,
    videoExtension: true,
    audio: true,
  },
  limits: {
    maxDuration: 8,
    maxResolution: "2160p",
    maxInputImages: 3,
    allowedDurations: [4, 6, 8],
  },
} satisfies VideoModelInfo;
const agnes: VideoModelInfo = {
  ...google,
  id: "team/agnes",
  displayName: "Agnes Video",
  provider: "agnes",
  isDefault: true,
  capabilities: {
    ...google.capabilities,
    videoExtension: false,
    videoToVideo: true,
  },
  limits: {
    maxDuration: 12,
    maxResolution: "1080p",
    maxInputImages: 8,
    allowedDurations: [4, 6, 8, 12],
  },
};
vi.mock("../src/lib/server-api", () => ({
  fetchVideoModels: requests.catalog,
  fetchVideoSources: async () => ({
    sources: [
      {
        jobId: "source",
        prompt: "原视频",
        url: "http://localhost/source.mp4",
        duration: 8,
        aspectRatio: "9:16",
      },
    ],
  }),
  generateVideoDirect: requests.generate,
}));
vi.mock("../src/hooks/use-generation-error-handler", () => ({
  useGenerationErrorHandler: () => ({ handleGenerationError: requests.error }),
}));
vi.mock("@excalidraw/excalidraw", () => ({
  restoreElements: (elements: Array<Record<string, unknown>>) =>
    elements.map((el) => ({ id: crypto.randomUUID(), version: 1, ...el })),
}));
const output: GenerateVideoResponse = {
  url: "http://localhost/result.mp4",
  assetId: "asset",
  prompt: "云海",
  mimeType: "video/mp4",
  width: 1280,
  height: 720,
  durationSeconds: 8,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  requests.generate.mockReset().mockResolvedValue(output);
  requests.catalog.mockReset().mockResolvedValue({ models: [google, agnes] });
  requests.error.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function canvas(saved: Partial<VideoGeneratorData> = {}) {
  let elements: readonly ExcalidrawElement[] = [];
  let currentId = "";
  let state = {
    width: 1000,
    height: 800,
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
    activeTool: { type: "selection" },
    selectedElementIds: {},
    contextMenu: null,
  } as unknown as AppState;
  const listeners = new Set<
    (elements: readonly ExcalidrawElement[], state: AppState) => void
  >();
  const emit = () => {
    for (const listener of listeners) listener(elements, state);
  };
  const api = {
    getAppState: () => state,
    getSceneElements: () => elements,
    updateScene: (scene: {
      elements?: readonly ExcalidrawElement[];
      appState?: Partial<AppState>;
    }) => {
      if (scene.elements) {
        elements = scene.elements;
        currentId =
          elements.find(
            (el) => !el.isDeleted && el.customData?.type === "video-generator",
          )?.id ?? currentId;
      }
      if (scene.appState) state = { ...state, ...scene.appState };
      emit();
    },
    onChange: (
      listener: (
        elements: readonly ExcalidrawElement[],
        state: AppState,
      ) => void,
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ExcalidrawImperativeAPI;
  const id = createVideoGeneratorElement(api, { duration: 8 });
  updateVideoGeneratorElement(api, id, {
    prompt: "镜头掠过雪山云海",
    ...saved,
  });
  state = { ...state, selectedElementIds: { [id]: true } };
  const view = render(
    <CanvasToolMenu excalidrawApi={api} accessToken="token" />,
  );
  act(emit);
  return {
    api,
    view,
    get id() {
      return currentId;
    },
    element: () => elements.find((el) => el.id === currentId),
    select: (selected: boolean) =>
      act(() =>
        api.updateScene({
          appState: {
            selectedElementIds: selected ? { [currentId]: true } : {},
          },
        }),
      ),
    start: async () => {
      const user = userEvent.setup();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "生成视频" })).toBeEnabled(),
      );
      await user.click(screen.getByRole("button", { name: "生成视频" }));
      return user;
    },
  };
}

it("keeps every parameter and uploaded frame on the result, including after reopening", async () => {
  const frame = { dataUrl: "data:image/png;base64,aGVsbG8=", name: "首帧.png" };
  const fixture = canvas({
    model: google.id,
    inputMode: "frames",
    firstFrame: frame,
    lastFrame: frame,
    resolution: "1080p",
    aspectRatio: "9:16",
    prompt: "完整镜头描述。".repeat(15),
  });
  const originalId = fixture.id;
  await fixture.start();
  await waitFor(() => expect(fixture.element()?.type).toBe("embeddable"));
  expect(fixture.id).not.toBe(originalId);
  expect(fixture.element()).toMatchObject({
    strokeColor: "transparent",
    backgroundColor: "transparent",
  });
  expect(
    fixture.api.getSceneElements().find((el) => el.id === originalId),
  ).toMatchObject({ type: "rectangle", isDeleted: true });
  expect(fixture.api.getAppState().selectedElementIds).toEqual({
    [fixture.id]: true,
  });
  expect(fixture.element()?.customData).toMatchObject({
    type: "video-generator",
    status: "completed",
    inputMode: "frames",
    firstFrame: frame,
    lastFrame: frame,
    model: google.id,
    duration: 8,
    resolution: "1080p",
    aspectRatio: "9:16",
    prompt: "完整镜头描述。".repeat(15),
    isVideo: true,
  });
  fixture.select(false);
  fixture.select(true);
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "首尾帧" })).toHaveAttribute(
      "aria-selected",
      "true",
    ),
  );
  expect(screen.getByAltText("首帧")).toHaveAttribute("src", frame.dataUrl);
  expect(screen.getByAltText("尾帧")).toHaveAttribute("src", frame.dataUrl);
  expect(
    screen.getByPlaceholderText("描述想生成的视频、动作和镜头…"),
  ).toHaveValue("完整镜头描述。".repeat(15));
  expect(screen.getByRole("link", { name: "下载视频" })).toHaveAttribute(
    "href",
    output.url,
  );
});

it("restores Agnes image, audio and video references and sends them again when regenerating", async () => {
  const refs = [
    { dataUrl: "https://media.example.com/ref.png", name: "参考图" },
  ];
  const fixture = canvas({
    model: agnes.id,
    inputMode: "reference",
    referenceImages: refs,
    referenceAudios: ["https://media.example.com/audio.mp3"],
    referenceVideo: "https://media.example.com/source.mp4",
    duration: 6,
    resolution: "1080p",
    aspectRatio: "1:1",
  });
  const user = await fixture.start();
  await waitFor(() => expect(fixture.element()?.type).toBe("embeddable"));
  fixture.select(false);
  fixture.select(true);
  await user.click(await screen.findByText("使用图片链接"));
  expect(screen.getByLabelText("参考图片链接")).toHaveValue(refs[0]?.dataUrl);
  expect(screen.getByLabelText("参考音频链接")).toHaveValue(
    "https://media.example.com/audio.mp3",
  );
  expect(screen.getByLabelText("参考视频链接")).toHaveValue(
    "https://media.example.com/source.mp4",
  );
  await user.click(screen.getByRole("button", { name: "生成视频" }));
  expect(requests.generate.mock.calls[1]?.[2]).toMatchObject({
    referenceImages: [refs[0]?.dataUrl],
    referenceAudios: ["https://media.example.com/audio.mp3"],
    inputVideo: "https://media.example.com/source.mp4",
    aspectRatio: "1:1",
    resolution: "1080p",
    duration: 6,
  });
});

it("keeps extension mode and its source job after reopening", async () => {
  const fixture = canvas({
    model: google.id,
    inputMode: "extend",
    sourceJobId: "source",
    aspectRatio: "9:16",
  });
  await fixture.start();
  await waitFor(() => expect(fixture.element()?.type).toBe("embeddable"));
  fixture.select(false);
  fixture.select(true);
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "视频延长" })).toHaveAttribute(
      "aria-selected",
      "true",
    ),
  );
  expect(screen.getByPlaceholderText("描述接下来发生的画面…")).toHaveValue(
    "镜头掠过雪山云海",
  );
  expect(fixture.element()?.customData).toMatchObject({
    inputMode: "extend",
    sourceJobId: "source",
    resolution: "720p",
    duration: 8,
    aspectRatio: "9:16",
  });
  expect(requests.generate.mock.calls[0]?.[2]).toMatchObject({
    sourceVideoJobId: "source",
    resolution: "720p",
  });
});

it("can stop after reopening and ignores a canceled response while a retry is active", async () => {
  const first = deferred<GenerateVideoResponse>();
  const retry = deferred<GenerateVideoResponse>();
  requests.generate
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(retry.promise);
  const fixture = canvas();
  const user = await fixture.start();
  const signal = requests.generate.mock.calls[0]?.[3] as AbortSignal;
  fixture.select(false);
  expect(signal.aborted).toBe(false);
  fixture.select(true);
  await user.click(screen.getByRole("button", { name: "停止生成视频" }));
  expect(signal.aborted).toBe(true);
  expect(fixture.element()?.customData?.status).toBe("idle");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "生成视频" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "生成视频" }));
  await act(async () => first.resolve(output));
  expect(fixture.element()?.type).toBe("rectangle");
  expect(screen.getByRole("button", { name: "停止生成视频" })).toBeEnabled();
  await act(async () => retry.resolve(output));
  expect(fixture.element()?.type).toBe("embeddable");
  expect(requests.error).not.toHaveBeenCalled();
});

it("preserves the existing clip when a regeneration is stopped", async () => {
  const fixture = canvas();
  const user = await fixture.start();
  await waitFor(() => expect(fixture.element()?.type).toBe("embeddable"));
  const id = fixture.id;
  const pending = deferred<GenerateVideoResponse>();
  requests.generate.mockReturnValueOnce(pending.promise);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "生成视频" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "生成视频" }));
  await user.click(screen.getByRole("button", { name: "停止生成视频" }));
  await act(async () =>
    pending.resolve({ ...output, url: "http://localhost/late.mp4" }),
  );
  expect(fixture.id).toBe(id);
  expect(fixture.element()).toMatchObject({
    type: "embeddable",
    link: output.url,
    customData: { status: "completed" },
  });
});

it("finishes in the background while deselected and cancels when leaving the canvas", async () => {
  const pending = deferred<GenerateVideoResponse>();
  requests.generate.mockReturnValueOnce(pending.promise);
  const fixture = canvas();
  await fixture.start();
  fixture.select(false);
  await act(async () => pending.resolve(output));
  expect(fixture.element()?.type).toBe("embeddable");
  expect(fixture.api.getAppState().selectedElementIds).toEqual({});
  fixture.select(true);
  const retry = deferred<GenerateVideoResponse>();
  requests.generate.mockReturnValueOnce(retry.promise);
  const user = userEvent.setup();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "生成视频" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "生成视频" }));
  const signal = requests.generate.mock.calls[1]?.[3] as AbortSignal;
  fixture.view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    retry.resolve({ ...output, url: "http://localhost/late.mp4" }),
  );
  expect(fixture.element()?.link).toBe(output.url);
});

it("does not silently replace a saved disabled model", async () => {
  const fixture = canvas({ model: "disabled/video" });
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "视频模型" }),
    ).toHaveTextContent("请选择模型"),
  );
  expect(screen.getByRole("button", { name: "生成视频" })).toBeDisabled();
  expect(fixture.element()?.customData?.model).toBe("disabled/video");
});

it("initializes a different generator from its own saved mode and inputs", async () => {
  const frame = { dataUrl: "data:image/png;base64,aGVsbG8=", name: "首帧" };
  const fixture = canvas({
    model: google.id,
    inputMode: "frames",
    firstFrame: frame,
  });
  await waitFor(() => expect(screen.getByAltText("首帧")).toBeInTheDocument());
  act(() => {
    const second = createVideoGeneratorElement(fixture.api, {
      model: agnes.id,
      duration: 6,
    });
    updateVideoGeneratorElement(fixture.api, second, {
      prompt: "第二个视频",
      inputMode: "text",
    });
    fixture.api.updateScene({
      appState: { selectedElementIds: { [second]: true } },
    });
  });
  expect(
    screen.getByPlaceholderText("描述想生成的视频、动作和镜头…"),
  ).toHaveValue("第二个视频");
  expect(screen.queryByAltText("首帧")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "视频模型" }),
    ).toHaveTextContent("Agnes Video"),
  );
});
