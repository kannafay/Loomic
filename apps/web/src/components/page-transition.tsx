"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useLayoutEffect, useRef } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const frameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    const frame = frameRef.current;
    if (!frame?.animate) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const animation = frame.animate(
      [{ transform: "translateY(-6px)" }, { transform: "translateY(0)" }],
      { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    );
    const handleMotionChange = () => {
      if (reducedMotion.matches) animation.cancel();
    };
    reducedMotion.addEventListener("change", handleMotionChange);
    return () => {
      reducedMotion.removeEventListener("change", handleMotionChange);
      animation.cancel();
    };
  }, [pathname]);

  return (
    <div ref={frameRef} className="h-full">
      {children}
    </div>
  );
}
