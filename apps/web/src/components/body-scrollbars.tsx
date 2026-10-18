"use client";

import { OverlayScrollbars } from "overlayscrollbars";
import { useLayoutEffect } from "react";

import { scrollbarOptions } from "@/lib/scrollbar-options";

export function BodyScrollbars() {
  useLayoutEffect(() => {
    const instance = OverlayScrollbars(
      {
        target: document.body,
        elements: { viewport: document.body },
        cancel: { body: null },
      },
      scrollbarOptions,
    );
    return () => instance.destroy();
  }, []);

  return null;
}
