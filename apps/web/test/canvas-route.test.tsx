import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import CanvasPage from "../src/app/canvas/page";

const route = vi.hoisted(() => ({
  query: "",
  router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => route.router,
  useSearchParams: () => new URLSearchParams(route.query),
}));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "viewer" },
    session: { access_token: "token" },
    loading: false,
    signOut: vi.fn(),
  }),
}));
vi.mock("../src/lib/server-api", () => ({
  ApiAuthError: class extends Error {},
  fetchCanvas: vi.fn(async (_token: string, id: string) => ({
    canvas: { id, name: id, projectId: `project-${id}`, content: {} },
  })),
  fetchProject: vi.fn(async (_token: string, id: string) => ({
    project: { id, name: id, brand_kit_id: null },
  })),
}));
vi.mock("../src/hooks/use-websocket", () => ({
  useWebSocket: () => ({}),
}));
vi.mock("../src/hooks/use-job-fallback-polling", () => ({
  useJobFallbackPolling: () => ({ checkForTimedOutJobs: vi.fn() }),
}));
vi.mock("../src/lib/canvas-elements", () => ({
  insertImageOnCanvas: vi.fn(),
  insertVideoOnCanvas: vi.fn(),
}));
vi.mock("../src/components/brand-kit-selector", () => ({
  BrandKitSelector: () => null,
}));
vi.mock("../src/components/canvas-bottom-bar", () => ({
  CanvasBottomBar: () => null,
}));
vi.mock("../src/components/canvas-editor", () => ({
  CanvasEditor: () => null,
}));
vi.mock("../src/components/canvas-empty-hint", () => ({
  CanvasEmptyHint: () => null,
}));
vi.mock("../src/components/canvas-files-panel", () => ({
  CanvasFilesPanel: () => null,
}));
vi.mock("../src/components/canvas-layers-panel", () => ({
  CanvasLayersPanel: () => null,
}));
vi.mock("../src/components/canvas-logo-menu", () => ({
  CanvasLogoMenu: () => null,
}));
vi.mock("../src/components/editable-project-name", () => ({
  EditableProjectName: () => null,
}));
vi.mock("../src/components/chat-sidebar", () => ({
  ChatSidebar: ({
    canvasId,
    initialPrompt,
  }: { canvasId: string; initialPrompt?: string }) => (
    <p>{`${canvasId}: ${initialPrompt ?? "无初始提示词"}`}</p>
  ),
}));

afterEach(cleanup);

it("keeps the prompt through session URL updates and resets it when navigating to another project", async () => {
  route.query = "id=canvas-a&prompt=第一张海报";
  const view = render(<CanvasPage />);
  expect(await screen.findByText("canvas-a: 第一张海报")).toBeInTheDocument();

  route.query = "id=canvas-a&session=session-a";
  view.rerender(<CanvasPage />);
  expect(screen.getByText("canvas-a: 第一张海报")).toBeInTheDocument();

  route.query = "id=canvas-b";
  view.rerender(<CanvasPage />);
  expect(await screen.findByText("canvas-b: 无初始提示词")).toBeInTheDocument();
  expect(screen.queryByText(/第一张海报/)).not.toBeInTheDocument();

  route.query = "id=canvas-c&prompt=第二张海报";
  view.rerender(<CanvasPage />);
  expect(await screen.findByText("canvas-c: 第二张海报")).toBeInTheDocument();
});
