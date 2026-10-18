"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";
import { useRef } from "react";

function Textarea({
  className,
  scrollable = true,
  rows = 2,
  style,
  ...props
}: React.ComponentProps<"textarea"> & { scrollable?: boolean }) {
  const viewportRef = useRef<HTMLTextAreaElement>(null);
  const classes = cn(
    "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    className,
  );

  const input = useRender({
    defaultTagName: "textarea",
    ref: viewportRef,
    props: {
      ...props,
      "data-slot": "textarea",
      rows,
      style: scrollable ? undefined : style,
      className: scrollable
        ? "block min-h-full w-full resize-none rounded-[inherit] border-0 bg-transparent px-2.5 py-2 text-inherit [font:inherit] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        : classes,
    },
  });

  if (!scrollable) return input;

  return (
    <ScrollArea
      orientation="vertical"
      viewportRef={viewportRef}
      data-slot="textarea-scroll-area"
      data-disabled={props.disabled || undefined}
      aria-invalid={props["aria-invalid"]}
      className={cn(
        "resize-y",
        className?.includes("field-sizing-fixed") &&
          "h-[calc(var(--textarea-rows)*1lh+1rem)]",
        classes,
        "block focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50",
      )}
      style={{ ...style, "--textarea-rows": rows } as React.CSSProperties}
    >
      {input}
    </ScrollArea>
  );
}

export { Textarea };
