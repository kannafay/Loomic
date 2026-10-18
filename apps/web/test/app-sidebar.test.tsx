import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render as renderUI,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceLayout from "../src/app/(workspace)/layout";
import { ToastProvider } from "../src/components/toast";

const render = (ui: ReactNode) => renderUI(ui, { wrapper: ToastProvider });

const { auth, navigation, signOut, replace } = vi.hoisted(() => ({
  auth: { role: "admin" as "admin" | "user" },
  navigation: { pathname: "/home", pending: false },
  signOut: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace }),
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return {
    ...actual,
    useLinkStatus: () => ({ pending: navigation.pending }),
  };
});

vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "sidebar-user" },
    loading: false,
    role: auth.role,
    signOut,
  }),
}));

function renderWorkspace() {
  return render(
    <WorkspaceLayout>
      <h1>工作区内容</h1>
    </WorkspaceLayout>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.role = "admin";
  navigation.pathname = "/home";
  navigation.pending = false;
  signOut.mockResolvedValue(undefined);
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  document.cookie = "sidebar_state=; path=/; max-age=0";
  vi.unstubAllGlobals();
});

describe("workspace sidebar", () => {
  it("shows pending navigation feedback while keeping the current page usable, then clears it on arrival", () => {
    const workspace = renderWorkspace();
    const menu = screen.getByRole("navigation", { name: "工作区导航" });
    const projects = within(menu).getByRole("link", { name: "项目" });
    expect(within(projects).queryByRole("status")).not.toBeInTheDocument();

    navigation.pending = true;
    workspace.rerender(
      <WorkspaceLayout>
        <h1>工作区内容</h1>
      </WorkspaceLayout>,
    );
    expect(within(projects).getByRole("status")).toHaveTextContent(
      "正在打开项目",
    );
    expect(projects).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { name: "工作区内容" })).toBeVisible();
    expect(screen.getByRole("button", { name: "折叠侧边栏" })).toBeEnabled();

    navigation.pending = false;
    navigation.pathname = "/projects";
    workspace.rerender(
      <WorkspaceLayout>
        <h1>项目内容</h1>
      </WorkspaceLayout>,
    );
    expect(within(projects).queryByRole("status")).not.toBeInTheDocument();
    expect(projects).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "项目内容" })).toBeVisible();
  });

  it("also provides pending feedback in the mobile navigation", () => {
    navigation.pending = true;
    renderWorkspace();
    const mobile = screen.getByRole("navigation", { name: "移动导航" });
    const projects = within(mobile).getByRole("link", { name: "项目" });
    expect(within(projects).getByRole("status")).toHaveTextContent(
      "正在打开项目",
    );
    expect(projects).toHaveAttribute("href", "/projects");
  });

  it("switches page content immediately while keeping the sidebar and page frame mounted", async () => {
    const user = userEvent.setup();
    const workspace = renderWorkspace();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "工作区内容" })).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: "折叠侧边栏" }));
    const navigationElement = screen.getByRole("navigation", {
      name: "工作区导航",
    });
    const pageFrame = screen.getByRole("main").firstElementChild;

    navigation.pathname = "/projects";
    workspace.rerender(
      <WorkspaceLayout>
        <h1>项目内容</h1>
      </WorkspaceLayout>,
    );

    expect(screen.getByRole("heading", { name: "项目内容" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "工作区内容" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("main").firstElementChild).toBe(pageFrame);
    expect(screen.getByRole("navigation", { name: "工作区导航" })).toBe(
      navigationElement,
    );
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("collapses and expands, restoring the saved preference on reload", async () => {
    const user = userEvent.setup();
    const workspace = renderWorkspace();

    expect(screen.getByRole("button", { name: "折叠侧边栏" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "折叠侧边栏" }));
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    workspace.unmount();
    renderWorkspace();
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(screen.getByRole("button", { name: "折叠侧边栏" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "工作区内容" }),
    ).toBeInTheDocument();
  });

  it("shows a tooltip for keyboard focus only when collapsed", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.tab(); // Skip link.
    await user.tab(); // Brand link.
    await user.tab(); // Home link.
    const home = within(
      screen.getByRole("navigation", { name: "工作区导航" }),
    ).getByRole("link", { name: "首页" });
    expect(home).toHaveFocus();
    expect(
      screen.getByText("首页", { selector: '[data-slot="tooltip-content"]' }),
    ).not.toBeVisible();

    await user.keyboard("{Control>}b{/Control}");
    await user.tab();
    await user.tab({ shift: true });
    expect(
      await screen.findByText("首页", {
        selector: '[data-slot="tooltip-content"]',
      }),
    ).toBeVisible();
    // Base UI disables hit testing for the positioner, popup and arrow together.
    expect(
      screen.getByText("首页", { selector: '[data-slot="tooltip-content"]' })
        .parentElement,
    ).toHaveStyle({ pointerEvents: "none" });
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByText("首页", {
          selector: '[data-slot="tooltip-content"]',
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it("marks the matching navigation item on nested routes", () => {
    navigation.pathname = "/admin/models";
    renderWorkspace();

    const accountNavigation = screen.getByRole("navigation", {
      name: "账户导航",
    });
    expect(
      within(accountNavigation).getByRole("link", { name: "管理后台" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(accountNavigation).getByRole("link", { name: "个人中心" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      within(screen.getByRole("navigation", { name: "工作区导航" })).getByRole(
        "link",
        { name: "首页" },
      ),
    ).not.toHaveAttribute("aria-current");
  });

  it("keeps administrator navigation out of ordinary users' desktop and mobile menus", () => {
    auth.role = "user";
    renderWorkspace();

    expect(
      screen.queryByRole("link", { name: "管理后台" }),
    ).not.toBeInTheDocument();
    const mobileNavigation = screen.getByRole("navigation", {
      name: "移动导航",
    });
    expect(within(mobileNavigation).getAllByRole("link")).toHaveLength(5);
    expect(
      within(mobileNavigation).getByRole("link", { name: "项目" }),
    ).toHaveTextContent("项目");
  });

  it.each(["cancel", "escape"])(
    "keeps the session and restores focus when the logout dialog is dismissed with %s",
    async (action) => {
      const user = userEvent.setup();
      renderWorkspace();
      const trigger = screen.getByRole("button", { name: "退出登录" });
      await user.click(trigger);
      const dialog = await screen.findByRole("dialog", {
        name: "确认退出登录",
      });
      const cancel = within(dialog).getByRole("button", { name: "取消" });
      await waitFor(() => expect(cancel).toHaveFocus());

      if (action === "cancel") await user.click(cancel);
      else await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      expect(signOut).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      await waitFor(() => expect(trigger).toHaveFocus());
    },
  );

  it("signs out only after confirmation and waits for logout before redirecting", async () => {
    const user = userEvent.setup();
    const completion: { resolve?: () => void } = {};
    signOut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completion.resolve = resolve;
        }),
    );
    renderWorkspace();
    await user.click(screen.getByRole("button", { name: "退出登录" }));
    const dialog = await screen.findByRole("dialog", { name: "确认退出登录" });
    expect(signOut).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "退出登录" }));

    expect(signOut).toHaveBeenCalledExactlyOnceWith();
    expect(replace).not.toHaveBeenCalled();
    expect(
      within(dialog).getByRole("button", { name: "正在退出…" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    completion.resolve?.();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledExactlyOnceWith("/login"),
    );
  });

  it("keeps the dialog open and permits retry when logout fails", async () => {
    const user = userEvent.setup();
    signOut.mockRejectedValueOnce(new Error("network unavailable"));
    renderWorkspace();
    await user.click(screen.getByRole("button", { name: "退出登录" }));
    const dialog = await screen.findByRole("dialog", { name: "确认退出登录" });
    await user.click(within(dialog).getByRole("button", { name: "退出登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "退出登录失败，请重试。",
    );
    expect(screen.getByRole("alert")).toHaveAttribute("data-slot", "toast");
    expect(replace).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "退出登录" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledExactlyOnceWith("/login"),
    );
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
