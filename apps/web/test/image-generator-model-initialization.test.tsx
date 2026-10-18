import "@testing-library/jest-dom/vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageGeneratorPanel } from "../src/components/canvas/image-generator-panel";
import {
  type ImageGeneratorData,
  createImageGeneratorElement,
} from "../src/lib/canvas-image-generator";
import type { ImageModelInfo } from "../src/lib/server-api";

const requests = vi.hoisted(() => ({
  catalog: vi.fn(),
  generate: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../src/lib/server-api", () => ({
  fetchImageModels: requests.catalog,
  generateImageDirect: requests.generate,
}));
vi.mock("../src/hooks/use-generation-error-handler", () => ({
  useGenerationErrorHandler: () => ({ handleGenerationError: requests.error }),
}));

const models: ImageModelInfo[] = [
  {
    id: "configured/google",
    displayName: "Nano Banana 2",
    provider: "google",
    iconUrl: "/providers/google.svg",
    description: "",
  },
  {
    id: "configured/agnes",
    displayName: "团队默认图片模型",
    provider: "agnes",
    iconUrl: "/providers/agnes.ico",
    description: "",
    isDefault: true,
  },
];

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  requests.catalog.mockReset().mockResolvedValue({ models });
  requests.generate.mockReset().mockImplementation(() => new Promise(() => {}));
  requests.error.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function generator(model?: string) {
  let elements: Array<{ id: string; customData: ImageGeneratorData }> = [];
  const updateScene = vi.fn((scene: { elements: typeof elements }) => {
    elements = scene.elements;
  });
  const api = {
    getAppState: () => ({
      width: 800,
      height: 600,
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
    }),
    getSceneElements: () => elements,
    updateScene,
  } as unknown as ExcalidrawImperativeAPI;
  const id = createImageGeneratorElement(
    api,
    model === undefined ? undefined : { model },
  );
  const element = elements.find((candidate) => candidate.id === id);
  if (!element) throw new Error("Generator was not created");
  element.customData.prompt = "雪山日出";
  updateScene.mockClear();
  const view = render(
    <ImageGeneratorPanel
      elementId={id}
      data={element.customData}
      excalidrawApi={api}
      accessToken="token"
      elementBounds={{ x: 0, y: 0, width: 400, height: 400 }}
      canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
      onClose={vi.fn()}
    />,
  );
  return {
    view,
    updateScene,
    saved: () => elements.find((candidate) => candidate.id === id)?.customData,
  };
}

it.each([undefined, "google/nano-banana-2"])(
  "initializes a new or legacy default (%s) with the administrator's model and icon before generation",
  async (initial) => {
    let finish: ((result: { models: ImageModelInfo[] }) => void) | undefined;
    requests.catalog.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const fixture = generator(initial);
    const selector = screen.getByRole("combobox", { name: "图片模型" });
    expect(selector).toHaveTextContent("正在加载模型…");
    expect(screen.getByRole("button", { name: "生成图片" })).toBeDisabled();
    expect(fixture.updateScene).not.toHaveBeenCalled();
    await act(async () => finish?.({ models }));
    expect(selector).toHaveTextContent("团队默认图片模型");
    expect(selector.querySelector("img")).toHaveAttribute(
      "src",
      "/providers/agnes.ico",
    );
    expect(fixture.saved()?.model).toBe("configured/agnes");
    await user.click(screen.getByRole("button", { name: "生成图片" }));
    expect(requests.generate).toHaveBeenCalledExactlyOnceWith(
      "token",
      "雪山日出",
      { model: "configured/agnes", aspectRatio: "1:1", quality: "hd" },
    );
  },
);

it("keeps a saved, available model even when a different default is configured", async () => {
  const fixture = generator("configured/google");
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "图片模型" }),
    ).toHaveTextContent("Nano Banana 2"),
  );
  expect(
    screen.getByRole("combobox", { name: "图片模型" }).querySelector("img"),
  ).toHaveAttribute("src", "/providers/google.svg");
  expect(fixture.updateScene).not.toHaveBeenCalled();
  expect(fixture.saved()?.model).toBe("configured/google");
});

it("does not silently replace a disabled saved model and requires an explicit selection", async () => {
  const user = userEvent.setup();
  const fixture = generator("configured/disabled");
  const selector = screen.getByRole("combobox", { name: "图片模型" });
  await waitFor(() => expect(selector).toHaveTextContent("请选择模型"));
  expect(screen.getByRole("button", { name: "生成图片" })).toBeDisabled();
  expect(fixture.saved()?.model).toBe("configured/disabled");
  expect(fixture.updateScene).not.toHaveBeenCalled();
  await user.click(selector);
  await user.click(
    await screen.findByRole("option", { name: "Nano Banana 2" }),
  );
  expect(selector).toHaveTextContent("Nano Banana 2");
  expect(fixture.saved()?.model).toBe("configured/google");
  expect(screen.getByRole("button", { name: "生成图片" })).toBeEnabled();
});

it("uses an available model when no default is set and keeps generation disabled for an empty catalog", async () => {
  requests.catalog.mockResolvedValueOnce({
    models: [{ ...models[0], isDefault: false }],
  });
  const first = generator();
  await waitFor(() => expect(first.saved()?.model).toBe("configured/google"));
  first.view.unmount();
  requests.catalog.mockResolvedValueOnce({ models: [] });
  const empty = generator();
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "图片模型" }),
    ).toHaveTextContent("暂无可用模型"),
  );
  expect(screen.getByRole("button", { name: "生成图片" })).toBeDisabled();
  expect(empty.saved()?.model).toBe("");
  expect(empty.updateScene).not.toHaveBeenCalled();
});

it("reports catalog failure without persisting a guessed model", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  requests.catalog.mockRejectedValueOnce(new Error("offline"));
  const fixture = generator();
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "图片模型" }),
    ).toHaveTextContent("模型加载失败"),
  );
  expect(screen.getByRole("button", { name: "生成图片" })).toBeDisabled();
  expect(fixture.updateScene).not.toHaveBeenCalled();
  expect(requests.generate).not.toHaveBeenCalled();
});

it("ignores a catalog response after its generator has been closed", async () => {
  let finish: ((result: { models: ImageModelInfo[] }) => void) | undefined;
  requests.catalog.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const fixture = generator();
  fixture.view.unmount();
  await act(async () => finish?.({ models }));
  expect(fixture.updateScene).not.toHaveBeenCalled();
});
