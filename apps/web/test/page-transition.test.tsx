import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { PageTransition } from "../src/components/page-transition";

const navigation = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

const originalAnimate = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "animate",
);
const animations: { cancel: ReturnType<typeof vi.fn> }[] = [];
const animate = vi.fn(
  (
    _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    _options?: number | KeyframeAnimationOptions,
  ) => {
    const animation = { cancel: vi.fn() };
    animations.push(animation);
    return animation as unknown as Animation;
  },
);
let reduceMotion = false;
const motionListeners = new Set<() => void>();

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
});
beforeEach(() => {
  vi.clearAllMocks();
  navigation.pathname = "/home";
  reduceMotion = false;
  animations.length = 0;
  motionListeners.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return reduceMotion;
      },
      addEventListener: (_event: string, listener: () => void) =>
        motionListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) =>
        motionListeners.delete(listener),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
afterAll(() => {
  if (originalAnimate) {
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
});

function page(title = "首页") {
  return (
    <PageTransition>
      <h1>{title}</h1>
      <input aria-label="草稿" defaultValue="已有草稿" />
    </PageTransition>
  );
}

it("animates route changes without hiding content, remounting the frame, or replaying on data updates", () => {
  const view = render(page());
  const draft = screen.getByRole("textbox", { name: "草稿" });
  const frame = draft.parentElement;
  expect(animate).not.toHaveBeenCalled();

  navigation.pathname = "/projects";
  view.rerender(page("项目"));
  expect(screen.getByRole("heading", { name: "项目" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "草稿" })).toBe(draft);
  expect(draft).toHaveValue("已有草稿");
  expect(draft.parentElement).toBe(frame);
  expect(animate).toHaveBeenCalledOnce();
  const keyframes = animate.mock.calls[0]?.[0];
  expect(keyframes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ transform: expect.any(String) }),
    ]),
  );
  if (Array.isArray(keyframes)) {
    for (const keyframe of keyframes) {
      expect(keyframe).not.toHaveProperty("opacity");
    }
  }

  view.rerender(page("项目数据已更新"));
  expect(animate).toHaveBeenCalledOnce();
});

it("keeps content visible without animation when reduced motion is enabled", () => {
  reduceMotion = true;
  const view = render(page());
  navigation.pathname = "/projects";
  view.rerender(page("项目"));
  expect(animate).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "项目" })).toBeVisible();
});

it("cancels superseded transitions and stops motion when the preference changes", () => {
  const view = render(page());
  navigation.pathname = "/projects";
  view.rerender(page("项目"));
  navigation.pathname = "/settings";
  view.rerender(page("设置"));
  expect(animate).toHaveBeenCalledTimes(2);
  expect(animations[0]?.cancel).toHaveBeenCalledOnce();

  reduceMotion = true;
  act(() => {
    for (const listener of motionListeners) listener();
  });
  expect(animations[1]?.cancel).toHaveBeenCalledOnce();
  view.unmount();
  expect(motionListeners.size).toBe(0);
});
