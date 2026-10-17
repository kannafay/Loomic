"use client";

// @credits-system — React hook for credit balance, daily claim, and auto-refresh on focus

import { getUserFacingError } from "@/lib/locale";

import { useAuth } from "@/lib/auth-context";
import { claimDailyCredits, fetchCredits } from "@/lib/credits-api";
import type { CreditBalanceResponse } from "@loomic/shared";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseCreditsReturn {
  balance: number;
  plan: string;
  dailyClaimed: boolean;
  limits: CreditBalanceResponse["limits"] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  claimDaily: () => Promise<boolean>;
}

export function useCredits(): UseCreditsReturn {
  const { session } = useAuth();
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;

  const [data, setData] = useState<CreditBalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) return;
    try {
      const result = await fetchCredits(token);
      setData(result);
      setError(null);
    } catch (err) {
      setError(getUserFacingError(err, "积分信息加载失败。"));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    refresh();
  }, [session?.access_token, refresh]);

  // Auto-refresh on window focus
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refresh]);

  const claimDaily = useCallback(async (): Promise<boolean> => {
    const token = accessTokenRef.current;
    if (!token) return false;
    try {
      const result = await claimDailyCredits(token);
      if (result.success) {
        await refresh();
        return true;
      }
      setError(getUserFacingError(result, "积分领取失败。"));
      return false;
    } catch (err) {
      setError(getUserFacingError(err, "每日积分领取失败，请重试。"));
      return false;
    }
  }, [refresh]);

  return {
    balance: data?.balance ?? 0,
    plan: data?.plan ?? "free",
    dailyClaimed: data?.dailyClaimed ?? false,
    limits: data?.limits ?? null,
    loading,
    error,
    refresh,
    claimDaily,
  };
}
