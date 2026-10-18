import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import {
  createExcalidrawImageElement,
  fetchAsDataURL,
} from "./canvas-elements";
import {
  type ImageGeneratorData,
  getDisplayDimensions,
  isImageGeneratorElement,
  updateImageGeneratorElement,
} from "./canvas-image-generator";
import { generateImageDirect } from "./server-api";

// Requests belong to the canvas element, so deselecting it does not lose its
// result or prevent a newly opened panel from stopping the same request.
const requests = new WeakMap<
  ExcalidrawImperativeAPI,
  Map<string, AbortController>
>();

export function isCanvasImageGenerating(
  api: ExcalidrawImperativeAPI,
  elementId: string,
): boolean {
  return requests.get(api)?.has(elementId) ?? false;
}

export function stopCanvasImageGeneration(
  api: ExcalidrawImperativeAPI,
  elementId: string,
): void {
  requests.get(api)?.get(elementId)?.abort();
  requests.get(api)?.delete(elementId);
  const element = api.getSceneElements().find((el) => el.id === elementId);
  if (!element || element.isDeleted || !isImageGeneratorElement(element))
    return;
  updateImageGeneratorElement(api, elementId, {
    status: element.type === "image" ? "completed" : "idle",
    errorMessage: undefined,
  });
}

export function stopCanvasImageGenerations(api: ExcalidrawImperativeAPI): void {
  for (const id of requests.get(api)?.keys() ?? []) {
    stopCanvasImageGeneration(api, id);
  }
}

export async function generateCanvasImage(
  api: ExcalidrawImperativeAPI,
  elementId: string,
  accessToken: string,
  params: Pick<
    ImageGeneratorData,
    "prompt" | "model" | "aspectRatio" | "quality"
  >,
): Promise<void> {
  if (isCanvasImageGenerating(api, elementId)) return;
  const active = requests.get(api) ?? new Map<string, AbortController>();
  requests.set(api, active);
  const controller = new AbortController();
  active.set(elementId, controller);
  const { signal } = controller;
  const currentElement = () =>
    api.getSceneElements().find((el) => el.id === elementId && !el.isDeleted);
  const canApply = () =>
    !signal.aborted &&
    active.get(elementId) === controller &&
    isImageGeneratorElement(currentElement());

  updateImageGeneratorElement(api, elementId, {
    ...params,
    status: "generating",
    errorMessage: undefined,
  });

  try {
    const result = await generateImageDirect(
      accessToken,
      params.prompt,
      {
        model: params.model,
        aspectRatio: params.aspectRatio,
        quality: params.quality,
      },
      signal,
    );
    if (!canApply()) return;
    const dataURL = await fetchAsDataURL(result.url, signal);
    if (!canApply()) return;
    const element = currentElement();
    if (!element) return;

    const fileId = crypto.randomUUID();
    const dimensions = getDisplayDimensions(
      params.aspectRatio,
      Math.max(element.width, element.height),
    );
    const image = createExcalidrawImageElement({
      fileId,
      x: element.x + (element.width - dimensions.width) / 2,
      y: element.y + (element.height - dimensions.height) / 2,
      ...dimensions,
      title: params.prompt.slice(0, 60),
      source: "generated",
      storageUrl: result.url,
    });
    api.addFiles([
      {
        id: image.fileId as NonNullable<typeof image.fileId>,
        dataURL: dataURL as BinaryFileData["dataURL"],
        mimeType: result.mimeType as BinaryFileData["mimeType"],
        created: Date.now(),
      },
    ]);
    const imageId = element.type === "image" ? element.id : image.id;
    const completedImage = {
      ...image,
      id: imageId,
      index: element.index,
      angle: element.angle,
      groupIds: element.groupIds,
      frameId: element.frameId,
      boundElements: element.boundElements,
      locked: element.locked,
      link: element.link,
      opacity: element.opacity,
      version: element.version + 1,
      customData: {
        ...element.customData,
        ...image.customData,
        ...params,
        status: "completed",
        errorMessage: undefined,
      },
    };
    const selectedIds = api.getAppState().selectedElementIds;
    api.updateScene({
      // Excalidraw history does not support changing an existing element's type.
      // Replace rectangles with a new image, keeping their full generation data.
      elements: api.getSceneElements().flatMap((el) =>
        el.id === elementId
          ? el.type === "image"
            ? [completedImage]
            : [
                {
                  ...el,
                  isDeleted: true,
                  version: el.version + 1,
                  versionNonce: Math.floor(Math.random() * 2_000_000_000),
                  updated: Date.now(),
                },
                completedImage,
              ]
          : [el],
      ),
      ...(selectedIds[elementId] && imageId !== elementId
        ? {
            appState: {
              selectedElementIds: Object.fromEntries(
                Object.entries(selectedIds).map(([id, selected]) => [
                  id === elementId ? imageId : id,
                  selected,
                ]),
              ),
            },
          }
        : {}),
      captureUpdate: "IMMEDIATELY",
    });
  } catch (error) {
    if (!canApply()) return;
    updateImageGeneratorElement(api, elementId, {
      status: "error",
      errorMessage: "生成失败，请重试或更换模型。",
    });
    throw error;
  } finally {
    if (active.get(elementId) === controller) active.delete(elementId);
  }
}
