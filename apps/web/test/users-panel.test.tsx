import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UsersPanel } from "../src/app/(workspace)/admin/users-panel";
import { ToastProvider } from "../src/components/toast";
import type { AdminUser } from "../src/lib/model-admin-api";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  refreshRole: vi.fn(),
}));
vi.mock("../src/lib/model-admin-api", () => ({
  fetchAdminUsers: api.list,
  updateSystemRole: api.update,
}));
const users: AdminUser[] = [
  { id: "admin", name: "林管理员", email: "lin@example.test", role: "admin" },
  { id: "member", name: "陈成员", email: "chen@example.test", role: "user" },
  {
    id: "other-admin",
    name: "周管理员",
    email: "zhou@example.test",
    role: "admin",
  },
];

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  api.list.mockReset().mockResolvedValue({ users });
  api.update.mockReset().mockResolvedValue(undefined);
  api.refreshRole.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function page() {
  return render(
    <ToastProvider>
      <UsersPanel
        token="token"
        currentUserId="admin"
        onSelfRoleChanged={api.refreshRole}
      />
    </ToastProvider>,
  );
}
async function chooseRole(
  user: ReturnType<typeof userEvent.setup>,
  role: string,
) {
  const dialog = screen.getByRole("dialog", { name: "修改用户角色" });
  await user.click(within(dialog).getByRole("combobox", { name: "用户角色" }));
  await user.click(await screen.findByRole("option", { name: role }));
  return dialog;
}

it("combines name and email, identifies the current account and filters by both search and role", async () => {
  const user = userEvent.setup();
  page();
  const member = await screen.findByRole("row", { name: /陈成员/ });
  expect(within(member).getByText("chen@example.test")).toBeInTheDocument();
  expect(
    within(screen.getByRole("row", { name: /林管理员/ })).getByText("当前账号"),
  ).toBeInTheDocument();
  await user.type(
    screen.getByRole("textbox", { name: "搜索用户" }),
    " CHEN@EXAMPLE ",
  );
  expect(screen.getByRole("row", { name: /陈成员/ })).toBeInTheDocument();
  expect(
    screen.queryByRole("row", { name: /林管理员/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "筛选用户角色" }));
  await user.click(await screen.findByRole("option", { name: "管理员" }));
  expect(screen.getByText("没有找到匹配的用户")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "清除筛选" }));
  expect(screen.getByRole("row", { name: /陈成员/ })).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /林管理员/ })).toBeInTheDocument();
  expect(api.list).toHaveBeenCalledTimes(1);
});

it("paginates locally and resets the page after filtering", async () => {
  api.list.mockResolvedValue({
    users: Array.from({ length: 12 }, (_, index) => ({
      id: `user-${index}`,
      name: `成员 ${index}`,
      email: `member${index}@example.test`,
      role: "user",
    })),
  });
  const user = userEvent.setup();
  page();
  await screen.findByRole("row", { name: /成员 0 / });
  expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "下一页" }));
  expect(screen.getByRole("row", { name: /成员 10 / })).toBeInTheDocument();
  expect(
    screen.queryByRole("row", { name: /成员 0 / }),
  ).not.toBeInTheDocument();
  await user.type(
    screen.getByRole("textbox", { name: "搜索用户" }),
    "member0@",
  );
  expect(screen.getByRole("row", { name: /成员 0 / })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "下一页" }),
  ).not.toBeInTheDocument();
});

it("keeps list loading failures inline and supports retry without an empty-state flash", async () => {
  api.list.mockRejectedValueOnce(new Error("用户列表读取失败。"));
  const user = userEvent.setup();
  page();
  expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "用户列表读取失败",
  );
  expect(screen.getByRole("alert")).not.toHaveAttribute("data-slot", "toast");
  expect(screen.queryByText("暂无用户")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重试" }));
  expect(
    await screen.findByRole("row", { name: /陈成员/ }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("discards a cancelled role draft without sending a permission change", async () => {
  const user = userEvent.setup();
  page();
  await user.click(
    await screen.findByRole("button", { name: "修改 陈成员 的角色" }),
  );
  expect(screen.getByRole("button", { name: "保存更改" })).toBeDisabled();
  const dialog = await chooseRole(user, "管理员");
  expect(api.update).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "修改 陈成员 的角色" }));
  expect(screen.getByRole("combobox", { name: "用户角色" })).toHaveTextContent(
    "普通用户",
  );
  expect(api.update).not.toHaveBeenCalled();
});

it("saves only on confirmation, prevents dismissal while saving and updates the row after success", async () => {
  let finish: (() => void) | undefined;
  api.update.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  page();
  await user.click(
    await screen.findByRole("button", { name: "修改 陈成员 的角色" }),
  );
  const dialog = await chooseRole(user, "管理员");
  await user.click(within(dialog).getByRole("button", { name: "保存更改" }));
  expect(api.update).toHaveBeenCalledExactlyOnceWith(
    "token",
    "member",
    "admin",
  );
  expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(dialog).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => finish?.());
  expect(await screen.findByRole("status")).toHaveTextContent("用户角色已更新");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    within(screen.getByRole("row", { name: /陈成员/ })).getAllByText("管理员"),
  ).toHaveLength(2);
  expect(api.refreshRole).not.toHaveBeenCalled();
  expect(api.list).toHaveBeenCalledTimes(1);
});

it("retains the role draft after a rejected last-admin change and permits retry", async () => {
  api.update.mockRejectedValueOnce(
    new Error("角色修改失败；系统必须保留至少一位管理员。"),
  );
  const user = userEvent.setup();
  page();
  await user.click(
    await screen.findByRole("button", { name: "修改 林管理员 的角色" }),
  );
  const dialog = await chooseRole(user, "普通用户");
  expect(within(dialog).getByText(/你将失去后台访问权限/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "保存更改" }));
  const toast = await screen.findByRole("alert");
  expect(toast).toHaveAttribute("data-slot", "toast");
  expect(toast).toHaveTextContent("系统必须保留至少一位管理员");
  expect(dialog).toBeVisible();
  expect(within(dialog).getByRole("combobox")).toHaveTextContent("普通用户");
  expect(api.refreshRole).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "保存更改" }));
  expect(await screen.findByRole("status")).toHaveTextContent("用户角色已更新");
  expect(api.refreshRole).toHaveBeenCalledExactlyOnceWith();
  expect(api.update).toHaveBeenCalledTimes(2);
});

it("ignores an old account's delayed user list after the token changes", async () => {
  let finish: ((value: { users: AdminUser[] }) => void) | undefined;
  api.list.mockImplementationOnce(
    () =>
      new Promise<{ users: AdminUser[] }>((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = page();
  rerender(
    <ToastProvider>
      <UsersPanel
        token="new-token"
        currentUserId="other-admin"
        onSelfRoleChanged={api.refreshRole}
      />
    </ToastProvider>,
  );
  await screen.findByRole("row", { name: /陈成员/ });
  await act(async () => finish?.({ users: [] }));
  expect(screen.getByRole("row", { name: /陈成员/ })).toBeInTheDocument();
});
