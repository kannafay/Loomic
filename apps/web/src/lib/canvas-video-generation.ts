import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  type VideoGeneratorData,
  getDisplayDimensions,
  isVideoGeneratorElement,
  updateVideoGeneratorElement,
} from "./canvas-video-generator";
import { generateVideoDirect } from "./server-api";

const requests = new WeakMap<
  ExcalidrawImperativeAPI,
  Map<string, AbortController>
>();

export function isCanvasVideoGenerating(
  api: ExcalidrawImperativeAPI,
  id: string,
): boolean {
  return requests.get(api)?.has(id) ?? false;
}

export function stopCanvasVideoGeneration(
  api: ExcalidrawImperativeAPI,
  id: string,
): void {
  requests.get(api)?.get(id)?.abort();
  requests.get(api)?.delete(id);
  const element = api
    .getSceneElements()
    .find((el) => el.id === id && !el.isDeleted);
  if (!isVideoGeneratorElement(element)) return;
  updateVideoGeneratorElement(api, id, {
    status: element.type === "embeddable" ? "completed" : "idle",
    errorMessage: undefined,
  });
}

export function stopCanvasVideoGenerations(api: ExcalidrawImperativeAPI): void {
  for (const id of requests.get(api)?.keys() ?? [])
    stopCanvasVideoGeneration(api, id);
}

export async function generateCanvasVideo(
  api: ExcalidrawImperativeAPI,
  id: string,
  accessToken: string,
  data: VideoGeneratorData,
  options: NonNullable<Parameters<typeof generateVideoDirect>[2]>,
): Promise<void> {
  if (isCanvasVideoGenerating(api, id)) return;
  const active = requests.get(api) ?? new Map<string, AbortController>();
  requests.set(api, active);
  const controller = new AbortController();
  active.set(id, controller);
  const { signal } = controller;
  const currentElement = () =>
    api.getSceneElements().find((el) => el.id === id && !el.isDeleted);
  const canApply = () =>
    !signal.aborted &&
    active.get(id) === controller &&
    isVideoGeneratorElement(currentElement());
  updateVideoGeneratorElement(api, id, {
    ...data,
    status: "generating",
    errorMessage: undefined,
  });
  try {
    const result = await generateVideoDirect(
      accessToken,
      data.prompt,
      options,
      signal,
    );
    if (!canApply()) return;
    const { restoreElements } = await import("@excalidraw/excalidraw");
    if (!canApply()) return;
    const element = currentElement();
    if (!element) return;
    const dimensions = getDisplayDimensions(
      data.aspectRatio,
      Math.max(element.width, element.height),
    );
    // convertToExcalidrawElements leaves embeddables as raw skeletons. Restore
    // supplies the required styles and rendering fields before selecting one.
    const [video] = restoreElements(
      [
        {
          type: "embeddable",
          strokeColor: "transparent",
          backgroundColor: "transparent",
          roughness: 0,
          link: result.url,
          x: element.x + (element.width - dimensions.width) / 2,
          y: element.y + (element.height - dimensions.height) / 2,
          ...dimensions,
          customData: {
            ...element.customData,
            ...data,
            status: "completed",
            errorMessage: undefined,
            isVideo: true,
            mimeType: result.mimeType,
            durationSeconds: result.durationSeconds,
            title: data.prompt.slice(0, 60),
            prompt: data.prompt,
          },
        } as unknown as ExcalidrawElement,
      ],
      null,
    );
    if (!video) throw new Error("无法创建视频画布元素。");
    // Keep types stable for Excalidraw undo/redo, as with generated images.
    const videoId = element.type === "embeddable" ? element.id : video.id;
    const completed = {
      ...video,
      id: videoId,
      index: element.index,
      angle: element.angle,
      groupIds: element.groupIds,
      frameId: element.frameId,
      boundElements: element.boundElements,
      opacity: element.opacity,
      locked: element.locked,
      version: element.version + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
    const selected = api.getAppState().selectedElementIds;
    api.updateScene({
      elements: api.getSceneElements().flatMap((el) =>
        el.id !== id
          ? [el]
          : el.type === "embeddable"
            ? [completed]
            : [
                {
                  ...el,
                  isDeleted: true,
                  version: el.version + 1,
                  versionNonce: Math.floor(Math.random() * 2_000_000_000),
                  updated: Date.now(),
                },
                completed,
              ],
      ),
      ...(selected[id] && videoId !== id
        ? {
            appState: {
              selectedElementIds: Object.fromEntries(
                Object.entries(selected).map(([key, value]) => [
                  key === id ? videoId : key,
                  value,
                ]),
              ),
            },
          }
        : {}),
      captureUpdate: "IMMEDIATELY",
    });
  } catch (error) {
    if (!canApply()) return;
    updateVideoGeneratorElement(api, id, {
      status: "error",
      errorMessage: "生成失败，请重试或更换模型。",
    });
    throw error;
  } finally {
    if (active.get(id) === controller) active.delete(id);
  }
}
