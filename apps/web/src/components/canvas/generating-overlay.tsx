"use client";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { memo } from "react";

export function getGeneratingOverlayBounds(
  element: Pick<
    ExcalidrawElement,
    "x" | "y" | "width" | "height" | "angle" | "roundness"
  >,
  state: Pick<
    AppState,
    "scrollX" | "scrollY" | "zoom" | "offsetLeft" | "offsetTop"
  >,
) {
  const zoom = state.zoom?.value ?? 1;
  const width = element.width * zoom;
  const height = element.height * zoom;
  const proportionalRadius = Math.min(element.width, element.height) * 0.25;
  // Match Excalidraw's adaptive radius and quadratic rectangle path.
  const radius =
    (element.roundness
      ? element.roundness.type === 3
        ? Math.min(element.roundness.value ?? 32, proportionalRadius)
        : proportionalRadius
      : 0) * zoom;

  return {
    screenX: (element.x + state.scrollX) * zoom + (state.offsetLeft ?? 0),
    screenY: (element.y + state.scrollY) * zoom + (state.offsetTop ?? 0),
    screenW: width,
    screenH: height,
    rotation: element.angle ?? 0,
    clipPath: `path("M ${radius} 0 L ${width - radius} 0 Q ${width} 0 ${width} ${radius} L ${width} ${height - radius} Q ${width} ${height} ${width - radius} ${height} L ${radius} ${height} Q 0 ${height} 0 ${height - radius} L 0 ${radius} Q 0 0 ${radius} 0 Z")`,
  };
}

export const GeneratingOverlay = memo(function GeneratingOverlay({
  screenX,
  screenY,
  screenW,
  screenH,
  rotation,
  clipPath,
  model,
}: ReturnType<typeof getGeneratingOverlayBounds> & { model?: string }) {
  return (
    <div
      className="pointer-events-none fixed overflow-hidden"
      style={{
        left: screenX,
        top: screenY,
        width: screenW,
        height: screenH,
        transform: `rotate(${rotation}rad)`,
        clipPath,
        zIndex: "var(--zIndex-svgLayer, 3)",
      }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
        <svg
          aria-hidden="true"
          className="h-12 w-12 text-muted-foreground/40"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
        {model && (
          <span className="mt-2 rounded-full bg-foreground/5 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {model
              .split("/")
              .pop()
              ?.split("-")
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")}
          </span>
        )}
        <span className="mt-1 text-[11px] text-muted-foreground">
          正在生成…
        </span>
      </div>
      <div className="absolute inset-0 animate-shimmer-scan">
        <div
          className="h-full w-1/2"
          style={{
            background:
              "linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
          }}
        />
      </div>
    </div>
  );
});
