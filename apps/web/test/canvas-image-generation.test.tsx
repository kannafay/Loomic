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
import { createImageGeneratorElement } from "../src/lib/canvas-image-generator";
import type { GenerateImageResponse } from "../src/lib/server-api";

const requests = vi.hoisted(() => ({
  generate: vi.fn(),
  download: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../src/lib/server-api", () => ({
  fetchImageModels: async () => ({
    models: [
      {
        id: "team/image",
        displayName: "团队图片模型",
        provider: "google",
        isDefault: true,
      },
    ],
  }),
  generateImageDirect: requests.generate,
}));
vi.mock("../src/lib/canvas-elements", async (original) => ({
  ...(await original<typeof import("../src/lib/canvas-elements")>()),
  fetchAsDataURL: requests.download,
}));
vi.mock("../src/hooks/use-generation-error-handler", () => ({
  useGenerationErrorHandler: () => ({ handleGenerationError: requests.error }),
}));
vi.mock("@excalidraw/excalidraw", () => ({}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const result: GenerateImageResponse = {
  url: "https://storage.example.com/snow.png",
  prompt: "雪山日出",
  width: 1024,
  height: 1024,
  mimeType: "image/png",
};

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  requests.generate.mockReset().mockResolvedValue(result);
  requests.download
    .mockReset()
    .mockResolvedValue("data:image/png;base64,aGVsbG8=");
  requests.error.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function canvas() {
  let elements: readonly ExcalidrawElement[] = [];
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
    (els: readonly ExcalidrawElement[], state: AppState) => void
  >();
  let generatorId = "";
  const emit = () => {
    for (const listener of listeners) listener(elements, state);
  };
  const addFiles = vi.fn();
  const api = {
    getAppState: () => state,
    getSceneElements: () => elements,
    addFiles,
    updateScene: (scene: {
      elements?: readonly ExcalidrawElement[];
      appState?: Partial<AppState>;
    }) => {
      if (scene.elements) {
        elements = scene.elements;
        generatorId =
          elements.find(
            (el) => !el.isDeleted && el.customData?.type === "image-generator",
          )?.id ?? generatorId;
      }
      if (scene.appState) state = { ...state, ...scene.appState };
      emit();
    },
    onChange: (
      listener: (els: readonly ExcalidrawElement[], state: AppState) => void,
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ExcalidrawImperativeAPI;
  const id = createImageGeneratorElement(api, { model: "team/image" });
  state = { ...state, selectedElementIds: { [id]: true } };
  const view = render(
    <CanvasToolMenu excalidrawApi={api} accessToken="token" />,
  );
  act(emit);
  return {
    api,
    get id() {
      return generatorId;
    },
    view,
    addFiles,
    image: () => elements.find((el) => el.id === generatorId),
    select: (selected: boolean) =>
      act(() =>
        api.updateScene({
          appState: {
            selectedElementIds: selected ? { [generatorId]: true } : {},
          },
        }),
      ),
    start: async () => {
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: "图片模型" }),
        ).toHaveTextContent("团队图片模型"),
      );
      const user = userEvent.setup();
      await user.type(
        screen.getByPlaceholderText("今天我们要创作什么"),
        "雪山日出",
      );
      await user.click(screen.getByRole("button", { name: "生成图片" }));
      return user;
    },
  };
}

it("keeps the generated image selected and reopens its full editable generation settings", async () => {
  const fixture = canvas();
  const placeholderId = fixture.id;
  const user = await fixture.start();
  await waitFor(() => expect(fixture.image()?.type).toBe("image"));
  expect(fixture.id).not.toBe(placeholderId);
  expect(
    fixture.api.getSceneElements().find((el) => el.id === placeholderId),
  ).toMatchObject({ type: "rectangle", isDeleted: true });
  expect(fixture.api.getAppState().selectedElementIds).toEqual({
    [fixture.id]: true,
  });
  expect(screen.getByPlaceholderText("今天我们要创作什么")).toHaveValue(
    "雪山日出",
  );
  expect(screen.getByRole("button", { name: "生成图片" })).toBeEnabled();
  expect(fixture.image()?.customData).toMatchObject({
    type: "image-generator",
    status: "completed",
    prompt: "雪山日出",
    model: "team/image",
    quality: "hd",
    aspectRatio: "1:1",
    storageUrl: result.url,
  });
  fixture.select(false);
  expect(
    screen.queryByPlaceholderText("今天我们要创作什么"),
  ).not.toBeInTheDocument();
  fixture.select(true);
  const prompt = screen.getByPlaceholderText("今天我们要创作什么");
  expect(prompt).toHaveValue("雪山日出");
  const longPrompt = "连绵雪山和冰川，晨光穿过云海。".repeat(8);
  await user.clear(prompt);
  await user.type(prompt, longPrompt);
  await user.tab();
  fixture.select(false);
  fixture.select(true);
  expect(screen.getByPlaceholderText("今天我们要创作什么")).toHaveValue(
    longPrompt,
  );
});

it("stops a request after reopening the panel and ignores its late result while a retry runs", async () => {
  const first = deferred<GenerateImageResponse>();
  const retry = deferred<GenerateImageResponse>();
  requests.generate
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(retry.promise);
  const fixture = canvas();
  const user = await fixture.start();
  const signal = requests.generate.mock.calls[0]?.[3] as AbortSignal;
  fixture.select(false);
  expect(signal.aborted).toBe(false);
  fixture.select(true);
  await user.click(screen.getByRole("button", { name: "停止生成图片" }));
  expect(signal.aborted).toBe(true);
  expect(fixture.image()?.customData?.status).toBe("idle");
  expect(screen.getByPlaceholderText("今天我们要创作什么")).toHaveValue(
    "雪山日出",
  );
  await user.click(screen.getByRole("button", { name: "生成图片" }));
  await act(async () => first.resolve(result));
  expect(fixture.image()?.type).toBe("rectangle");
  expect(fixture.addFiles).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "停止生成图片" })).toBeEnabled();
  await act(async () => retry.resolve(result));
  expect(fixture.image()?.type).toBe("image");
  expect(requests.error).not.toHaveBeenCalled();
});

it("continues generation while deselected and restores the settings on the completed image", async () => {
  const pending = deferred<GenerateImageResponse>();
  requests.generate.mockReturnValueOnce(pending.promise);
  const fixture = canvas();
  await fixture.start();
  fixture.select(false);
  await act(async () => pending.resolve(result));
  expect(fixture.image()?.type).toBe("image");
  expect(fixture.api.getAppState().selectedElementIds).toEqual({});
  fixture.select(true);
  expect(screen.getByPlaceholderText("今天我们要创作什么")).toHaveValue(
    "雪山日出",
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "生成图片" })).toBeEnabled(),
  );
});

it("preserves the previous image when a regeneration is stopped during download", async () => {
  const fixture = canvas();
  const user = await fixture.start();
  await waitFor(() => expect(fixture.image()?.type).toBe("image"));
  const previous = fixture.image();
  const download = deferred<string>();
  requests.download.mockReturnValueOnce(download.promise);
  await user.click(screen.getByRole("combobox", { name: "图片比例" }));
  await user.click(await screen.findByRole("option", { name: "16:9" }));
  expect(fixture.image()?.height).toBe(previous?.height);
  await user.click(screen.getByRole("button", { name: "生成图片" }));
  await waitFor(() => expect(requests.download).toHaveBeenCalledTimes(2));
  const signal = requests.download.mock.calls[1]?.[1] as AbortSignal;
  await user.click(screen.getByRole("button", { name: "停止生成图片" }));
  expect(signal.aborted).toBe(true);
  await act(async () => download.resolve("data:image/png;base64,bGF0ZQ=="));
  expect(fixture.image()).toMatchObject({
    type: "image",
    fileId: previous?.type === "image" ? previous.fileId : null,
    height: previous?.height,
    customData: { status: "completed", aspectRatio: "16:9" },
  });
  expect(fixture.addFiles).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "生成图片" }));
  await waitFor(() => expect(fixture.addFiles).toHaveBeenCalledTimes(2));
  expect(fixture.image()?.width).toBe(400);
  expect(fixture.image()?.height).toBe(225);
});

it("aborts outstanding requests when leaving the canvas and does not insert a late result", async () => {
  const pending = deferred<GenerateImageResponse>();
  requests.generate.mockReturnValueOnce(pending.promise);
  const fixture = canvas();
  await fixture.start();
  const signal = requests.generate.mock.calls[0]?.[3] as AbortSignal;
  fixture.view.unmount();
  expect(signal.aborted).toBe(true);
  expect(fixture.image()?.customData?.status).toBe("idle");
  await act(async () => pending.resolve(result));
  expect(fixture.addFiles).not.toHaveBeenCalled();
});

it("does not restore an element deleted during generation", async () => {
  const pending = deferred<GenerateImageResponse>();
  requests.generate.mockReturnValueOnce(pending.promise);
  const fixture = canvas();
  await fixture.start();
  act(() =>
    fixture.api.updateScene({
      elements: fixture.api
        .getSceneElements()
        .map((el) => ({ ...el, isDeleted: true })),
    }),
  );
  await act(async () => pending.resolve(result));
  expect(fixture.image()?.isDeleted).toBe(true);
  expect(fixture.addFiles).not.toHaveBeenCalled();
});

it("shows failures without losing the prompt and allows retrying", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  requests.generate.mockRejectedValueOnce(new Error("offline"));
  const fixture = canvas();
  await fixture.start();
  await waitFor(() =>
    expect(fixture.image()?.customData?.status).toBe("error"),
  );
  expect(screen.getByPlaceholderText("今天我们要创作什么")).toHaveValue(
    "雪山日出",
  );
  expect(screen.getByRole("button", { name: "生成图片" })).toBeEnabled();
  expect(requests.error).toHaveBeenCalledOnce();
});
