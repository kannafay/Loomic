// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeDiscoveryGallery } from "@/components/home-discovery-gallery";
import { homeDiscoverySeedCategories } from "@/lib/home-discovery-seeds";

describe("HomeDiscoveryGallery", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows all discovery cards by default", () => {
    render(
      <HomeDiscoveryGallery
        categories={homeDiscoverySeedCategories}
        onCaseSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("灵感发现")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "文化艺术中心品牌设计" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "复古汽车海报" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "猫咪塔罗牌" }),
    ).toBeInTheDocument();
  });

  it("filters cards when a category tab is selected", async () => {
    render(
      <HomeDiscoveryGallery
        categories={homeDiscoverySeedCategories}
        onCaseSelect={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "品牌设计" }));

    expect(
      screen.getByRole("button", { name: "文化艺术中心品牌设计" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "复古汽车海报" }),
    ).not.toBeInTheDocument();
  });

  it("emits the internal Loomic seed payload when a card is clicked", async () => {
    const onCaseSelect = vi.fn();

    render(
      <HomeDiscoveryGallery
        categories={homeDiscoverySeedCategories}
        onCaseSelect={onCaseSelect}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "文化艺术中心品牌设计" }),
    );

    expect(onCaseSelect).toHaveBeenCalledWith({
      authorAvatarUrl:
        "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/branding-design.svg",
      authorName: "Studio Arken",
      categoryKey: "branding-design",
      categoryLabel: "品牌设计",
      coverImageUrl: expect.stringContaining("supabase.co"),
      id: "ji5ey5l",
      likeCount: 7,
      prompt:
        "请以文化艺术中心为灵感，为我做一套品牌探索。输出品牌关键词、主视觉方向、海报延展和社交媒体视觉提案，整体气质要现代、文化感强、适合艺术活动传播。",
      title: "文化艺术中心品牌设计",
      viewCount: 549,
    });
  });
});
