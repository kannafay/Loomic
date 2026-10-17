// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeExampleBrowser } from "@/components/home-example-browser";
import { homeExampleSeedCategories } from "@/lib/home-example-seeds";

describe("HomeExampleBrowser", () => {
  afterEach(() => {
    cleanup();
  });

  it("expands design examples after clicking the Design chip", async () => {
    render(
      <HomeExampleBrowser
        categories={homeExampleSeedCategories}
        onExampleSelect={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("设计包豪斯风格海报"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "设计" }));

    expect(
      await screen.findByText("设计包豪斯风格海报"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("构思理想的室内空间"),
    ).toBeInTheDocument();
  });

  it("auto-selects the first example when a category chip is clicked", async () => {
    const onExampleSelect = vi.fn();

    render(
      <HomeExampleBrowser
        categories={homeExampleSeedCategories}
        onExampleSelect={onExampleSelect}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "设计" }));

    expect(onExampleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryKey: "design",
        categoryLabel: "设计",
        title: "设计包豪斯风格海报",
        prompt:
          "为音乐节设计一张包豪斯风格海报。仅使用粉色、红色和奶油色，以抽象几何图形表现声波，并搭配极简的竖排文字。",
        previewImages: expect.arrayContaining([expect.stringContaining("supabase.co")]),
      }),
    );
  });

  it("calls onExampleSelect with the picked example payload", async () => {
    const onExampleSelect = vi.fn();

    render(
      <HomeExampleBrowser
        categories={homeExampleSeedCategories}
        onExampleSelect={onExampleSelect}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "设计" }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: /设计成套陶瓷餐具/,
      }),
    );

    expect(onExampleSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        categoryKey: "design",
        categoryLabel: "设计",
        title: "设计成套陶瓷餐具",
        prompt:
          "生成 5 张陶瓷餐具图片，分别展示小碗、大碗、小盘、大盘和马克杯，每种各一件，组成风格统一的套装。融合北欧极简与日式侘寂美学，采用柔和的中性色、有机纹理、带有手工拉坯痕迹的不规则造型、细微釉色变化和自然光感。每件产品均使用无缝白色背景与均匀的棚拍产品灯光。",
        previewImages: expect.arrayContaining([expect.stringContaining("supabase.co")]),
        inputMentions: [],
      }),
    );
  });
});
