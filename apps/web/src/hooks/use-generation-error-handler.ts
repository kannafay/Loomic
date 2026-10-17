"use client";

import { useCallback } from "react";
import { ApiApplicationError } from "@/lib/server-api";
import { useToast } from "@/components/toast";

export function useGenerationErrorHandler() {
  const { error: showErrorToast } = useToast();
  const handleGenerationError = useCallback((error: unknown): boolean => {
    console.error("[generation-error]", error);
    showErrorToast(error instanceof ApiApplicationError ? error.message : "生成失败，请重试。");
    return false;
  }, [showErrorToast]);
  return { handleGenerationError };
}
