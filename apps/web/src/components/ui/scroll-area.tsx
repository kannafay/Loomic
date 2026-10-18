"use client";

import { useRender } from "@base-ui/react/use-render";
import { OverlayScrollbars } from "overlayscrollbars";
import { type RefObject, useLayoutEffect, useRef } from "react";

import { scrollbarOptions } from "@/lib/scrollbar-options";
import { cn } from "@/lib/utils";

type ScrollAreaProps = useRender.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical" | "both";
  viewportRef?: RefObject<HTMLElement | null>;
};

export function ScrollArea({
  render,
  className,
  orientation = "both",
  viewportRef,
  children,
  onInput,
  ...props
}: ScrollAreaProps) {
  const ref = useRef<HTMLElement>(null);
  const instanceRef = useRef<OverlayScrollbars | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Reuse existing scrollports so refs, native editing, flex/grid children
    // and headless UI keyboard navigation keep working without DOM wrapping.
    const viewport = viewportRef?.current ?? element;
    const instance = OverlayScrollbars(
      {
        target: element,
        elements:
          viewport === element ? { viewport } : { viewport, content: viewport },
      },
      {
        ...scrollbarOptions,
        // Native form viewports fill their host; avoid shifting their text
        // with the padding compensation used for ordinary content wrappers.
        paddingAbsolute: !!viewportRef,
        overflow: {
          x: orientation === "vertical" ? "hidden" : "scroll",
          y: orientation === "horizontal" ? "hidden" : "scroll",
        },
      },
    );
    instanceRef.current = instance;
    return () => {
      instanceRef.current = null;
      instance.destroy();
    };
  }, [orientation, viewportRef]);

  // Controlled form values can change the size of an input without a DOM
  // mutation. Refresh after React commits, including resets and pasted text.
  useLayoutEffect(() => {
    instanceRef.current?.update();
  });

  return useRender({
    defaultTagName: "div",
    render,
    ref,
    props: {
      ...props,
      onInput: (event: React.InputEvent<HTMLDivElement>) => {
        onInput?.(event);
        instanceRef.current?.update();
      },
      "data-overlayscrollbars-initialize": "",
      className: cn("relative [scrollbar-gutter:auto]", className),
      // Avoid React replacing plugin nodes when a plain text value updates.
      children:
        typeof children === "string" || typeof children === "number" ? (
          <span>{children}</span>
        ) : (
          children
        ),
    },
  });
}
