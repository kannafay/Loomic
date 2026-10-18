import { afterEach, expect, it, vi } from "vitest";
import { clearProviders, registerVideoProvider } from "./providers/registry.js";
import { generateVideo } from "./video-generation.js";

afterEach(clearProviders);
it.each(["google", "agnes"])(
  "preserves native frame inputs for a configured %s provider",
  async (kind) => {
    const generate = vi.fn().mockResolvedValue({ url: "saved.mp4" });
    registerVideoProvider({
      name: "configured-provider",
      catalogProvider: kind,
      models: [
        {
          id: "configured/model",
          displayName: "团队视频",
          description: "",
          capabilities: {
            textToVideo: true,
            imageToVideo: true,
            videoToVideo: true,
            lastFrame: true,
            referenceImages: true,
            audio: true,
          },
          limits: { maxDuration: 8, maxResolution: "1080p", maxInputImages: 8 },
        },
      ],
      generate,
    });
    const params = {
      prompt: "云海",
      model: "configured/model",
      firstFrame: "data:image/png;base64,aGVsbG8=",
      lastFrame: "data:image/png;base64,aGVsbG8=",
      ...(kind === "agnes"
        ? { referenceAudios: ["https://media.example.com/a.mp3"] }
        : {}),
    };
    await generateVideo("configured-provider", params);
    expect(generate).toHaveBeenCalledExactlyOnceWith(params);
    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty("inputImages");
  },
);
