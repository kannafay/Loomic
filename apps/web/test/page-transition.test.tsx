import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense, startTransition, use, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageTransition } from "../src/components/page-transition";

const { navigation } = vi.hoisted(() => ({
  navigation: { pathname: "/home" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

beforeEach(() => {
  navigation.pathname = "/home";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, "animate");
  Reflect.deleteProperty(document, "activeViewTransition");
  vi.unstubAllGlobals();
});

function mockAnimation() {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }));
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  return { animate, cancel };
}

function setNativeTransition(ready: Promise<void> | null) {
  Object.defineProperty(document, "activeViewTransition", {
    configurable: true,
    value: ready ? { ready } : null,
  });
}

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
  navigation.pathname = "/projects";
  view.rerender(page("项目"));

  expect(screen.getByRole("heading", { name: "项目" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "首页" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "草稿" })).toBe(draft);
  expect(draft).toHaveValue("已有草稿");
  expect(draft.parentElement).toBe(frame);
  expect(frame).not.toHaveStyle({ opacity: "0" });
});

it("animates committed navigation without native support, but not initial render or same-page changes", () => {
  const { animate, cancel } = mockAnimation();
  const view = render(<PageTransition>首页</PageTransition>);
  expect(animate).not.toHaveBeenCalled();

  navigation.pathname = "/projects";
  view.rerender(<PageTransition>项目</PageTransition>);
  expect(animate).toHaveBeenCalledExactlyOnceWith(
    [
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 200, easing: "ease-in-out" },
  );

  view.rerender(<PageTransition>项目列表已更新</PageTransition>);
  expect(animate).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(cancel).toHaveBeenCalledOnce();
});

it("does not replay the entry animation after a successful native transition", async () => {
  const { animate } = mockAnimation();
  let resolveReady = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const view = render(<PageTransition>首页</PageTransition>);
  setNativeTransition(ready);
  navigation.pathname = "/projects";
  view.rerender(<PageTransition>项目</PageTransition>);
  expect(animate).not.toHaveBeenCalled();

  await act(async () => {
    resolveReady();
    await ready;
  });
  expect(animate).not.toHaveBeenCalled();
});

it("plays the entry animation when React skips the native transition", async () => {
  const { animate } = mockAnimation();
  let skip = (_error: Error) => {};
  const ready = new Promise<void>((_resolve, reject) => {
    skip = reject;
  });
  const view = render(<PageTransition>首页</PageTransition>);
  setNativeTransition(ready);
  navigation.pathname = "/skills";
  view.rerender(<PageTransition>技能</PageTransition>);
  expect(animate).not.toHaveBeenCalled();

  await act(async () => {
    skip(new DOMException("Transition was skipped", "AbortError"));
  });
  expect(animate).toHaveBeenCalledOnce();
  expect(screen.getByText("技能")).toBeVisible();
});

it("ignores a stale skipped transition after navigating again and cancels the previous animation", async () => {
  const { animate, cancel } = mockAnimation();
  let skip = (_error: Error) => {};
  const ready = new Promise<void>((_resolve, reject) => {
    skip = reject;
  });
  const view = render(<PageTransition>首页</PageTransition>);
  setNativeTransition(ready);
  navigation.pathname = "/projects";
  view.rerender(<PageTransition>项目</PageTransition>);

  setNativeTransition(null);
  navigation.pathname = "/skills";
  view.rerender(<PageTransition>技能</PageTransition>);
  await act(async () => {
    skip(new Error("Superseded navigation"));
  });
  expect(animate).toHaveBeenCalledOnce();

  navigation.pathname = "/home";
  view.rerender(<PageTransition>首页</PageTransition>);
  expect(cancel).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenCalledTimes(2);
});

it("respects reduced motion when a native transition is unavailable", () => {
  const { animate } = mockAnimation();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  const view = render(<PageTransition>首页</PageTransition>);
  navigation.pathname = "/projects";
  view.rerender(<PageTransition>项目</PageTransition>);
  expect(animate).not.toHaveBeenCalled();
  expect(screen.getByText("项目")).toBeVisible();
});

it("retains the current page until a suspended destination is ready, including without browser animation support", async () => {
  const { animate } = mockAnimation();
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
          onClick={() => {
            navigation.pathname = "/projects";
            startTransition(() => setDestination(true));
          }}
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
  expect(animate).not.toHaveBeenCalled();

  await act(async () => {
    resolveDestination();
    await ready;
  });
  expect(await screen.findByRole("heading", { name: "项目" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "项目" }).parentElement).toBe(
    frame,
  );
  expect(screen.queryByRole("heading", { name: "首页" })).toBeNull();
  expect(animate).toHaveBeenCalledOnce();
});
