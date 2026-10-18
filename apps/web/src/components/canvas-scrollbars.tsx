"use client";

import { OverlayScrollbars } from "overlayscrollbars";
import { useEffect } from "react";

import { scrollbarOptions } from "@/lib/scrollbar-options";

// Excalidraw owns these DOM nodes, including portals outside the canvas root.
// Enhance only its scrollports; app-owned surfaces use ScrollArea directly.
export function CanvasScrollbars() {
  useEffect(() => {
    const instances = new Map<HTMLElement, () => void>();
    const pending = new Set<HTMLElement>();
    let frame = 0;

    const enhance = (root: HTMLElement) => {
      for (const element of [
        root,
        ...root.querySelectorAll<HTMLElement>("*"),
      ]) {
        if (
          !(element instanceof HTMLElement) ||
          !element.isConnected ||
          instances.has(element) ||
          !element.closest(".excalidraw") ||
          element.matches("input, textarea") ||
          element.hasAttribute("data-overlayscrollbars") ||
          element.closest(".os-scrollbar")
        )
          continue;
        const style = getComputedStyle(element);
        if (!/(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`))
          continue;

        const position = element.style.position;
        const needsPosition = style.position === "static";
        if (needsPosition) element.style.position = "relative";
        const instance = OverlayScrollbars(
          { target: element, elements: { viewport: element } },
          {
            ...scrollbarOptions,
            overflow: {
              x: /auto|scroll/.test(style.overflowX) ? "scroll" : "hidden",
              y: /auto|scroll/.test(style.overflowY) ? "scroll" : "hidden",
            },
          },
        );
        instances.set(element, () => {
          instance.destroy();
          if (needsPosition) element.style.position = position;
        });
      }
    };

    const flush = () => {
      frame = 0;
      for (const [element, destroy] of instances) {
        if (!element.isConnected) {
          destroy();
          instances.delete(element);
        }
      }
      for (const element of pending) enhance(element);
      pending.clear();
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof HTMLElement &&
            !node.closest(".os-scrollbar") &&
            (node.closest(".excalidraw") || node.querySelector(".excalidraw"))
          )
            pending.add(node);
        }
      }
      if (!frame && (pending.size || instances.size))
        frame = requestAnimationFrame(flush);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    for (const root of document.querySelectorAll<HTMLElement>(".excalidraw"))
      enhance(root);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const destroy of instances.values()) destroy();
    };
  }, []);

  return null;
}
