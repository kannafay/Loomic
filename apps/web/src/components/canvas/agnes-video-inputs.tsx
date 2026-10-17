"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useState } from "react";
import type { VideoModelInfo } from "../../lib/server-api";
import type { VideoFrame, VideoInputMode } from "./video-generation-inputs";

export function AgnesVideoInputs({
  mode,
  model,
  firstFrame,
  lastFrame,
  references,
  referenceAudios,
  referenceVideo,
  onFirstFrame,
  onLastFrame,
  onReferences,
  onReferenceAudios,
  onReferenceVideo,
  disabled,
}: {
  mode: VideoInputMode;
  model: VideoModelInfo;
  firstFrame: VideoFrame | null;
  lastFrame: VideoFrame | null;
  references: VideoFrame[];
  referenceAudios: string[];
  referenceVideo: string;
  onFirstFrame: (frame: VideoFrame | null) => void;
  onLastFrame: (frame: VideoFrame | null) => void;
  onReferences: (frames: VideoFrame[]) => void;
  onReferenceAudios: (urls: string[]) => void;
  onReferenceVideo: (url: string) => void;
  disabled: boolean;
}) {
  const [imageText, setImageText] = useState(() =>
    references
      .filter((frame) => !frame.dataUrl.startsWith("data:"))
      .map((frame) => frame.dataUrl)
      .join("\n"),
  );
  const [audioText, setAudioText] = useState(() => referenceAudios.join("\n"));
  const maxImages = model.limits?.maxInputImages ?? 8;
  const fieldClass = "mt-1 text-xs";
  const lines = (value: string) =>
    value
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
  if (mode !== "frames" && mode !== "reference") return null;
  return (
    <div className="space-y-2 text-xs">
      <details className="mt-2 rounded-lg border border-border px-2 py-1.5">
        <summary className="cursor-pointer text-[11px] text-muted-foreground">
          使用图片链接
        </summary>
        <div className="mt-2">
          {mode === "frames" ? (
            <div className="grid grid-cols-2 gap-2">
              <label htmlFor="agnes-video-inputs-1">
                首帧链接
                <Input
                  id="agnes-video-inputs-1"
                  aria-label="首帧链接"
                  type="url"
                  disabled={disabled}
                  placeholder="https://…"
                  value={
                    firstFrame?.dataUrl.startsWith("data:")
                      ? ""
                      : (firstFrame?.dataUrl ?? "")
                  }
                  className={fieldClass}
                  onChange={(event) =>
                    onFirstFrame(
                      event.target.value
                        ? { dataUrl: event.target.value.trim(), name: "首帧" }
                        : null,
                    )
                  }
                />
              </label>
              <label htmlFor="agnes-video-inputs-2">
                尾帧链接
                <Input
                  id="agnes-video-inputs-2"
                  aria-label="尾帧链接"
                  type="url"
                  disabled={disabled}
                  placeholder="https://…"
                  value={
                    lastFrame?.dataUrl.startsWith("data:")
                      ? ""
                      : (lastFrame?.dataUrl ?? "")
                  }
                  className={fieldClass}
                  onChange={(event) =>
                    onLastFrame(
                      event.target.value
                        ? { dataUrl: event.target.value.trim(), name: "尾帧" }
                        : null,
                    )
                  }
                />
              </label>
              <p className="col-span-2 text-[11px] text-muted-foreground">
                填写首帧、尾帧或两者均可。
              </p>
            </div>
          ) : (
            <label htmlFor="agnes-video-inputs-image-text" className="block">
              参考图片链接（最多 {maxImages} 张，每行一个）
              <Textarea
                id="agnes-video-inputs-image-text"
                aria-label="参考图片链接"
                rows={2}
                disabled={disabled}
                value={imageText}
                placeholder="https://…"
                className={`${fieldClass} resize-y`}
                onChange={(event) => {
                  setImageText(event.target.value);
                  onReferences([
                    ...references.filter((frame) =>
                      frame.dataUrl.startsWith("data:"),
                    ),
                    ...lines(event.target.value).map((dataUrl, index) => ({
                      dataUrl,
                      name: `参考图 ${index + 1}`,
                    })),
                  ]);
                }}
              />
            </label>
          )}
        </div>
      </details>
      {mode === "reference" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor="agnes-video-inputs-audio-text">
              参考音频链接（最多 3 段）
              <Textarea
                id="agnes-video-inputs-audio-text"
                aria-label="参考音频链接"
                rows={2}
                disabled={disabled}
                value={audioText}
                placeholder="可选，每行一个链接"
                className={`${fieldClass} resize-y`}
                onChange={(event) => {
                  setAudioText(event.target.value);
                  onReferenceAudios(lines(event.target.value));
                }}
              />
            </label>
            {model.capabilities?.videoToVideo && (
              <label htmlFor="agnes-video-inputs-reference-video">
                参考视频链接（最多 1 段）
                <Input
                  id="agnes-video-inputs-reference-video"
                  aria-label="参考视频链接"
                  type="url"
                  disabled={disabled}
                  value={referenceVideo}
                  placeholder="可选，2–12 秒"
                  className={fieldClass}
                  onChange={(event) =>
                    onReferenceVideo(event.target.value.trim())
                  }
                />
              </label>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            图片可直接上传。音频和视频需填写公网链接。可用 &lt;Picture
            1&gt;、&lt;Audio 1&gt;、&lt;Video 1&gt; 指定用途。
          </p>
        </>
      )}
    </div>
  );
}
