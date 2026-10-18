import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SkillsPage from "../src/app/(workspace)/skills/page";
import { ImportPanel } from "../src/components/skills/import-panel";
import { ToastProvider } from "../src/components/toast";
import { PageDataProvider } from "../src/lib/page-data-context";

const api = vi.hoisted(() => ({
  importSkill: vi.fn(),
  createSkill: vi.fn(),
  toggleSkill: vi.fn(),
  fetchSkills: vi.fn(),
  fetchWorkspaceSkills: vi.fn(),
}));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "token" } }),
}));
vi.mock("../src/lib/server-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/server-api")>()),
  importSkillFromUrl: api.importSkill,
  createSkill: api.createSkill,
  toggleSkill: api.toggleSkill,
  fetchSkills: api.fetchSkills,
  fetchWorkspaceSkills: api.fetchWorkspaceSkills,
}));

const skill = {
  id: "skill-a",
  name: "分镜助手",
  slug: "storyboard",
  description: "规划分镜",
  author: "测试",
  version: "1.0.0",
  category: "design",
  iconName: null,
  source: "user",
  isFeatured: false,
  metadata: {},
  createdAt: "2026-10-17T00:00:00Z",
  updatedAt: "2026-10-17T00:00:00Z",
  enabled: true,
};
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  api.importSkill.mockReset().mockResolvedValue({ skill });
  api.createSkill.mockReset().mockResolvedValue({ skill });
  api.toggleSkill.mockReset().mockResolvedValue(undefined);
  api.fetchSkills.mockReset().mockResolvedValue({ skills: [skill] });
  api.fetchWorkspaceSkills.mockReset().mockResolvedValue({ skills: [skill] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function page() {
  return render(
    <ToastProvider>
      <PageDataProvider>
        <SkillsPage />
      </PageDataProvider>
    </ToastProvider>,
  );
}

it("keeps URL validation inline and imports with one toast and a fresh input", async () => {
  const user = userEvent.setup();
  const refreshed = vi.fn().mockResolvedValue(undefined);
  const switchTab = vi.fn();
  render(
    <ToastProvider>
      <ImportPanel
        accessToken={() => "token"}
        onImported={refreshed}
        onSwitchToInstalled={switchTab}
      />
    </ToastProvider>,
  );
  const input = screen.getByRole("textbox", { name: "技能 URL" });
  await user.type(input, "invalid-url");
  await user.click(screen.getByRole("button", { name: /^导入$/ }));
  const validation = await screen.findByRole("alert");
  expect(validation).toHaveTextContent("请输入有效的 URL");
  expect(validation).not.toHaveAttribute("data-slot", "toast");
  expect(api.importSkill).not.toHaveBeenCalled();
  await user.clear(input);
  await user.type(input, "https://example.test/skill.tgz");
  await user.click(screen.getByRole("button", { name: /^导入$/ }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    '技能 "分镜助手" 导入成功',
  );
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(input).toHaveValue("");
  expect(refreshed).toHaveBeenCalledOnce();
  expect(screen.queryByText("已导入", { exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "查看已安装" }));
  expect(switchTab).toHaveBeenCalledOnce();
});

it("shows import failures once, retains the URL and allows retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  api.importSkill.mockRejectedValueOnce(new Error("unavailable"));
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <ImportPanel
        accessToken={() => "token"}
        onImported={vi.fn().mockResolvedValue(undefined)}
      />
    </ToastProvider>,
  );
  const input = screen.getByRole("textbox", { name: "技能 URL" });
  await user.type(input, "https://example.test/skill.tgz");
  await user.click(screen.getByRole("button", { name: /^导入$/ }));
  const notification = await screen.findByRole("alert");
  expect(notification).toHaveAttribute("data-slot", "toast");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(input).toHaveValue("https://example.test/skill.tgz");
  await user.click(screen.getByRole("button", { name: /^导入$/ }));
  expect(await screen.findByRole("status")).toHaveTextContent("导入成功");
  expect(api.importSkill).toHaveBeenCalledTimes(2);
});

it("reports a post-import refresh failure without claiming the import failed", async () => {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <ImportPanel
        accessToken={() => "token"}
        onImported={vi.fn().mockRejectedValue(new Error("refresh failed"))}
      />
    </ToastProvider>,
  );
  await user.type(
    screen.getByRole("textbox", { name: "技能 URL" }),
    "https://example.test/skill.tgz",
  );
  await user.click(screen.getByRole("button", { name: /^导入$/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "技能已导入，但列表刷新失败",
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("keeps the skill draft open on failure and closes only after successful retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  api.createSkill.mockRejectedValueOnce(new Error("create failed"));
  const user = userEvent.setup();
  page();
  await user.click(await screen.findByRole("button", { name: /^添加$/ }));
  const dialog = await screen.findByRole("dialog", { name: "添加自定义技能" });
  await user.type(within(dialog).getByLabelText("名称"), "新分镜助手");
  await user.type(within(dialog).getByLabelText("描述"), "帮助规划故事分镜");
  await user.click(within(dialog).getByRole("button", { name: "使用模板" }));
  await user.click(within(dialog).getByRole("button", { name: "创建" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("技能创建失败");
  expect(dialog).toBeVisible();
  expect(within(dialog).getByLabelText("名称")).toHaveValue("新分镜助手");
  await user.click(screen.getByRole("button", { name: "关闭通知" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(dialog).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "创建" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("技能已创建");
  expect(api.createSkill).toHaveBeenCalledTimes(2);
});

it("rolls back a failed skill toggle and shows a toast when retry succeeds", async () => {
  api.toggleSkill.mockRejectedValueOnce(new Error("toggle failed"));
  const user = userEvent.setup();
  page();
  const toggle = await screen.findByRole("switch", { name: "启用 分镜助手" });
  await user.click(toggle);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "技能状态更新失败",
  );
  expect(toggle).toBeChecked();
  await user.click(toggle);
  expect(await screen.findByRole("status")).toHaveTextContent("技能已停用");
  expect(toggle).not.toBeChecked();
});
