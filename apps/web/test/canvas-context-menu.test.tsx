import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasBottomBar } from "../src/components/canvas-bottom-bar";
import { CanvasEmptyHint } from "../src/components/canvas-empty-hint";
import { CanvasToolMenu } from "../src/components/canvas-tool-menu";

vi.mock("../src/lib/server-api", () => ({
  fetchModelPreferences: async () => ({
    preferences: { image: null, video: null },
  }),
  fetchVideoModels: async () => ({
    models: [
      {
        id: "google-official/veo-3.1-generate-preview",
        displayName: "Veo 3.1",
        provider: "google",
        capabilities: {
          textToVideo: true,
          imageToVideo: true,
          lastFrame: true,
          referenceImages: true,
          videoExtension: true,
        },
        limits: { maxResolution: "2160p", allowedDurations: [4, 6, 8] },
      },
    ],
  }),
  fetchImageModels: async () => ({ models: [] }),
  fetchVideoSources: async () => ({ sources: [] }),
}));
vi.mock("../src/hooks/use-generation-error-handler", () => ({
  useGenerationErrorHandler: () => ({ handleGenerationError: () => false }),
}));
vi.mock("@excalidraw/excalidraw", () => ({}));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("native canvas context menu", () => {
  it.each(["image-generator", "video-generator"])(
    "keeps the %s loading contour aligned through zoom, pan, rotation and corner changes",
    (type) => {
      const element = {
        id: "generating",
        type: "rectangle",
        x: 20,
        y: 30,
        width: 400,
        height: 225,
        angle: 0,
        roundness: { type: 3, value: 32 } as {
          type: number;
          value: number;
        } | null,
        customData: { type, status: "generating" },
      };
      let state = {
        selectedElementIds: {},
        scrollX: 0,
        scrollY: 0,
        offsetLeft: 0,
        offsetTop: 0,
        zoom: { value: 1 },
        contextMenu: null,
      };
      let onChange = (_elements: unknown[], _state: unknown) => {};
      const api = {
        getAppState: () => state,
        getSceneElements: () => [element],
        updateScene: vi.fn(),
        onChange: (callback: typeof onChange) => {
          onChange = callback;
          return () => {};
        },
      } as unknown as ExcalidrawImperativeAPI;
      const emitChange = () => act(() => onChange([element], state));
      render(<CanvasToolMenu excalidrawApi={api} accessToken="token" />);
      emitChange();
      const overlay =
        screen.getByText("正在生成…").parentElement?.parentElement;
      expect(overlay).toHaveStyle({
        left: "20px",
        top: "30px",
        width: "400px",
        height: "225px",
      });
      expect(overlay?.style.clipPath).toBe(
        'path("M 32 0 L 368 0 Q 400 0 400 32 L 400 193 Q 400 225 368 225 L 32 225 Q 0 225 0 193 L 0 32 Q 0 0 32 0 Z")',
      );

      state = {
        ...state,
        zoom: { value: 2 },
        scrollX: 10,
        scrollY: -5,
        offsetLeft: 100,
        offsetTop: 40,
      };
      emitChange();
      expect(overlay).toHaveStyle({
        left: "160px",
        top: "90px",
        width: "800px",
        height: "450px",
      });
      expect(overlay?.style.clipPath).toContain('path("M 64 0 L 736 0');

      element.angle = Math.PI / 6;
      element.roundness = { type: 3, value: 16 };
      emitChange();
      expect(overlay).toHaveStyle({ transform: `rotate(${Math.PI / 6}rad)` });
      expect(overlay?.style.clipPath).toContain('path("M 32 0 L 768 0');

      element.width = 80;
      element.height = 40;
      emitChange();
      expect(overlay?.style.clipPath).toContain('path("M 20 0 L 140 0');
      element.roundness = null;
      emitChange();
      expect(overlay?.style.clipPath).toContain('path("M 0 0 L 160 0');
      expect(api.updateScene).not.toHaveBeenCalled();
    },
  );

  it.each(["image-generator", "video-generator"])(
    "keeps %s generation content visible while the native menu opens and closes",
    (type) => {
      const element = {
        id: "generating",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 400,
        height: 225,
        customData: { type, status: "generating", model: "team/test-model" },
      };
      let state = {
        selectedElementIds: {},
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        contextMenu: null as null | {
          items: never[];
          left: number;
          top: number;
        },
      };
      const listeners = new Set<
        (elements: unknown[], state: unknown) => void
      >();
      const api = {
        getAppState: () => state,
        getSceneElements: () => [element],
        updateScene: vi.fn(),
        onChange: (callback: (elements: unknown[], state: unknown) => void) => {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
      } as unknown as ExcalidrawImperativeAPI;
      const emitChange = () => {
        for (const listener of listeners) listener([element], state);
      };
      render(<CanvasToolMenu excalidrawApi={api} accessToken="token" />);
      act(emitChange);
      const status = screen.getByText("正在生成…");
      const model = screen.getByText("Test Model");

      state = { ...state, contextMenu: { items: [], left: 100, top: 100 } };
      act(emitChange);
      expect(status).toBeVisible();
      expect(model).toBeVisible();
      expect(screen.getByText("正在生成…")).toBe(status);

      state = { ...state, contextMenu: null };
      act(emitChange);
      expect(screen.getByText("正在生成…")).toBe(status);
      element.customData.status = "completed";
      act(emitChange);
      expect(screen.queryByText("正在生成…")).not.toBeInTheDocument();
      expect(api.updateScene).not.toHaveBeenCalled();
    },
  );

  it("initializes a different image generator from its own saved settings", async () => {
    const elements = ["first", "second"].map((id, index) => ({
      id,
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      customData: {
        type: "image-generator",
        status: "idle",
        prompt: index === 0 ? "第一个框的提示词" : "",
        model: index === 0 ? "saved-image" : "",
        aspectRatio: index === 0 ? "16:9" : "1:1",
        quality: index === 0 ? "standard" : "hd",
      },
    }));
    const listeners = new Set<(elements: unknown[], state: unknown) => void>();
    let state = {
      selectedElementIds: { first: true } as Record<string, boolean>,
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
      contextMenu: null,
    };
    const api = {
      getAppState: () => state,
      getSceneElements: () => elements,
      updateScene: vi.fn(),
      onChange: (callback: (elements: unknown[], state: unknown) => void) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    } as unknown as ExcalidrawImperativeAPI;
    const emitChange = () => {
      for (const callback of listeners) callback(elements, state);
    };
    render(<CanvasToolMenu excalidrawApi={api} accessToken="token" />);
    act(emitChange);
    const firstPrompt = screen.getByPlaceholderText("今天我们要创作什么");
    expect(firstPrompt).toHaveValue("第一个框的提示词");
    state = { ...state, selectedElementIds: { second: true } };
    act(emitChange);
    expect(screen.getByPlaceholderText("今天我们要创作什么")).toHaveValue("");
    expect(
      screen.getByRole("combobox", { name: "图片比例" }),
    ).toHaveTextContent("1:1");
    expect(
      screen.getByRole("combobox", { name: "图片清晰度" }),
    ).toHaveTextContent("2K");
    await act(async () => {});
  });

  it("immediately hides the empty hint and its shortcut while the menu is open, then restores them", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    let contextMenu: null | { items: never[]; left: number; top: number } =
      null;
    let elements: { isDeleted: boolean }[] = [];
    const listeners = new Set<() => void>();
    const api = {
      getAppState: () => ({ contextMenu }),
      getSceneElements: () => elements,
      onChange: (callback: () => void) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    } as unknown as ExcalidrawImperativeAPI;
    const emitChange = () => {
      for (const listener of listeners) listener();
    };
    const openChat = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <CanvasEmptyHint excalidrawApi={api} onOpenChat={openChat} />
        <textarea aria-label="对话输入" data-chat-input />
      </>,
    );
    expect(screen.getByText("输入你的想法开始创作")).toBeVisible();

    contextMenu = { items: [], left: 100, top: 100 };
    act(emitChange);
    expect(screen.queryByText("输入你的想法开始创作")).not.toBeInTheDocument();
    await user.keyboard("c");
    expect(openChat).not.toHaveBeenCalled();

    contextMenu = null;
    elements = [{ isDeleted: false }];
    act(emitChange);
    expect(screen.queryByText("输入你的想法开始创作")).not.toBeInTheDocument();
    elements = [{ isDeleted: true }];
    act(emitChange);
    expect(screen.getByText("输入你的想法开始创作")).toBeVisible();
    await user.keyboard("c");
    expect(openChat).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveFocus();
  });

  it("respects a menu that was already open when the editor became available and cleans up its subscription", () => {
    let contextMenu: null | { items: never[]; left: number; top: number } = {
      items: [],
      left: 100,
      top: 100,
    };
    const listeners = new Set<() => void>();
    const api = {
      getAppState: () => ({ contextMenu }),
      getSceneElements: () => [],
      onChange: (callback: () => void) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    } as unknown as ExcalidrawImperativeAPI;
    const view = render(
      <CanvasEmptyHint excalidrawApi={null} onOpenChat={vi.fn()} />,
    );
    view.rerender(<CanvasEmptyHint excalidrawApi={api} onOpenChat={vi.fn()} />);
    expect(screen.queryByText("输入你的想法开始创作")).not.toBeInTheDocument();
    contextMenu = null;
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(screen.getByText("输入你的想法开始创作")).toBeVisible();
    view.unmount();
    expect(listeners.size).toBe(0);
  });

  it("hides the video form during the native menu and restores the same prompt and frame afterward", async () => {
    const element = {
      id: "video",
      x: 0,
      y: 0,
      width: 400,
      height: 225,
      customData: {
        type: "video-generator",
        prompt: "",
        model: "google-official/veo-3.1-generate-preview",
        aspectRatio: "16:9",
        duration: 8,
        resolution: "720p",
        status: "idle",
      },
    };
    const listeners = new Set<(elements: unknown[], state: unknown) => void>();
    let state = {
      selectedElementIds: { video: true },
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
      contextMenu: null as null | {
        items: unknown[];
        left: number;
        top: number;
      },
    };
    const api = {
      getAppState: () => state,
      getSceneElements: () => [element],
      updateScene: vi.fn(),
      onChange: (callback: (elements: unknown[], state: unknown) => void) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    };
    const canvasApi = api as unknown as ExcalidrawImperativeAPI;
    const emitChange = () => {
      for (const callback of listeners) callback([element], state);
    };
    render(
      <>
        <CanvasToolMenu excalidrawApi={canvasApi} accessToken="token" />
        <CanvasBottomBar
          excalidrawApi={canvasApi}
          layersOpen={false}
          filesOpen={false}
          leftPanelOpen={false}
          onToggleLayers={vi.fn()}
          onToggleFiles={vi.fn()}
        />
      </>,
    );
    act(emitChange);
    const user = userEvent.setup();
    const prompt = screen.getByPlaceholderText("描述想生成的视频、动作和镜头…");
    await user.type(prompt, "保留这段提示词");
    await user.click(await screen.findByRole("tab", { name: "首尾帧" }));
    await user.click(screen.getByRole("button", { name: "上传首帧" }));
    await user.upload(
      screen.getByLabelText("上传视频参考图片"),
      new File(["image"], "reference.png", { type: "image/png" }),
    );
    await screen.findByRole("button", { name: "移除首帧" });

    state = { ...state, contextMenu: { items: [], left: 100, top: 100 } };
    act(emitChange);
    expect(prompt).not.toBeVisible();
    expect(screen.getByLabelText("缩小")).not.toBeVisible();
    expect(
      screen.queryByRole("button", { name: "选择 (V)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "生成视频" }),
    ).not.toBeInTheDocument();

    state = { ...state, contextMenu: null };
    act(emitChange);
    expect(screen.getByPlaceholderText("描述想生成的视频、动作和镜头…")).toBe(
      prompt,
    );
    expect(prompt).toBeVisible();
    expect(screen.getByLabelText("缩小")).toBeVisible();
    expect(screen.getByRole("button", { name: "选择 (V)" })).toBeVisible();
    expect(prompt).toHaveValue("保留这段提示词");
    expect(screen.getByRole("button", { name: "移除首帧" })).toBeVisible();
  });
});
