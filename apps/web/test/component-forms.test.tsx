import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ColorSection } from "../src/components/brand-kit/color-section";
import { FontPickerDialog } from "../src/components/brand-kit/font-picker-dialog";
import { SkillCard } from "../src/components/skills/skill-card";

vi.mock("../src/lib/font-api", () => ({
  fetchGoogleFonts: vi.fn(async () => [
    {
      family: "Noto Sans SC",
      variants: ["regular", "700"],
      category: "sans-serif",
    },
  ]),
}));

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("toggles a skill with Space without opening its detail card", async () => {
  const onToggle = vi.fn();
  const onClick = vi.fn();
  render(
    <SkillCard
      skill={{
        id: "skill-1",
        name: "分镜规划",
        slug: "storyboard",
        description: "规划镜头",
        author: "测试",
        version: "1.0.0",
        category: "design",
        iconName: null,
        source: "user",
        isFeatured: false,
        metadata: {},
        createdAt: "2026-10-17T00:00:00Z",
        updatedAt: "2026-10-17T00:00:00Z",
        enabled: false,
      }}
      onToggle={onToggle}
      onClick={onClick}
    />,
  );
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole("switch", { name: "启用 分镜规划" })).toHaveFocus();
  await user.keyboard(" ");
  expect(onToggle).toHaveBeenCalledExactlyOnceWith("skill-1", true);
  expect(onClick).not.toHaveBeenCalled();
});

it("discards a canceled color draft and saves only the explicitly submitted color", async () => {
  const onAddColor = vi.fn();
  render(
    <ColorSection
      colors={[]}
      onAddColor={onAddColor}
      onUpdateColor={vi.fn()}
      onDeleteColor={vi.fn()}
      onUpdateLabel={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "添加颜色" });
  await user.click(trigger);
  await user.type(
    screen.getByRole("textbox", { name: "颜色名称" }),
    "丢弃的草稿",
  );
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(onAddColor).not.toHaveBeenCalled();
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  expect(screen.getByRole("textbox", { name: "颜色名称" })).toHaveValue("");
  await user.type(screen.getByRole("textbox", { name: "颜色名称" }), "品牌橙");
  await user.clear(screen.getByRole("textbox", { name: "颜色十六进制值" }));
  await user.type(
    screen.getByRole("textbox", { name: "颜色十六进制值" }),
    "ff8800",
  );
  await user.click(screen.getByRole("button", { name: "添加" }));
  expect(onAddColor).toHaveBeenCalledExactlyOnceWith("品牌橙", "#FF8800");
});

it("adds the selected font with its regular variant and closes the font dialog", async () => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<FontPickerDialog open onSelect={onSelect} onClose={onClose} />);
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
  await user.click(await screen.findByRole("button", { name: "Noto Sans SC" }));
  await user.click(screen.getByRole("button", { name: "添加" }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({
    family: "Noto Sans SC",
    variant: "regular",
    category: "sans-serif",
  });
  expect(onClose).toHaveBeenCalledOnce();
});
