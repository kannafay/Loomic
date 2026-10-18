import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectsSkeleton } from "../src/components/skeletons/projects-skeleton";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("keeps the page title visible while delaying placeholders for a slow request", () => {
  render(<ProjectsSkeleton />);
  expect(screen.getByRole("heading", { name: "项目" })).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(199));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(
    screen.getByRole("status", { name: "正在加载内容" }),
  ).toBeInTheDocument();
});

it("never flashes a skeleton when the request finishes quickly", () => {
  const view = render(<ProjectsSkeleton />);
  act(() => vi.advanceTimersByTime(80));
  view.rerender(<h1>项目已加载</h1>);
  act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "项目已加载" })).toBeVisible();
  expect(vi.getTimerCount()).toBe(0);
});
