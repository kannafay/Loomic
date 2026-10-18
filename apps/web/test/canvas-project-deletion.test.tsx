import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CanvasLogoMenu } from "../src/components/canvas-logo-menu";
import { ToastProvider } from "../src/components/toast";
import {
  PageDataProvider,
  usePageDataState,
} from "../src/lib/page-data-context";

const mocks = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "viewer" },
    session: { access_token: "token" },
    signOut: mocks.signOut,
  }),
}));
vi.mock("../src/lib/server-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/server-api")>()),
  deleteProject: mocks.deleteProject,
}));

function CachedProjects({ seed = false }: { seed?: boolean }) {
  const [projects, setProjects, loaded] = usePageDataState<string[]>(
    "projects",
    [],
  );
  useEffect(() => {
    if (seed) setProjects(["project-a", "project-b"]);
  }, [seed, setProjects]);
  return <p>{loaded ? projects.join(",") : "等待刷新项目"}</p>;
}

function content(stage: "canvas" | "seed" | "home" = "canvas") {
  return (
    <PageDataProvider>
      <ToastProvider>
        {stage === "canvas" ? (
          <CanvasLogoMenu projectId="project-a" excalidrawApi={null} />
        ) : (
          <CachedProjects seed={stage === "seed"} />
        )}
      </ToastProvider>
    </PageDataProvider>
  );
}

async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "菜单" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "删除当前项目" }),
  );
  return screen.findByRole("dialog", { name: /确定删除此项目/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteProject.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("PointerEvent", MouseEvent);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps confirmation open after the menu closes and cancels without deleting or navigating", async () => {
  const user = userEvent.setup();
  render(content());
  const dialog = await openDeleteDialog(user);
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus(),
  );
  expect(mocks.deleteProject).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "菜单" })).toHaveFocus(),
  );
  await openDeleteDialog(user);
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(mocks.deleteProject).not.toHaveBeenCalled();
  expect(mocks.router.replace).not.toHaveBeenCalled();
  expect(mocks.router.push).not.toHaveBeenCalled();
});

it("waits for one confirmed deletion, then clears stale project data and replaces the canvas with home", async () => {
  let finish: (() => void) | undefined;
  mocks.deleteProject.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  const view = render(content("seed"));
  expect(await screen.findByText("project-a,project-b")).toBeVisible();
  view.rerender(content());
  const dialog = await openDeleteDialog(user);
  await user.dblClick(within(dialog).getByRole("button", { name: "永久删除" }));
  expect(mocks.deleteProject).toHaveBeenCalledExactlyOnceWith(
    "token",
    "project-a",
  );
  expect(
    within(dialog).getByRole("button", { name: "正在删除…" }),
  ).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(mocks.router.replace).not.toHaveBeenCalled();
  await act(async () => finish?.());
  await waitFor(() =>
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/home"),
  );
  expect(mocks.router.push).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("项目已删除");
  view.rerender(content("home"));
  expect(screen.getByText("等待刷新项目")).toBeVisible();
  expect(screen.queryByText("project-a,project-b")).not.toBeInTheDocument();
});

it("keeps the canvas, confirmation and cached list on failure and allows retry", async () => {
  mocks.deleteProject.mockRejectedValueOnce(new Error("unavailable"));
  const user = userEvent.setup();
  const view = render(content("seed"));
  await screen.findByText("project-a,project-b");
  view.rerender(content());
  const dialog = await openDeleteDialog(user);
  await user.click(within(dialog).getByRole("button", { name: "永久删除" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("项目删除失败");
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(mocks.router.replace).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "取消" }));
  view.rerender(content("home"));
  expect(screen.getByText("project-a,project-b")).toBeVisible();
  view.rerender(content());
  const retry = await openDeleteDialog(user);
  await user.click(within(retry).getByRole("button", { name: "永久删除" }));
  await waitFor(() =>
    expect(mocks.router.replace).toHaveBeenCalledWith("/home"),
  );
  expect(mocks.deleteProject).toHaveBeenCalledTimes(2);
});
