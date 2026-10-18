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
import {
  INITIAL_AGENT_MODEL_KEY,
  INITIAL_ATTACHMENTS_KEY,
  INITIAL_IMAGE_GENERATION_PREFERENCE_KEY,
  INITIAL_VIDEO_GENERATION_PREFERENCE_KEY,
  useCreateProject,
} from "../src/hooks/use-create-project";
import { PageDataProvider } from "../src/lib/page-data-context";

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

function pageContent(showPage = true) {
  return (
    <PageDataProvider>
      <ToastProvider>
        {showPage ? <ProjectsPage /> : <p>其他页面</p>}
      </ToastProvider>
    </PageDataProvider>
  );
}

function renderPage() {
  return render(pageContent());
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

  it("shows cached projects immediately on return while refreshing in the background", async () => {
    mockRequests();
    const view = renderPage();
    await screen.findByRole("link", { name: /Brand System/ });
    view.rerender(pageContent(false));

    const pending: { resolve?: (response: Response) => void } = {};
    mockFetch.mockImplementation(async (input) => {
      if (String(input).endsWith("/api/viewer"))
        return jsonResponse(viewerResponse);
      return new Promise<Response>((resolve) => {
        pending.resolve = resolve;
      });
    });
    view.rerender(pageContent());
    expect(screen.getByRole("link", { name: /Brand System/ })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    pending.resolve?.(
      jsonResponse({
        projects: projectsResponse.projects.map((project) => ({
          ...project,
          name: `Updated ${project.name}`,
        })),
      }),
    );
    expect(
      await screen.findByRole("link", { name: /Updated Brand System/ }),
    ).toBeVisible();
  });

  it("creates an unnamed project in the current tab without opening a preview tab", async () => {
    mockRequests();
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "新建项目" }),
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/canvas?id=c1"));
    expect(window.open).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "未命名项目" }),
        headers: expect.objectContaining({ Authorization: "Bearer token_123" }),
      }),
    );
  });

  it("hands the prompt, attachments and model choices to the canvas in the same tab", async () => {
    const prompt = "雪山日出，写实，16:9";
    const attachments = [
      {
        assetId: "reference-1",
        url: "https://example.com/reference.png",
        mimeType: "image/png",
        source: "upload" as const,
        name: "reference.png",
      },
    ];
    const imageGenerationPreference = {
      mode: "manual" as const,
      models: ["configured/agnes-image"],
    };
    const videoGenerationPreference = {
      mode: "manual" as const,
      models: ["configured/agnes-video"],
    };
    function PromptSubmit() {
      const { create } = useCreateProject();
      return (
        <button
          type="button"
          onClick={() =>
            create({
              prompt,
              attachments,
              imageGenerationPreference,
              videoGenerationPreference,
              model: "configured/agnes-chat",
            })
          }
        >
          提交创作
        </button>
      );
    }
    mockRequests();
    render(
      <ToastProvider>
        <PromptSubmit />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "提交创作" }));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        `/canvas?id=c1&prompt=${encodeURIComponent(prompt)}`,
      ),
    );
    expect(window.open).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(INITIAL_ATTACHMENTS_KEY)).toBe(
      JSON.stringify(attachments),
    );
    expect(
      sessionStorage.getItem(INITIAL_IMAGE_GENERATION_PREFERENCE_KEY),
    ).toBe(JSON.stringify(imageGenerationPreference));
    expect(
      sessionStorage.getItem(INITIAL_VIDEO_GENERATION_PREFERENCE_KEY),
    ).toBe(JSON.stringify(videoGenerationPreference));
    expect(sessionStorage.getItem(INITIAL_AGENT_MODEL_KEY)).toBe(
      "configured/agnes-chat",
    );
  });

  it("clears a previous prompt's handoff data when creating a blank project", async () => {
    const keys = [
      INITIAL_ATTACHMENTS_KEY,
      INITIAL_IMAGE_GENERATION_PREFERENCE_KEY,
      INITIAL_VIDEO_GENERATION_PREFERENCE_KEY,
      INITIAL_AGENT_MODEL_KEY,
    ];
    for (const key of keys) sessionStorage.setItem(key, "previous");
    mockRequests();
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "新建项目" }),
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/canvas?id=c1"));
    for (const key of keys) expect(sessionStorage.getItem(key)).toBeNull();
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
    "stays on the current page and handles a %i during project creation",
    async (status) => {
      mockRequests({ createStatus: status });
      renderPage();

      await userEvent.click(
        await screen.findByRole("button", { name: "新建项目" }),
      );

      expect(window.open).not.toHaveBeenCalled();
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
