import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render as renderUI,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { BrandKitPage } from "../src/components/brand-kit/brand-kit-page";
import { ToastProvider } from "../src/components/toast";
import { PageDataProvider } from "../src/lib/page-data-context";

const render = (ui: ReactNode) => renderUI(ui, { wrapper: ToastProvider });

const { fetchKits, fetchDetail } = vi.hoisted(() => ({
  fetchKits: vi.fn(),
  fetchDetail: vi.fn(),
}));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-a" },
    session: { access_token: "token-a" },
    signOut: vi.fn(),
  }),
}));
vi.mock("../src/lib/brand-kit-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/brand-kit-api")>()),
  fetchBrandKits: fetchKits,
  fetchBrandKit: fetchDetail,
}));
vi.mock("../src/components/brand-kit/brand-kit-sidebar", () => ({
  BrandKitSidebar: ({ onSelectKit }: { onSelectKit: (id: string) => void }) => (
    <button type="button" onClick={() => onSelectKit("kit-b")}>
      选择套件 B
    </button>
  ),
}));
vi.mock("../src/components/brand-kit/brand-kit-editor", () => ({
  BrandKitEditor: ({ kit }: { kit: { name: string } }) => <h2>{kit.name}</h2>,
}));

afterEach(cleanup);

it("does not let a background refresh overwrite a newer kit selection", async () => {
  const user = userEvent.setup();
  const kitA = { id: "kit-a", name: "套件 A" };
  const kitB = { id: "kit-b", name: "套件 B" };
  fetchKits.mockResolvedValue({ brandKits: [kitA, kitB] });
  fetchDetail.mockResolvedValue(kitA);
  const workspace = (showPage = true) => (
    <PageDataProvider>{showPage ? <BrandKitPage /> : null}</PageDataProvider>
  );
  const view = render(workspace());
  await screen.findByRole("heading", { name: "套件 A" });
  view.rerender(workspace(false));

  const pending: { resolve?: (kit: typeof kitA) => void } = {};
  fetchDetail.mockImplementation((_token: string, id: string) =>
    id === "kit-b"
      ? Promise.resolve(kitB)
      : new Promise<typeof kitA>((resolve) => {
          pending.resolve = resolve;
        }),
  );
  view.rerender(workspace());
  await waitFor(() => expect(fetchDetail).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole("button", { name: "选择套件 B" }));
  expect(await screen.findByRole("heading", { name: "套件 B" })).toBeVisible();
  await act(async () => pending.resolve?.(kitA));
  expect(screen.getByRole("heading", { name: "套件 B" })).toBeVisible();
});
