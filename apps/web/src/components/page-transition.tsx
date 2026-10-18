"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, ViewTransition, useLayoutEffect, useRef } from "react";

type TransitionDocument = Document & {
  activeViewTransition?: { ready: Promise<void> } | null;
};

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const contentRef = useRef<HTMLDivElement>(null);
  const canObserveTransition =
    typeof document !== "undefined" && "activeViewTransition" in document;

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    const content = contentRef.current;
    if (!content?.animate) return;

    let disposed = false;
    let animation: Animation | undefined;
    const animateEntry = () => {
      if (
        disposed ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }
      animation = content.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 200, easing: "ease-in-out" },
      );
    };

    // React may skip a native transition for synchronous updates or popstate.
    // Wait for its outcome so a successful snapshot never captures this fade.
    const transition = (document as TransitionDocument).activeViewTransition;
    if (transition) {
      void transition.ready.catch(animateEntry);
    } else {
      animateEntry();
    }

    return () => {
      disposed = true;
      animation?.cancel();
    };
  }, [pathname]);

  return (
    <ViewTransition
      name="workspace-page"
      default="none"
      update={canObserveTransition ? "workspace-page" : "none"}
    >
      <div ref={contentRef} data-page-path={pathname} className="h-full">
        {children}
      </div>
    </ViewTransition>
  );
}
