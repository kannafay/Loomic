import { describe, expect, it } from "vitest";
import {
  localizeHomeExample,
  localizeHomeInputMentions,
} from "../src/lib/home-content-locale";
import { homeDiscoverySeedCategories } from "../src/lib/home-discovery-seeds";
import { homeExampleSeedCategories } from "../src/lib/home-example-seeds";
import {
  getCanvasElementLabel,
  getCreditDescription,
  getPlanLabel,
  getUserFacingError,
  localizeSystemSkill,
} from "../src/lib/locale";
import { getModelDescription } from "../src/lib/model-locale";

describe("Simplified Chinese UI messages", () => {
  it("uses Chinese labels without changing internal identifiers", () => {
    expect(getPlanLabel("pro")).toBe("专业版");
    expect(getCanvasElementLabel("rectangle")).toBe("矩形");
    expect(getCanvasElementLabel("future-element")).toBe("图形");
  });

  it("translates auth codes and handles network failures", () => {
    expect(
      getUserFacingError({
        code: "invalid_credentials",
        message: "Invalid login credentials",
      }),
    ).toBe("邮箱或密码错误，请重新输入。");
    expect(getUserFacingError(new TypeError("Failed to fetch"))).toBe(
      "网络连接失败，请检查服务状态后重试。",
    );
  });

  it("preserves Chinese service messages and uses contextual fallbacks for unknown errors", () => {
    expect(getUserFacingError(new Error("当前模型维护中，请稍后重试。"))).toBe(
      "当前模型维护中，请稍后重试。",
    );
    expect(
      getUserFacingError(
        new Error("Unexpected provider error"),
        "图片生成失败，请重试。",
      ),
    ).toBe("图片生成失败，请重试。");
  });

  it("localizes built-in examples while preserving custom content and model identifiers", () => {
    expect(
      homeExampleSeedCategories
        .flatMap((category) => category.examples)
        .every(
          (example) =>
            /[\u3400-\u9fff]/.test(example.title) &&
            /[\u3400-\u9fff]/.test(example.prompt),
        ),
    ).toBe(true);
    expect(
      homeDiscoverySeedCategories
        .flatMap((category) => category.cases)
        .every((item) => /[\u3400-\u9fff]/.test(item.title)),
    ).toBe(true);
    expect(localizeHomeExample("My custom design", "Keep my prompt")).toEqual({
      title: "My custom design",
      prompt: "Keep my prompt",
    });
    expect(
      localizeHomeInputMentions("Design pixel-perfect web interface.", [
        { type: "tool", name: "Nano Banana Pro" },
        { type: "image", name: "Chair" },
      ]),
    ).toEqual([
      { type: "tool", name: "Nano Banana Pro" },
      { type: "image", name: "椅子" },
    ]);
  });

  it("renders system credit descriptions and model capabilities in Chinese", () => {
    expect(
      getCreditDescription("Plan upgraded to pro — monthly credits granted"),
    ).toBe("升级至专业版，已发放每月积分");
    expect(
      getCreditDescription("Image generation: google/nano-banana-pro"),
    ).toBe("图片生成：google/nano-banana-pro");
    expect(getCreditDescription("Custom adjustment")).toBe("Custom adjustment");
    expect(
      getModelDescription(
        "google-official/veo-3.1-generate-preview",
        "Google flagship",
      ),
    ).toContain("原生音频");
  });

  it("translates official skill metadata while preserving instructions and custom skills", () => {
    const skill = {
      slug: "canvas-design",
      source: "system",
      name: "Canvas Design",
      description: "Create artwork",
      skillContent: "Original instructions",
    };
    expect(localizeSystemSkill(skill)).toMatchObject({
      name: "画布设计",
      skillContent: "Original instructions",
    });
    expect(localizeSystemSkill({ ...skill, source: "user" })).toMatchObject({
      name: "Canvas Design",
      description: "Create artwork",
    });
  });
});
