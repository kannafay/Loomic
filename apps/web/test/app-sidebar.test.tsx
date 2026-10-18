import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceLayout from "../src/app/(workspace)/layout";

const { auth, navigation, signOut, replace } = vi.hoisted(() => ({
  auth: { role: "admin" as "admin" | "user" },
  navigation: { pathname: "/home" },
  signOut: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace }),
}));

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
      within(accountNavigation).getByRole("link", { name: "设置" }),
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

  it("signs out before redirecting to login", async () => {
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

    expect(signOut).toHaveBeenCalledExactlyOnceWith();
    expect(replace).not.toHaveBeenCalled();
    completion.resolve?.();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledExactlyOnceWith("/login"),
    );
  });
});
