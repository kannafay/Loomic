import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasBottomBar } from "../src/components/canvas-bottom-bar";
import { CanvasEmptyHint } from "../src/components/canvas-empty-hint";
import { CanvasToolMenu } from "../src/components/canvas-tool-menu";

vi.mock("../src/lib/server-api", () => ({
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
