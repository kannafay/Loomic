"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useEffect, useRef, useState } from "react";

type CanvasEmptyHintProps = {
  excalidrawApi: ExcalidrawImperativeAPI | null;
  onOpenChat: () => void;
};

/**
 * Floating overlay hint shown when the Excalidraw canvas has no visible
 * elements. Pressing the `C` key opens the chat sidebar and focuses the
 * chat input textarea.
 */
export function CanvasEmptyHint({
  excalidrawApi,
  onOpenChat,
}: CanvasEmptyHintProps) {
  const [hasElements, setHasElements] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const onOpenChatRef = useRef(onOpenChat);
  onOpenChatRef.current = onOpenChat;

  // Follow editor changes immediately so the hint never covers the native menu.
  useEffect(() => {
    if (!excalidrawApi) {
      setHasElements(false);
      setContextMenuOpen(false);
      return;
    }
    function sync() {
      const elements = excalidrawApi?.getSceneElements() ?? [];
      setHasElements(elements.some((el) => !el.isDeleted));
      setContextMenuOpen(Boolean(excalidrawApi?.getAppState().contextMenu));
    }

    sync();
    return excalidrawApi.onChange(sync);
  }, [excalidrawApi]);

  // Global keydown listener for the `C` shortcut.
  useEffect(() => {
    if (hasElements || contextMenuOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when the user is typing in an input or textarea.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Also ignore if contentEditable
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        onOpenChatRef.current();

        // The textarea may not be in the DOM yet (sidebar was closed), so
        // retry focus with a short delay.
        requestAnimationFrame(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>(
            "textarea[data-chat-input]",
          );
          if (textarea) {
            textarea.focus();
          } else {
            // Sidebar might animate open; retry once more.
            setTimeout(() => {
              document
                .querySelector<HTMLTextAreaElement>("textarea[data-chat-input]")
                ?.focus();
            }, 100);
          }
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasElements, contextMenuOpen]);

  if (hasElements || contextMenuOpen) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <p className="text-base text-muted-foreground/50">
        {"输入你的想法开始创作"}
      </p>
    </div>
  );
}
