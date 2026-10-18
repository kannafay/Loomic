import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrandKitSelector } from "../src/components/brand-kit-selector";

const { fetchKits, updateProject } = vi.hoisted(() => ({
  fetchKits: vi.fn(),
  updateProject: vi.fn(),
}));
vi.mock("../src/lib/brand-kit-api", () => ({ fetchBrandKits: fetchKits }));
vi.mock("../src/lib/server-api", () => ({ updateProject }));

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  fetchKits.mockReset().mockResolvedValue({
    brandKits: [{ id: "kit-a", name: "日常品牌" }],
  });
  updateProject.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("binds and clears a brand kit, and blocks repeat updates while saving", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const props = {
    accessToken: "token-a",
    projectId: "project-a",
    currentBrandKitId: null as string | null,
    onBrandKitChange: onChange,
  };
  let finishSave!: () => void;
  updateProject.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  const view = render(<BrandKitSelector {...props} />);
  await user.click(screen.getByRole("combobox", { name: "品牌套件" }));
  await user.click(await screen.findByRole("option", { name: "日常品牌" }));
  await waitFor(() =>
    expect(updateProject).toHaveBeenCalledExactlyOnceWith(
      "token-a",
      "project-a",
      {
        brand_kit_id: "kit-a",
      },
    ),
  );
  expect(screen.getByRole("combobox", { name: "品牌套件" })).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => finishSave());
  expect(onChange).toHaveBeenCalledExactlyOnceWith("kit-a");
  view.rerender(<BrandKitSelector {...props} currentBrandKitId="kit-a" />);
  await user.click(screen.getByRole("combobox", { name: "品牌套件" }));
  expect(
    await screen.findByRole("option", { name: "日常品牌" }),
  ).toHaveAttribute("aria-selected", "true");
  await user.click(screen.getByRole("option", { name: /^无$/ }));
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null));
  expect(updateProject).toHaveBeenLastCalledWith("token-a", "project-a", {
    brand_kit_id: null,
  });
});

it("keeps the current kit after a failed save and retries with the current token", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const props = {
    accessToken: "token-a",
    projectId: "project-a",
    currentBrandKitId: "kit-a",
    onBrandKitChange: onChange,
  };
  const view = render(<BrandKitSelector {...props} />);
  await waitFor(() => expect(fetchKits).toHaveBeenCalledOnce());
  view.rerender(<BrandKitSelector {...props} accessToken="token-b" />);
  updateProject.mockRejectedValueOnce(new Error("save failed"));
  await user.click(screen.getByRole("combobox", { name: "品牌套件" }));
  await user.click(await screen.findByRole("option", { name: /^无$/ }));
  await waitFor(() => expect(updateProject).toHaveBeenCalledOnce());
  expect(screen.getByRole("combobox", { name: "品牌套件" })).toHaveTextContent(
    "日常品牌",
  );
  expect(onChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole("combobox", { name: "品牌套件" }));
  await user.click(await screen.findByRole("option", { name: /^无$/ }));
  await waitFor(() => expect(onChange).toHaveBeenCalledExactlyOnceWith(null));
  expect(updateProject).toHaveBeenLastCalledWith("token-b", "project-a", {
    brand_kit_id: null,
  });
  expect(fetchKits).toHaveBeenCalledOnce();
});
