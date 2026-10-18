import "@testing-library/jest-dom/vitest";
import type { AdminUserCreate, AdminUserUpdate } from "@loomic/shared";
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
  create: vi.fn(),
  delete: vi.fn(),
  refreshRole: vi.fn(),
}));
vi.mock("../src/lib/model-admin-api", () => ({
  fetchAdminUsers: api.list,
  updateAdminUser: api.update,
  createAdminUser: api.create,
  deleteAdminUser: api.delete,
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
  api.delete.mockReset().mockResolvedValue({ ok: true });
  api.update
    .mockReset()
    .mockImplementation(
      async (_token: string, id: string, value: AdminUserUpdate) => ({
        user: { id, ...value },
      }),
    );
  api.create
    .mockReset()
    .mockImplementation(async (_token: string, value: AdminUserCreate) => ({
      user: {
        id: "new-user",
        name: value.name,
        email: value.email,
        role: value.role,
      },
    }));
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
  const dialog = screen.getByRole("dialog", { name: "编辑用户" });
  await user.click(within(dialog).getByRole("combobox", { name: "用户角色" }));
  await user.click(await screen.findByRole("option", { name: role }));
  return dialog;
}

async function fillNewUser(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("姓名"), "新成员");
  await user.type(
    screen.getByLabelText("邮箱", { exact: true }),
    " NEW@example.test ",
  );
  await user.type(screen.getByLabelText("初始密码"), "test-password-1");
}

it("requires confirmation, identifies the target and safely cancels deletion", async () => {
  const user = userEvent.setup();
  page();
  expect(
    await screen.findByRole("button", { name: "删除 林管理员" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "删除 陈成员" }));
  const dialog = screen.getByRole("dialog", { name: "删除用户" });
  expect(within(dialog).getByText("陈成员")).toBeVisible();
  expect(within(dialog).getByText("chen@example.test")).toBeVisible();
  expect(within(dialog).getByText(/无法恢复/)).toBeVisible();
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus(),
  );
  expect(api.delete).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "删除 陈成员" }));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(api.delete).not.toHaveBeenCalled();
  expect(screen.getByRole("row", { name: /陈成员/ })).toBeVisible();
});

it("blocks repeated submissions and dismissal until deletion completes, then removes the row", async () => {
  let finish: (() => void) | undefined;
  api.delete.mockImplementationOnce(
    () =>
      new Promise<{ ok: true }>((resolve) => {
        finish = () => resolve({ ok: true });
      }),
  );
  const user = userEvent.setup();
  page();
  await user.click(await screen.findByRole("button", { name: "删除 陈成员" }));
  const dialog = screen.getByRole("dialog", { name: "删除用户" });
  await user.click(within(dialog).getByRole("button", { name: "确认删除" }));
  expect(api.delete).toHaveBeenCalledExactlyOnceWith("token", "member");
  expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
  const pending = within(dialog).getByRole("button", { name: "正在删除…" });
  expect(pending).toBeDisabled();
  await user.click(pending);
  await user.keyboard("{Escape}");
  expect(dialog).toBeVisible();
  expect(api.delete).toHaveBeenCalledTimes(1);
  await act(async () => finish?.());
  expect(await screen.findByRole("status")).toHaveTextContent("用户已删除");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("row", { name: /陈成员/ })).not.toBeInTheDocument();
  expect(screen.getByText("共 2 位用户，2 位管理员")).toBeVisible();
});

it("keeps the account and confirmation after a rejected deletion and allows retry", async () => {
  api.delete.mockRejectedValueOnce(
    new Error("用户删除失败，请刷新列表后重试。"),
  );
  const user = userEvent.setup();
  page();
  await user.click(await screen.findByRole("button", { name: "删除 陈成员" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("用户删除失败");
  expect(screen.getByRole("dialog", { name: "删除用户" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(await screen.findByRole("status")).toHaveTextContent("用户已删除");
  expect(api.delete).toHaveBeenCalledTimes(2);
});

it("returns to the previous page when its last row is deleted", async () => {
  api.list.mockResolvedValue({
    users: Array.from({ length: 11 }, (_, index) => ({
      id: `user-${index}`,
      name: `成员 ${index}`,
      email: `member${index}@example.test`,
      role: "user",
    })),
  });
  const user = userEvent.setup();
  page();
  await screen.findByRole("row", { name: /成员 0 / });
  await user.click(screen.getByRole("button", { name: "下一页" }));
  await user.click(screen.getByRole("button", { name: "删除 成员 10" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("row", { name: /成员 0 / })).toBeVisible();
  expect(screen.queryByText("暂无用户")).not.toBeInTheDocument();
});

it("validates new-user fields inline and defaults to an ordinary user", async () => {
  const user = userEvent.setup();
  page();
  await screen.findByRole("row", { name: /陈成员/ });
  await user.click(screen.getByRole("button", { name: "添加用户" }));
  const dialog = await screen.findByRole("dialog", { name: "添加用户" });
  expect(
    within(dialog).getByRole("combobox", { name: "用户角色" }),
  ).toHaveTextContent("普通用户");
  await user.click(within(dialog).getByRole("button", { name: "创建用户" }));
  expect(within(dialog).getByText("请输入姓名。")).toBeInTheDocument();
  expect(within(dialog).getByText("请输入有效的邮箱。")).toBeInTheDocument();
  expect(
    within(dialog).getByText("初始密码至少需要 6 位。"),
  ).toBeInTheDocument();
  expect(api.create).not.toHaveBeenCalled();
});

it("creates only after confirmation, keeps the pending dialog open and reveals the new row", async () => {
  let finish: (() => void) | undefined;
  api.create.mockImplementationOnce(
    (_token: string, value: AdminUserCreate) =>
      new Promise<{ user: AdminUser }>((resolve) => {
        finish = () =>
          resolve({
            user: {
              id: "new-user",
              name: value.name,
              email: value.email,
              role: value.role,
            },
          });
      }),
  );
  const user = userEvent.setup();
  page();
  await screen.findByRole("row", { name: /陈成员/ });
  await user.type(screen.getByRole("textbox", { name: "搜索用户" }), "陈成员");
  await user.click(screen.getByRole("button", { name: "添加用户" }));
  await fillNewUser(user);
  expect(screen.getByLabelText("初始密码")).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "显示密码" }));
  expect(screen.getByLabelText("初始密码")).toHaveAttribute("type", "text");
  expect(api.create).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "创建用户" }));
  expect(api.create).toHaveBeenCalledExactlyOnceWith("token", {
    name: "新成员",
    email: "new@example.test",
    password: "test-password-1",
    role: "user",
  });
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "添加用户" })).toBeInTheDocument();
  await act(async () => finish?.());
  expect(await screen.findByRole("status")).toHaveTextContent("用户已创建");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("row", { name: /新成员/ })).toHaveTextContent(
    "new@example.test",
  );
  expect(screen.getByRole("textbox", { name: "搜索用户" })).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "添加用户" }));
  expect(screen.getByLabelText("初始密码")).toHaveValue("");
  expect(screen.getByLabelText("姓名")).toHaveValue("");
});

it("retains new-user input after an occupied email error and supports retry", async () => {
  api.create.mockRejectedValueOnce(new Error("该邮箱已被使用，请更换邮箱。"));
  const user = userEvent.setup();
  page();
  await screen.findByRole("row", { name: /陈成员/ });
  await user.click(screen.getByRole("button", { name: "添加用户" }));
  await fillNewUser(user);
  await user.click(screen.getByRole("button", { name: "创建用户" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("该邮箱已被使用");
  expect(screen.getByLabelText("姓名")).toHaveValue("新成员");
  expect(screen.getByLabelText("初始密码")).toHaveValue("test-password-1");
  await user.clear(screen.getByLabelText("邮箱", { exact: true }));
  await user.type(
    screen.getByLabelText("邮箱", { exact: true }),
    "another@example.test",
  );
  await user.click(screen.getByRole("button", { name: "创建用户" }));
  expect(await screen.findByRole("status")).toHaveTextContent("用户已创建");
  expect(api.create).toHaveBeenCalledTimes(2);
});

it("edits a user's name and login email without submitting a password", async () => {
  const user = userEvent.setup();
  page();
  await user.click(await screen.findByRole("button", { name: "编辑 陈成员" }));
  expect(screen.queryByLabelText("初始密码")).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("姓名"));
  await user.type(screen.getByLabelText("姓名"), "更新的成员");
  await user.clear(screen.getByLabelText("邮箱", { exact: true }));
  await user.type(
    screen.getByLabelText("邮箱", { exact: true }),
    "renamed@example.test",
  );
  await user.click(screen.getByRole("button", { name: "保存更改" }));
  expect(api.update).toHaveBeenCalledExactlyOnceWith("token", "member", {
    name: "更新的成员",
    email: "renamed@example.test",
    role: "user",
  });
  expect(await screen.findByRole("status")).toHaveTextContent("用户信息已更新");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("row", { name: /更新的成员/ })).toHaveTextContent(
    "renamed@example.test",
  );
});

it("syncs the signed-in account after its profile changes", async () => {
  const refreshProfile = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <UsersPanel
        token="token"
        currentUserId="admin"
        onSelfRoleChanged={api.refreshRole}
        onSelfProfileChanged={refreshProfile}
      />
    </ToastProvider>,
  );
  await user.click(
    await screen.findByRole("button", { name: "编辑 林管理员" }),
  );
  await user.clear(screen.getByLabelText("姓名"));
  await user.type(screen.getByLabelText("姓名"), "新管理员姓名");
  await user.click(screen.getByRole("button", { name: "保存更改" }));
  expect(await screen.findByRole("status")).toHaveTextContent("用户信息已更新");
  expect(refreshProfile).toHaveBeenCalledExactlyOnceWith();
  expect(api.refreshRole).not.toHaveBeenCalled();
});

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
  await user.click(await screen.findByRole("button", { name: "编辑 陈成员" }));
  expect(screen.getByRole("button", { name: "保存更改" })).toBeDisabled();
  const dialog = await chooseRole(user, "管理员");
  expect(api.update).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "编辑 陈成员" }));
  expect(screen.getByRole("combobox", { name: "用户角色" })).toHaveTextContent(
    "普通用户",
  );
  expect(api.update).not.toHaveBeenCalled();
});

it("saves only on confirmation, prevents dismissal while saving and updates the row after success", async () => {
  let finish: (() => void) | undefined;
  api.update.mockImplementationOnce(
    (_token: string, id: string, value: AdminUserUpdate) =>
      new Promise<{ user: AdminUser }>((resolve) => {
        finish = () => resolve({ user: { id, ...value } });
      }),
  );
  const user = userEvent.setup();
  page();
  await user.click(await screen.findByRole("button", { name: "编辑 陈成员" }));
  const dialog = await chooseRole(user, "管理员");
  await user.click(within(dialog).getByRole("button", { name: "保存更改" }));
  expect(api.update).toHaveBeenCalledExactlyOnceWith("token", "member", {
    name: "陈成员",
    email: "chen@example.test",
    role: "admin",
  });
  expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(dialog).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => finish?.());
  expect(await screen.findByRole("status")).toHaveTextContent("用户信息已更新");
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
    await screen.findByRole("button", { name: "编辑 林管理员" }),
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
  expect(await screen.findByRole("status")).toHaveTextContent("用户信息已更新");
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
