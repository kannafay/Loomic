import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { BodyScrollbars } from "../src/components/body-scrollbars";
import { CanvasScrollbars } from "../src/components/canvas-scrollbars";
import { ScrollArea } from "../src/components/ui/scroll-area";
import { Textarea } from "../src/components/ui/textarea";

const library = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock("overlayscrollbars", () => ({ OverlayScrollbars: library.initialize }));

beforeEach(() => {
  library.initialize.mockReset().mockImplementation(({ target }) => {
    const bar = document.createElement("div");
    bar.className = "os-scrollbar";
    bar.dataset.testid = "plugin-scrollbar";
    target.appendChild(bar);
    return { destroy: vi.fn(() => bar.remove()), update: vi.fn() };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps refs and scroll events on the original viewport without wrapping flex children", () => {
  const ref = createRef<HTMLDivElement>();
  const scrolled = vi.fn();
  render(
    <ScrollArea
      ref={ref}
      orientation="vertical"
      className="flex flex-col"
      onScroll={(event) => scrolled(event.currentTarget)}
    >
      <button type="button">第一项</button>
      <button type="button">第二项</button>
    </ScrollArea>,
  );
  const first = screen.getByRole("button", { name: "第一项" });
  expect(first.parentElement).toBe(ref.current);
  expect(library.initialize).toHaveBeenCalledWith(
    { target: ref.current, elements: { viewport: ref.current } },
    expect.objectContaining({ overflow: { x: "hidden", y: "scroll" } }),
  );
  fireEvent.scroll(ref.current as HTMLDivElement);
  expect(scrolled).toHaveBeenCalledExactlyOnceWith(ref.current);
});

it("retains the plugin when plain text changes and destroys it when the surface unmounts", () => {
  const view = render(<ScrollArea render={<pre />}>第一段代码</ScrollArea>);
  const bar = screen.getByTestId("plugin-scrollbar");
  const instance = library.initialize.mock.results[0]?.value;
  view.rerender(<ScrollArea render={<pre />}>更新的代码</ScrollArea>);
  expect(screen.getByText("更新的代码").closest("pre")).toBeInTheDocument();
  expect(screen.getByTestId("plugin-scrollbar")).toBe(bar);
  expect(library.initialize).toHaveBeenCalledOnce();
  view.unmount();
  expect(instance.destroy).toHaveBeenCalledOnce();
  expect(bar).not.toBeInTheDocument();
});

it("releases the old instance before changing the allowed scrolling axes", () => {
  const view = render(<ScrollArea orientation="horizontal">内容</ScrollArea>);
  const first = library.initialize.mock.results[0]?.value;
  view.rerender(<ScrollArea orientation="vertical">内容</ScrollArea>);
  expect(first.destroy).toHaveBeenCalledOnce();
  expect(library.initialize).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ overflow: { x: "hidden", y: "scroll" } }),
  );
  expect(screen.getAllByTestId("plugin-scrollbar")).toHaveLength(1);
});

it("keeps textarea labels, refs, scrolling and editing on the native input while its parent hosts the plugin", async () => {
  const ref = createRef<HTMLTextAreaElement>();
  const changed = vi.fn();
  render(
    <Textarea
      ref={ref}
      aria-label="技能内容"
      rows={8}
      className="field-sizing-fixed resize-y"
      onChange={changed}
    />,
  );
  const input = screen.getByRole("textbox", { name: "技能内容" });
  expect(input).toBe(ref.current);
  expect(input.parentElement).toHaveAttribute(
    "data-slot",
    "textarea-scroll-area",
  );
  expect(library.initialize).toHaveBeenCalledWith(
    {
      target: input.parentElement,
      elements: { viewport: input, content: input },
    },
    expect.anything(),
  );
  await userEvent.type(input, "新的内容");
  expect(input).toHaveValue("新的内容");
  expect(changed).toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '{\n  "temperature": 0.3\n}' } });
  expect(input).toHaveValue('{\n  "temperature": 0.3\n}');
});

it("initializes document scrolling without moving React-owned body children", () => {
  const view = render(
    <>
      <BodyScrollbars />
      <button type="button">页面操作</button>
    </>,
  );
  const parent = screen.getByRole("button", { name: "页面操作" }).parentElement;
  expect(library.initialize).toHaveBeenCalledWith(
    {
      target: document.body,
      elements: { viewport: document.body },
      cancel: { body: null },
    },
    expect.objectContaining({
      scrollbars: expect.objectContaining({ theme: "os-theme-loomic" }),
    }),
  );
  expect(screen.getByRole("button", { name: "页面操作" }).parentElement).toBe(
    parent,
  );
  const instance = library.initialize.mock.results[0]?.value;
  view.unmount();
  expect(instance.destroy).toHaveBeenCalledOnce();
});

it("enhances dynamically mounted canvas portals and releases their instances when removed", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => frames.push(callback)),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  render(<CanvasScrollbars />);
  const portal = document.createElement("div");
  portal.className = "excalidraw";
  const list = document.createElement("div");
  list.style.overflowY = "auto";
  portal.appendChild(list);
  await act(async () => {
    document.body.appendChild(portal);
  });
  await act(async () => {
    for (const frame of frames.splice(0)) frame(0);
  });
  expect(library.initialize).toHaveBeenCalledWith(
    { target: list, elements: { viewport: list } },
    expect.anything(),
  );
  const instance = library.initialize.mock.results[0]?.value;
  await act(async () => {
    portal.remove();
  });
  await act(async () => {
    for (const frame of frames.splice(0)) frame(0);
  });
  expect(instance.destroy).toHaveBeenCalledOnce();
});
