"use client";

import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./auth-context";

const PageDataContext = createContext<Map<string, unknown> | null>(null);

function SessionPageData({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new Map<string, unknown>());
  return (
    <PageDataContext.Provider value={cache}>
      {children}
    </PageDataContext.Provider>
  );
}

/** Keep successful page data in memory until the signed-in account changes. */
export function PageDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <SessionPageData key={user?.id ?? "signed-out"}>{children}</SessionPageData>
  );
}

/** Use a stable resource key; initial placeholders are never cached. */
export function usePageDataState<T>(key: string, initialValue: T) {
  const cache = useContext(PageDataContext);
  if (!cache) throw new Error("usePageDataState requires PageDataProvider");

  const [entry, setEntry] = useState(() => ({
    value: cache.has(key) ? (cache.get(key) as T) : initialValue,
    loaded: cache.has(key),
  }));

  useEffect(() => {
    if (entry.loaded) cache.set(key, entry.value);
  }, [cache, key, entry]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback((action) => {
    setEntry((previous) => ({
      value:
        typeof action === "function"
          ? (action as (value: T) => T)(previous.value)
          : action,
      loaded: true,
    }));
  }, []);

  return [entry.value, setValue, entry.loaded] as const;
}
