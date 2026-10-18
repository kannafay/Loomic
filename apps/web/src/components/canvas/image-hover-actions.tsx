"use client";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Download, Maximize2 } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageLightbox } from "../chat/image-lightbox";
import { Button, buttonVariants } from "../ui/button";

type ImageActionTarget = {
  id: string;
  src: string;
  title: string;
  filename: string;
  left: number;
  top: number;
};

function containsPoint(element: ExcalidrawElement, x: number, y: number) {
  const dx = x - element.x - element.width / 2;
  const dy = y - element.y - element.height / 2;
  const cosine = Math.cos(element.angle);
  const sine = Math.sin(element.angle);
  return (
    Math.abs(dx * cosine + dy * sine) <= element.width / 2 &&
    Math.abs(dy * cosine - dx * sine) <= element.height / 2
  );
}

export function ImageHoverActions({
  excalidrawApi,
  containerRef,
}: {
  excalidrawApi: ExcalidrawImperativeAPI;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const [image, setImage] = useState<ImageActionTarget | null>(null);
  const [preview, setPreview] = useState<ImageActionTarget | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const actionsRef = useRef<HTMLDivElement>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let pointer: { clientX: number; clientY: number } | null = null;
    let frame: number | null = null;
    const clear = () => {
      if (previewRef.current) return;
      pointer = null;
      setImage(null);
    };
    const refresh = () => {
      if (previewRef.current) return;
      const state = excalidrawApi.getAppState();
      if (
        !pointer ||
        state.contextMenu ||
        state.isResizing ||
        state.isRotating ||
        state.selectedElementsAreBeingDragged ||
        (state.activeTool.type !== "selection" && !state.viewModeEnabled)
      ) {
        setImage(null);
        return;
      }
      const viewport = containerRef.current?.getBoundingClientRect();
      if (!viewport) return;
      const zoom = state.zoom.value;
      const x = (pointer.clientX - state.offsetLeft) / zoom - state.scrollX;
      const y = (pointer.clientY - state.offsetTop) / zoom - state.scrollY;
      const elements = excalidrawApi.getSceneElements();
      const files = excalidrawApi.getFiles();
      let next: ImageActionTarget | null = null;
      for (let index = elements.length - 1; index >= 0; index--) {
        const element = elements[index];
        if (
          !element ||
          element.isDeleted ||
          element.type !== "image" ||
          element.opacity === 0 ||
          element.customData?.status === "generating" ||
          !element.fileId ||
          !containsPoint(element, x, y)
        )
          continue;
        if (element.frameId && state.frameRendering?.clip) {
          const parent = elements.find((item) => item.id === element.frameId);
          if (parent && !containsPoint(parent, x, y)) continue;
        }
        const file = files[element.fileId];
        if (!file?.dataURL) continue;
        const title = String(
          element.customData?.title || element.customData?.label || "图片",
        );
        const extension =
          file.mimeType
            .split("/")[1]
            ?.replace("jpeg", "jpg")
            .replace("svg+xml", "svg") || "png";
        const basename = title
          .replace(/[<>:"/\\|?*\p{Cc}]/gu, "_")
          .replace(/\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i, "")
          .slice(0, 100);
        const halfWidth =
          (Math.abs(Math.cos(element.angle)) * element.width +
            Math.abs(Math.sin(element.angle)) * element.height) /
          2;
        const halfHeight =
          (Math.abs(Math.sin(element.angle)) * element.width +
            Math.abs(Math.cos(element.angle)) * element.height) /
          2;
        const right =
          (element.x + element.width / 2 + halfWidth + state.scrollX) * zoom +
          state.offsetLeft;
        const top =
          (element.y + element.height / 2 - halfHeight + state.scrollY) * zoom +
          state.offsetTop;
        next = {
          id: element.id,
          src: file.dataURL,
          title,
          filename: `${basename || "图片"}.${extension}`,
          left: Math.max(
            viewport.left + 8,
            Math.min(right - 68, viewport.right - 68),
          ),
          top: Math.max(
            viewport.top + 8,
            Math.min(top + 8, viewport.bottom - 36),
          ),
        };
        break;
      }
      setImage((previous) =>
        previous?.id === next?.id &&
        previous?.src === next?.src &&
        previous?.title === next?.title &&
        previous?.filename === next?.filename &&
        previous?.left === next?.left &&
        previous?.top === next?.top
          ? previous
          : next,
      );
    };
    const move = (event: PointerEvent) => {
      if (
        previewRef.current ||
        actionsRef.current?.contains(event.target as Node)
      )
        return;
      if (
        event.buttons !== 0 ||
        !(event.target instanceof HTMLCanvasElement) ||
        !containerRef.current?.contains(event.target)
      ) {
        clear();
        return;
      }
      pointer = { clientX: event.clientX, clientY: event.clientY };
      if (frame === null)
        frame = requestAnimationFrame(() => {
          frame = null;
          refresh();
        });
    };
    const down = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) clear();
    };
    const unsubscribe = excalidrawApi.onChange(refresh);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", move, true);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerleave", clear);
    window.addEventListener("blur", clear);
    window.addEventListener("resize", refresh);
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", move, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerleave", clear);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", refresh);
    };
  }, [excalidrawApi, containerRef]);

  return createPortal(
    <>
      {image && (
        <div
          ref={actionsRef}
          role="toolbar"
          aria-label="图片操作"
          style={{ left: image.left, top: image.top }}
          className="fixed z-[4] flex items-center gap-1"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Button
            ref={previewTrigger}
            variant="ghost"
            size="icon-sm"
            aria-label="全屏预览图片"
            title="全屏预览"
            className="bg-black/55 text-white shadow-sm backdrop-blur-md hover:bg-black/75 hover:text-white active:translate-y-0"
            onClick={() => setPreview(image)}
          >
            <Maximize2 className="size-3.5" />
          </Button>
          <a
            href={image.src}
            download={image.filename}
            aria-label="下载图片"
            title="下载图片"
            className={buttonVariants({
              variant: "ghost",
              size: "icon-sm",
              className:
                "bg-black/55 text-white shadow-sm backdrop-blur-md hover:bg-black/75 hover:text-white active:translate-y-0",
            })}
          >
            <Download className="size-3.5" />
          </a>
        </div>
      )}
      {preview && (
        <ImageLightbox
          src={preview.src}
          alt={preview.title}
          triggerRef={previewTrigger}
          onClose={() => setPreview(null)}
        />
      )}
    </>,
    document.body,
  );
}
