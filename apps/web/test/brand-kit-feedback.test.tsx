import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrandKitPage } from "../src/components/brand-kit/brand-kit-page";
import { ToastProvider } from "../src/components/toast";
import { PageDataProvider } from "../src/lib/page-data-context";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  duplicate: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "token" }, signOut: vi.fn() }),
}));
vi.mock("../src/lib/brand-kit-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/brand-kit-api")>()),
  fetchBrandKits: api.list,
  fetchBrandKit: api.detail,
  createBrandKit: api.create,
  duplicateBrandKit: api.duplicate,
  updateBrandKit: api.update,
}));
vi.mock("../src/components/brand-kit/brand-kit-sidebar", () => ({
  BrandKitSidebar: ({ onCreateKit }: { onCreateKit: () => Promise<void> }) => (
    <button type="button" onClick={onCreateKit}>
      新建套件
    </button>
  ),
}));
vi.mock("../src/components/brand-kit/brand-kit-editor", () => ({
  BrandKitEditor: ({
    kit,
    onDuplicateKit,
    onUpdateKit,
  }: {
    kit: { name: string };
    onDuplicateKit: () => Promise<void>;
    onUpdateKit: (data: { guidance_text: string }) => Promise<void>;
  }) => (
    <>
      <h1>{kit.name}</h1>
      <button type="button" onClick={onDuplicateKit}>
        复制套件
      </button>
      <button
        type="button"
        onClick={() => onUpdateKit({ guidance_text: "新品牌说明" })}
      >
        保存品牌说明
      </button>
    </>
  ),
}));
const kit = { id: "kit-a", name: "品牌 A" };
beforeEach(() => {
  api.list.mockReset().mockResolvedValue({ brandKits: [kit] });
  api.detail.mockReset().mockResolvedValue(kit);
  api.create.mockReset().mockResolvedValue({ id: "kit-b", name: "品牌 B" });
  api.duplicate
    .mockReset()
    .mockResolvedValue({ id: "kit-c", name: "品牌副本" });
  api.update.mockReset().mockResolvedValue(kit);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const page = () =>
  render(
    <ToastProvider>
      <PageDataProvider>
        <BrandKitPage />
      </PageDataProvider>
    </ToastProvider>,
  );

it("notifies after creation and keeps the selected kit when duplication fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const user = userEvent.setup();
  page();
  await screen.findByRole("heading", { name: "品牌 A" });
  await user.click(screen.getByRole("button", { name: "新建套件" }));
  expect(await screen.findByRole("status")).toHaveTextContent("品牌套件已创建");
  await screen.findByRole("heading", { name: "品牌 B" });
  api.duplicate.mockRejectedValueOnce(new Error("duplicate failed"));
  await user.click(screen.getByRole("button", { name: "复制套件" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "品牌套件复制失败",
  );
  expect(screen.getByRole("heading", { name: "品牌 B" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "复制套件" }));
  await screen.findByRole("heading", { name: "品牌副本" });
  expect(api.duplicate).toHaveBeenCalledTimes(2);
  expect(
    screen
      .getAllByRole("status")
      .some((n) => n.textContent?.includes("品牌套件已复制")),
  ).toBe(true);
});

it("reports failed automatic saves without emitting success messages for each edit", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  api.update.mockRejectedValueOnce(new Error("save failed"));
  const user = userEvent.setup();
  page();
  await screen.findByRole("heading", { name: "品牌 A" });
  await user.click(screen.getByRole("button", { name: "保存品牌说明" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "品牌套件保存失败",
  );
  await user.click(screen.getByRole("button", { name: "保存品牌说明" }));
  await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
