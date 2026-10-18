import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  PageDataProvider,
  usePageDataState,
} from "../src/lib/page-data-context";

const account = vi.hoisted(() => ({ id: "user-a" as string | null }));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({ user: account.id ? { id: account.id } : null }),
}));

function CachedPage() {
  const [data, setData, loaded] = usePageDataState<string[]>("projects", []);
  return (
    <>
      <p>{loaded ? "已加载" : "尚未加载"}</p>
      <p>{data.join(",") || "空列表"}</p>
      <button type="button" onClick={() => setData(["设计项目"])}>
        加载项目
      </button>
      <button type="button" onClick={() => setData([])}>
        加载空列表
      </button>
      <button
        type="button"
        onClick={() => setData((previous) => previous.slice(1))}
      >
        删除项目
      </button>
    </>
  );
}

function workspace(showPage = true) {
  return (
    <PageDataProvider>
      {showPage ? <CachedPage /> : <p>其他页面</p>}
    </PageDataProvider>
  );
}

beforeEach(() => {
  account.id = "user-a";
});
afterEach(cleanup);

it("restores successfully loaded data on return and preserves local deletions", async () => {
  const user = userEvent.setup();
  const view = render(workspace());
  await user.click(screen.getByRole("button", { name: "加载项目" }));
  view.rerender(workspace(false));
  view.rerender(workspace());
  expect(screen.getByText("设计项目")).toBeVisible();
  expect(screen.getByText("已加载")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "删除项目" }));
  view.rerender(workspace(false));
  view.rerender(workspace());
  expect(screen.queryByText("设计项目")).not.toBeInTheDocument();
  expect(screen.getByText("空列表")).toBeVisible();
});

it("distinguishes a successful empty response from an initial placeholder", async () => {
  const user = userEvent.setup();
  const view = render(workspace());
  view.rerender(workspace(false));
  view.rerender(workspace());
  expect(screen.getByText("尚未加载")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "加载空列表" }));
  view.rerender(workspace(false));
  view.rerender(workspace());
  expect(screen.getByText("已加载")).toBeVisible();
  expect(screen.getByText("空列表")).toBeVisible();
});

it("clears cached page data on logout and account changes", async () => {
  const user = userEvent.setup();
  const view = render(workspace());
  await user.click(screen.getByRole("button", { name: "加载项目" }));
  account.id = "user-b";
  view.rerender(workspace());
  expect(screen.queryByText("设计项目")).not.toBeInTheDocument();
  expect(screen.getByText("尚未加载")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "加载项目" }));
  account.id = null;
  view.rerender(workspace());
  account.id = "user-b";
  view.rerender(workspace());
  expect(screen.queryByText("设计项目")).not.toBeInTheDocument();
  expect(screen.getByText("尚未加载")).toBeVisible();
});
