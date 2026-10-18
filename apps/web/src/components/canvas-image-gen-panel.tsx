"use client";

import { Textarea } from "@/components/ui/textarea";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useCallback, useRef, useState } from "react";

import type { ImageArtifact } from "@loomic/shared";

import { useGenerationErrorHandler } from "../hooks/use-generation-error-handler";
import { insertImageOnCanvas } from "../lib/canvas-elements";
import { generateImageDirect } from "../lib/server-api";

type CanvasImageGenPanelProps = {
  accessToken: string;
  excalidrawApi: ExcalidrawImperativeAPI | null;
  onClose: () => void;
};

export function CanvasImageGenPanel({
  accessToken,
  excalidrawApi,
  onClose,
}: CanvasImageGenPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const { handleGenerationError } = useGenerationErrorHandler();

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);

    try {
      const result = await generateImageDirect(
        accessTokenRef.current,
        prompt.trim(),
      );

      if (excalidrawApi) {
        const artifact: ImageArtifact = {
          type: "image",
          url: result.url,
          mimeType: result.mimeType,
          width: result.width,
          height: result.height,
        };
        await insertImageOnCanvas(excalidrawApi, artifact);
      }

      setPrompt("");
    } catch (err) {
      handleGenerationError(err);
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, excalidrawApi, handleGenerationError]);

  return (
    <div className="w-80 rounded-xl bg-card shadow-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">AI 图片</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      <Textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleGenerate();
          }
        }}
        placeholder="描述你想生成的图片…"
        className="field-sizing-fixed h-20 w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        disabled={loading}
      />

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={!prompt.trim() || loading}
        className="mt-3 w-full rounded-lg bg-foreground text-background py-2 text-sm font-medium transition-opacity disabled:opacity-40 hover:opacity-90"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
            正在生成…
          </span>
        ) : (
          "生成"
        )}
      </button>
    </div>
  );
}
