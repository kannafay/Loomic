"use client";

import { type ReactNode, useEffect, useState } from "react";

/** Avoid flashing placeholders for requests that finish within 200 ms. */
export function DelayedSkeleton({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(timer);
  }, []);

  return visible ? (
    <div className="contents">
      <output aria-label="正在加载内容" className="sr-only">
        正在加载内容…
      </output>
      {children}
    </div>
  ) : null;
}
