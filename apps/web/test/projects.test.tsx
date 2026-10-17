// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPush, mockReplace, mockSignOut } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockSignOut: vi.fn(),
}));
const mockRouter = { push: mockPush, replace: mockReplace };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "test@test.com" },
    session: { access_token: "token_123" },
    loading: false,
    signOut: mockSignOut,
  }),
}));

import ProjectsPage from "../src/app/(workspace)/projects/page";
import { ToastProvider } from "../src/components/toast";

const mockFetch = vi.fn<typeof fetch>();
const workspace = {
  id: "w1",
  name: "My Workspace",
  type: "personal",
  ownerUserId: "u1",
};
const viewerResponse = {
  profile: {
    id: "u1",
    email: "test@test.com",
    displayName: "Test",
    avatarUrl: null,
  },
  workspace,
  membership: { workspaceId: "w1", userId: "u1", role: "owner" },
};
const projectsResponse = {
  projects: [
    {
      id: "p1",
      name: "Brand System",
      slug: "brand-system",
      description: "Primary brand project",
      workspace,
      primaryCanvas: { id: "c1", name: "Main Canvas", isPrimary: true },
      createdAt: "2026-03-23T00:00:00Z",
      updatedAt: "2026-03-23T10:00:00Z",
    },
    {
      id: "p2",
      name: "App Redesign",
      slug: "app-redesign",
      description: null,
      workspace,
      primaryCanvas: { id: "c2", name: "Main Canvas", isPrimary: true },
      createdAt: "2026-03-22T00:00:00Z",
      updatedAt: "2026-03-22T00:00:00Z",
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockRequests(
  options: {
    projects?: typeof projectsResponse;
    loadError?: "viewer" | "projects";
    createStatus?: number;
  } = {},
) {
  mockFetch.mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/api/projects")) {
      return options.createStatus
        ? jsonResponse(
            {
              error: {
                code: "project_create_failed",
                message: "Create failed",
              },
            },
            options.createStatus,
          )
        : jsonResponse({ project: projectsResponse.projects[0] });
    }
    if (options.loadError && url.endsWith(`/api/${options.loadError}`)) {
      return jsonResponse(
        { error: { code: "unauthorized", message: "Bad token" } },
        401,
      );
    }
    if (url.endsWith("/api/viewer")) return jsonResponse(viewerResponse);
    if (url.endsWith("/api/projects"))
      return jsonResponse(options.projects ?? projectsResponse);
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
}

function renderPage() {
  return render(
    <ToastProvider>
      <ProjectsPage />
    </ToastProvider>,
  );
}

function mockPreviewTab() {
  const previewTab = { location: { href: "/loading-preview" }, close: vi.fn() };
  vi.mocked(window.open).mockReturnValue(previewTab as unknown as Window);
  return previewTab;
}

describe("Projects page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("NEXT_PUBLIC_SERVER_BASE_URL", "http://localhost:3001");
    vi.spyOn(window, "open").mockReturnValue(null);
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("lists projects with links to their primary canvas", async () => {
    mockRequests();
    renderPage();

    expect(
      await screen.findByRole("link", { name: /Brand System/ }),
    ).toHaveAttribute("href", "/canvas?id=c1");
    expect(screen.getByRole("link", { name: /App Redesign/ })).toHaveAttribute(
      "href",
      "/canvas?id=c2",
    );
    expect(screen.getByRole("heading", { name: "项目" })).toBeInTheDocument();
  });

  it("allows creating the first project from an empty list", async () => {
    mockRequests({ projects: { projects: [] } });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "新建项目" }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("creates an unnamed project and navigates the synchronously opened preview tab", async () => {
    mockRequests();
    const previewTab = mockPreviewTab();
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "新建项目" }),
    );

    expect(window.open).toHaveBeenCalledExactlyOnceWith(
      "/loading-preview",
      "_blank",
    );
    await waitFor(() => expect(previewTab.location.href).toBe("/canvas?id=c1"));
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "未命名项目" }),
        headers: expect.objectContaining({ Authorization: "Bearer token_123" }),
      }),
    );
    expect(previewTab.close).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens the new canvas in the current tab when popups are blocked", async () => {
    mockRequests();
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "新建项目" }),
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/canvas?id=c1"));
  });

  it.each(["viewer", "projects"] as const)(
    "signs out and redirects on a 401 from %s",
    async (resource) => {
      mockRequests({ loadError: resource });
      renderPage();

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
      expect(mockSignOut).toHaveBeenCalledOnce();
    },
  );

  it("shows a recoverable load error and reloads on retry", async () => {
    mockFetch.mockImplementation(async () =>
      jsonResponse(
        { error: { code: "bootstrap_failed", message: "Server error" } },
        500,
      ),
    );
    renderPage();

    expect(
      await screen.findByText("数据加载失败，请重试。"),
    ).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    mockRequests();
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(
      await screen.findByRole("link", { name: /Brand System/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("数据加载失败，请重试。"),
    ).not.toBeInTheDocument();
  });

  it.each([409, 500, 401])(
    "closes the preview tab and handles a %i during project creation",
    async (status) => {
      mockRequests({ createStatus: status });
      const previewTab = mockPreviewTab();
      renderPage();

      await userEvent.click(
        await screen.findByRole("button", { name: "新建项目" }),
      );

      await waitFor(() => expect(previewTab.close).toHaveBeenCalledOnce());
      expect(mockPush).not.toHaveBeenCalled();
      if (status === 401) {
        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
        expect(mockSignOut).toHaveBeenCalledOnce();
      } else {
        expect(await screen.findByText("项目创建失败")).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "新建项目" }),
        ).toBeInTheDocument();
        expect(mockSignOut).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
      }
    },
  );
});
