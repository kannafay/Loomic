import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoGeneratorPanel } from "../src/components/canvas/video-generator-panel";
import {
  fetchVideoModels,
  fetchVideoSources,
  generateVideoDirect,
} from "../src/lib/server-api";
import type { VideoModelInfo } from "../src/lib/server-api";

vi.mock("../src/lib/server-api", () => ({
  fetchVideoModels: vi.fn(),
  fetchVideoSources: vi.fn(),
  generateVideoDirect: vi.fn(),
}));
vi.mock("../src/hooks/use-generation-error-handler", () => ({
  useGenerationErrorHandler: () => ({ handleGenerationError: () => false }),
}));
vi.mock("@excalidraw/excalidraw", () => ({
  convertToExcalidrawElements: (elements: unknown[]) => elements,
}));
const model = {
  id: "google-official/veo-3.1-generate-preview",
  displayName: "Veo 3.1",
  description: "",
  provider: "google",
  capabilities: {
    textToVideo: true,
    imageToVideo: true,
    lastFrame: true,
    referenceImages: true,
    videoExtension: true,
    videoToVideo: false,
    audio: true,
  },
  limits: {
    maxDuration: 8,
    allowedDurations: [4, 6, 8],
    maxResolution: "2160p" as const,
    maxInputImages: 3,
  },
};
function panel(modelId = model.id) {
  return render(
    <VideoGeneratorPanel
      elementId="generator"
      elementBounds={{ x: 0, y: 0, width: 400, height: 200 }}
      data={{
        type: "video-generator",
        status: "idle",
        prompt: "镜头缓慢移动",
        model: modelId,
        duration: 4,
        resolution: "720p",
        aspectRatio: "16:9",
      }}
      excalidrawApi={{
        getSceneElements: () => [{ id: "generator", customData: {} }],
        updateScene: vi.fn(),
      }}
      accessToken="token"
      canvasScrollZoom={{ scrollX: 0, scrollY: 0, zoom: 1 }}
      onClose={vi.fn()}
    />,
  );
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
  vi.mocked(fetchVideoModels).mockResolvedValue({ models: [model] });
  vi.mocked(fetchVideoSources).mockResolvedValue({
    sources: [
      {
        jobId: "source",
        prompt: "原视频",
        url: "http://localhost/source.mp4",
        duration: 8,
        aspectRatio: "9:16",
      },
    ],
  });
  vi.mocked(generateVideoDirect).mockResolvedValue({
    url: "http://localhost/result.mp4",
    assetId: "asset",
    prompt: "Motion",
    mimeType: "video/mp4",
    width: 720,
    height: 1280,
    durationSeconds: 8,
  });
});

const agnes: VideoModelInfo = {
  ...model,
  id: "agnes/agnes-video-2.5",
  displayName: "Agnes Video 2.5",
  provider: "agnes",
  capabilities: {
    ...model.capabilities,
    videoExtension: false,
    videoToVideo: true,
  },
  limits: {
    maxDuration: 12,
    allowedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    maxResolution: "1080p",
    maxInputImages: 8,
  },
};

describe("Agnes video modes", () => {
  it("sends eight image URLs plus audio/video references at 6s and 1080p without Veo restrictions", async () => {
    vi.mocked(fetchVideoModels).mockResolvedValue({ models: [agnes] });
    panel(agnes.id);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "素材参考" }));
    const images = Array.from(
      { length: 8 },
      (_, n) => `https://media.example.com/${n}.png`,
    );
    await user.click(screen.getByText("使用图片链接"));
    await user.click(screen.getByLabelText("参考图片链接"));
    await user.paste(images.join("\n"));
    await user.type(
      screen.getByLabelText("参考音频链接"),
      "https://media.example.com/a.mp3",
    );
    await user.type(
      screen.getByLabelText("参考视频链接"),
      "https://media.example.com/v.mp4",
    );
    await user.click(screen.getByRole("button", { name: "16:9 · 4s · 720p" }));
    await user.click(screen.getByRole("combobox", { name: "时长" }));
    await user.click(await screen.findByRole("option", { name: "6 秒" }));
    await user.click(screen.getByRole("combobox", { name: "分辨率" }));
    await user.click(await screen.findByRole("option", { name: "1080p" }));
    await user.click(screen.getByRole("button", { name: "生成视频" }));
    await waitFor(() =>
      expect(generateVideoDirect).toHaveBeenCalledWith(
        "token",
        "镜头缓慢移动",
        expect.objectContaining({
          duration: 6,
          resolution: "1080p",
          referenceImages: images,
          referenceAudios: ["https://media.example.com/a.mp3"],
          inputVideo: "https://media.example.com/v.mp4",
        }),
      ),
    );
  });

  it("submits last-frame-only control without requiring a first frame", async () => {
    vi.mocked(fetchVideoModels).mockResolvedValue({ models: [agnes] });
    panel(agnes.id);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "首尾帧" }));
    await user.click(screen.getByText("使用图片链接"));
    await user.type(
      screen.getByLabelText("尾帧链接"),
      "https://media.example.com/end.png",
    );
    await user.click(screen.getByRole("button", { name: "生成视频" }));
    await waitFor(() => expect(generateVideoDirect).toHaveBeenCalled());
    const options = vi.mocked(generateVideoDirect).mock.calls[0]![2]!;
    expect(options.lastFrame).toBe("https://media.example.com/end.png");
    expect(options).not.toHaveProperty("firstFrame");
  });

  it("shows Flash's five-image limit and rejects excess images before submission", async () => {
    const flash: VideoModelInfo = {
      ...agnes,
      id: "agnes/agnes-video-2.5-flash",
      capabilities: { ...agnes.capabilities!, videoToVideo: false },
      limits: { ...agnes.limits!, maxResolution: "720p", maxInputImages: 5 },
    };
    vi.mocked(fetchVideoModels).mockResolvedValue({ models: [flash] });
    panel(flash.id);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "素材参考" }));
    await user.click(screen.getByText("使用图片链接"));
    expect(
      screen.getByText("参考图片链接（最多 5 张，每行一个）"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("参考视频链接")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("参考图片链接"));
    await user.paste(
      Array.from(
        { length: 6 },
        (_, n) => `https://media.example.com/${n}.png`,
      ).join("\n"),
    );
    await user.click(screen.getByRole("button", { name: "生成视频" }));
    expect(
      await screen.findByText("当前模型最多支持 5 张参考图。"),
    ).toBeInTheDocument();
    expect(generateVideoDirect).not.toHaveBeenCalled();
  });

  it("uploads five local images on Flash without inheriting Veo's three-image/8s limits", async () => {
    const flash: VideoModelInfo = {
      ...agnes,
      id: "agnes/agnes-video-2.5-flash",
      capabilities: { ...agnes.capabilities!, videoToVideo: false },
      limits: { ...agnes.limits!, maxResolution: "720p", maxInputImages: 5 },
    };
    vi.mocked(fetchVideoModels).mockResolvedValue({ models: [flash] });
    panel(flash.id);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "素材参考" }));
    await user.click(screen.getByRole("button", { name: "上传参考图" }));
    await user.upload(
      screen.getByLabelText("上传视频参考图片"),
      [1, 2, 3, 4, 5].map(
        (n) => new File([String(n)], `${n}.png`, { type: "image/png" }),
      ),
    );
    await screen.findByRole("button", { name: "移除参考图 5" });
    expect(
      screen.queryByRole("button", { name: "上传参考图" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成视频" }));
    await waitFor(() => expect(generateVideoDirect).toHaveBeenCalled());
    const options = vi.mocked(generateVideoDirect).mock.calls[0]![2]!;
    expect(options.duration).toBe(4);
    expect(options.referenceImages).toHaveLength(5);
    expect(
      options.referenceImages?.every((value) =>
        value.startsWith("data:image/png;base64,"),
      ),
    ).toBe(true);
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe("video generation modes", () => {
  it("sends both uploaded frames separately", async () => {
    panel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "首尾帧" }));
    expect(screen.getByRole("button", { name: "生成视频" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "上传首帧" }));
    await user.upload(
      screen.getByLabelText("上传视频参考图片"),
      new File(["first"], "first.png", { type: "image/png" }),
    );
    await screen.findByRole("button", { name: "移除首帧" });
    await user.click(screen.getByRole("button", { name: "上传尾帧" }));
    await user.upload(
      screen.getByLabelText("上传视频参考图片"),
      new File(["last"], "last.jpg", { type: "image/jpeg" }),
    );
    await screen.findByRole("button", { name: "移除尾帧" });
    await user.click(screen.getByRole("button", { name: "生成视频" }));
    await waitFor(() =>
      expect(generateVideoDirect).toHaveBeenCalledWith(
        "token",
        "镜头缓慢移动",
        expect.objectContaining({
          firstFrame: expect.stringMatching(/^data:image\/png/),
          lastFrame: expect.stringMatching(/^data:image\/jpeg/),
        }),
      ),
    );
  });
  it("uses references instead of frames and automatically selects 8 seconds", async () => {
    panel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "多图参考" }));
    await user.click(screen.getByRole("button", { name: "上传参考图" }));
    await user.upload(
      screen.getByLabelText("上传视频参考图片"),
      [1, 2, 3].map(
        (n) => new File([String(n)], `${n}.png`, { type: "image/png" }),
      ),
    );
    await screen.findByRole("button", { name: "移除参考图 3" });
    expect(
      screen.queryByRole("button", { name: "上传参考图" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成视频" }));
    await waitFor(() => expect(generateVideoDirect).toHaveBeenCalled());
    const options = vi.mocked(generateVideoDirect).mock.calls[0]![2]!;
    expect(options.duration).toBe(8);
    expect(options.referenceImages).toHaveLength(3);
    expect(options).not.toHaveProperty("firstFrame");
  });
  it("extends a selected source with its portrait aspect ratio at 720p", async () => {
    panel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "视频延长" }));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "选择要延长的视频" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("combobox", { name: "选择要延长的视频" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "原视频 · 8 秒" }),
    );
    await user.click(screen.getByRole("button", { name: "生成视频" }));
    await waitFor(() =>
      expect(generateVideoDirect).toHaveBeenCalledWith(
        "token",
        "镜头缓慢移动",
        expect.objectContaining({
          sourceVideoJobId: "source",
          resolution: "720p",
          aspectRatio: "9:16",
          duration: 8,
        }),
      ),
    );
  });
  it("shows only supported modes when the model is Lite", async () => {
    vi.mocked(fetchVideoModels).mockResolvedValue({
      models: [
        {
          ...model,
          capabilities: {
            ...model.capabilities,
            referenceImages: false,
            videoExtension: false,
          },
        },
      ],
    });
    panel();
    await screen.findByRole("tab", { name: "首尾帧" });
    expect(
      screen.queryByRole("tab", { name: "多图参考" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "视频延长" }),
    ).not.toBeInTheDocument();
  });
});
