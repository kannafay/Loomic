import "@testing-library/jest-dom/vitest";
import type { ExcalidrawImageElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { ImageHoverActions } from "../src/components/canvas/image-hover-actions";

const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
        this.querySelector("button")?.focus();
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
});
afterAll(() => {
  for (const [name, descriptor] of [
    ["showModal", originalShowModal],
    ["close", originalClose],
  ] as const) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

let frame: FrameRequestCallback | undefined;
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frame = undefined;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  frame = undefined;
});

const originalImage = {
  id: "image",
  type: "image",
  x: 40,
  y: 30,
  width: 200,
  height: 100,
  angle: 0,
  opacity: 100,
  isDeleted: false,
  fileId: "file",
  frameId: null,
  customData: { title: "雪山日出", status: "completed" },
} as unknown as ExcalidrawImageElement;
const source = "data:image/webp;base64,aW1hZ2U=";

function fixture() {
  let elements = [originalImage];
  let state = {
    scrollX: 10,
    scrollY: 20,
    zoom: { value: 2 },
    offsetLeft: 100,
    offsetTop: 40,
    contextMenu: null,
    activeTool: { type: "selection" },
    selectedElementIds: {},
  } as unknown as AppState;
  const listeners = new Set<() => void>();
  const api = {
    getSceneElements: () => elements,
    getAppState: () => state,
    getFiles: () => ({ file: { dataURL: source, mimeType: "image/webp" } }),
    updateScene: vi.fn(),
    onChange: (callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  } as unknown as ExcalidrawImperativeAPI;
  const containerRef = createRef<HTMLDivElement>();
  const view = render(
    <>
      <div ref={containerRef}>
        <canvas aria-label="画布" />
      </div>
      <div data-testid="outside">其他区域</div>
      <ImageHoverActions excalidrawApi={api} containerRef={containerRef} />
    </>,
  );
  const container = containerRef.current;
  if (!container) throw new Error("Canvas container was not mounted");
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 40,
    right: 900,
    bottom: 640,
    width: 800,
    height: 600,
    x: 100,
    y: 40,
    toJSON: () => ({}),
  });
  const canvas = screen.getByLabelText("画布");
  const hover = (x = 140, y = 80, target = canvas, buttons = 0) => {
    fireEvent.pointerMove(target, {
      clientX: (x + state.scrollX) * state.zoom.value + state.offsetLeft,
      clientY: (y + state.scrollY) * state.zoom.value + state.offsetTop,
      buttons,
    });
    act(() => {
      const callback = frame;
      frame = undefined;
      callback?.(0);
    });
  };
  const emit = () =>
    act(() => {
      for (const callback of listeners) callback();
    });
  return {
    api,
    hover,
    view,
    listeners,
    emit,
    updateState: (patch: Partial<AppState>) => {
      state = { ...state, ...patch };
      emit();
    },
    setElements: (next: typeof elements) => {
      elements = next;
      emit();
    },
  };
}

it("shows actions at the image's top right and downloads the original format without selecting it", () => {
  const f = fixture();
  expect(
    screen.queryByRole("toolbar", { name: "图片操作" }),
  ).not.toBeInTheDocument();
  f.hover();
  const actions = screen.getByRole("toolbar", { name: "图片操作" });
  expect(actions).toHaveStyle({ left: "532px", top: "148px" });
  const download = within(actions).getByRole("link", { name: "下载图片" });
  expect(download).toHaveAttribute("href", source);
  expect(download).toHaveAttribute("download", "雪山日出.webp");
  f.hover(140, 80, download);
  expect(actions).toBeInTheDocument();
  f.hover(140, 80, screen.getByTestId("outside"));
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  expect(f.api.updateScene).not.toHaveBeenCalled();
});

it("reuses the full image viewer and restores focus after Escape without changing the canvas", async () => {
  const f = fixture();
  f.hover();
  const preview = screen.getByRole("button", { name: "全屏预览图片" });
  await userEvent.click(preview);
  const dialog = await screen.findByRole("dialog", { name: "图片预览" });
  expect(within(dialog).getByRole("img", { name: "雪山日出" })).toHaveAttribute(
    "src",
    source,
  );
  f.hover(140, 80, screen.getByTestId("outside"));
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(preview).toHaveFocus();
  expect(f.api.updateScene).not.toHaveBeenCalled();
});

it("hides actions during dragging, drawing and context menus, and refreshes positions after zooming", () => {
  const f = fixture();
  f.hover();
  f.updateState({ contextMenu: { items: [], top: 100, left: 100 } });
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  f.updateState({ contextMenu: null });
  expect(screen.getByRole("toolbar")).toBeInTheDocument();
  f.hover(140, 80, screen.getByLabelText("画布"), 1);
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  f.hover();
  f.updateState({
    activeTool: { type: "rectangle" } as AppState["activeTool"],
  });
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  f.updateState({
    activeTool: { type: "selection" } as AppState["activeTool"],
    zoom: { value: 1 } as AppState["zoom"],
  });
  f.hover();
  expect(screen.getByRole("toolbar")).toHaveStyle({
    left: "282px",
    top: "98px",
  });
});

it("uses rotated image bounds and ignores pixels outside the rotated image", () => {
  const f = fixture();
  f.setElements([
    { ...originalImage, angle: Math.PI / 2 } as ExcalidrawImageElement,
  ]);
  f.hover();
  expect(screen.getByRole("toolbar")).toHaveStyle({
    left: "432px",
    top: "48px",
  });
  f.hover(210, 80);
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
});

it.each([
  { ...originalImage, isDeleted: true },
  { ...originalImage, opacity: 0 },
  { ...originalImage, customData: { status: "generating" } },
  { ...originalImage, fileId: "missing" },
])("ignores unavailable or hidden image content %#", (element) => {
  const f = fixture();
  f.setElements([element as ExcalidrawImageElement]);
  f.hover();
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
});

it("cleans up its subscription and pending pointer updates on unmount", () => {
  const f = fixture();
  fireEvent.pointerMove(screen.getByLabelText("画布"), {
    clientX: 400,
    clientY: 240,
    buttons: 0,
  });
  expect(frame).toBeDefined();
  f.view.unmount();
  expect(f.listeners.size).toBe(0);
  expect(frame).toBeUndefined();
});
