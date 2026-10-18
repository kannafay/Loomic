import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense, startTransition, use, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { PageTransition } from "../src/components/page-transition";

afterEach(cleanup);

it("keeps the live frame visible and preserves unaffected state when content changes", () => {
  function page(title: string) {
    return (
      <PageTransition>
        <div>
          <h1>{title}</h1>
          <input aria-label="草稿" defaultValue="已有草稿" />
        </div>
      </PageTransition>
    );
  }

  const view = render(page("首页"));
  const draft = screen.getByRole("textbox", { name: "草稿" });
  const frame = draft.parentElement;
  view.rerender(page("项目"));

  expect(screen.getByRole("heading", { name: "项目" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "首页" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "草稿" })).toBe(draft);
  expect(draft).toHaveValue("已有草稿");
  expect(draft.parentElement).toBe(frame);
  expect(frame).not.toHaveStyle({ opacity: "0" });
});

it("retains the current page until a suspended destination is ready, including without browser animation support", async () => {
  const user = userEvent.setup();
  let resolveDestination: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveDestination = resolve;
  });

  function Destination() {
    use(ready);
    return <h1>项目</h1>;
  }

  function Workspace() {
    const [destination, setDestination] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => startTransition(() => setDestination(true))}
        >
          前往项目
        </button>
        <Suspense fallback={<p>正在加载目标页面</p>}>
          <PageTransition>
            <div>{destination ? <Destination /> : <h1>首页</h1>}</div>
          </PageTransition>
        </Suspense>
      </>
    );
  }

  render(<Workspace />);
  const frame = screen.getByRole("heading", { name: "首页" }).parentElement;
  await act(async () => {
    await user.click(screen.getByRole("button", { name: "前往项目" }));
  });
  expect(screen.getByRole("heading", { name: "首页" })).toBeVisible();
  expect(screen.queryByText("正在加载目标页面")).toBeNull();

  await act(async () => {
    resolveDestination();
    await ready;
  });
  expect(await screen.findByRole("heading", { name: "项目" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "项目" }).parentElement).toBe(
    frame,
  );
  expect(screen.queryByRole("heading", { name: "首页" })).toBeNull();
});
