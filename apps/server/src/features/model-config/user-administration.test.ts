import { describe, expect, it, vi } from "vitest";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { createModelConfigService } from "./model-config-service.js";
import { createManagedUser, updateManagedUser } from "./user-administration.js";

const id = "11111111-1111-4111-8111-111111111111";
const value = {
  name: "新成员",
  email: "new@example.test",
  role: "user" as const,
};
const creation = { ...value, password: "test-password-1" };
const previousProfile = { display_name: "原姓名", email: "old@example.test" };
function setup() {
  const auth = {
    createUser: vi
      .fn()
      .mockResolvedValue({ data: { user: { id } }, error: null }),
    deleteUser: vi.fn().mockResolvedValue({ error: null }),
    getUserById: vi.fn().mockResolvedValue({
      data: {
        user: {
          id,
          email: previousProfile.email,
          user_metadata: { display_name: previousProfile.display_name },
        },
      },
      error: null,
    }),
    updateUserById: vi
      .fn()
      .mockResolvedValue({ data: { user: { id } }, error: null }),
  };
  const profile = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: previousProfile, error: null }),
    single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
  };
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => profile);
  const client = {
    auth: { admin: auth },
    from,
    rpc,
  } as unknown as AdminSupabaseClient;
  return { client, auth, profile, rpc, from };
}

describe("managed users", () => {
  it.each(["user", "admin"] as const)(
    "creates a %s account with its profile/workspace and returns no password",
    async (role) => {
      const { client, auth, rpc } = setup();
      const result = await createManagedUser(client, { ...creation, role });
      expect(auth.createUser).toHaveBeenCalledWith({
        email: value.email,
        password: creation.password,
        email_confirm: true,
        user_metadata: { display_name: value.name },
      });
      expect(rpc).toHaveBeenNthCalledWith(1, "bootstrap_viewer", {
        p_user_id: id,
        p_email: value.email,
        p_user_meta: { display_name: value.name },
      });
      expect(rpc).toHaveBeenNthCalledWith(2, "set_system_user_role", {
        p_user_id: id,
        p_role: role,
      });
      expect(result).toEqual({ id, ...value, role });
      expect(JSON.stringify(result)).not.toContain(creation.password);
    },
  );
  it("rejects a duplicate email without touching an existing account", async () => {
    const { client, auth, rpc } = setup();
    auth.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "email_exists", message: "private-fixture" },
    });
    await expect(createManagedUser(client, creation)).rejects.toMatchObject({
      statusCode: 409,
      message: "该邮箱已被使用，请更换邮箱。",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
  it.each([1, 2])(
    "removes only the newly created account when initialization step %i fails",
    async (step) => {
      const { client, auth, rpc } = setup();
      if (step === 2) rpc.mockResolvedValueOnce({ error: null });
      rpc.mockResolvedValueOnce({ error: { message: "private-fixture" } });
      await expect(createManagedUser(client, creation)).rejects.toMatchObject({
        statusCode: 503,
      });
      expect(auth.deleteUser).toHaveBeenCalledExactlyOnceWith(id);
    },
  );
  it("reports an incomplete creation when compensating deletion fails", async () => {
    const { client, auth, rpc } = setup();
    rpc.mockRejectedValueOnce(new Error("private-fixture"));
    auth.deleteUser.mockResolvedValueOnce({
      error: new Error("private-fixture"),
    });
    await expect(createManagedUser(client, creation)).rejects.toMatchObject({
      statusCode: 503,
      message: "账号已创建，但初始化失败且未能回退，请刷新列表并核对账号。",
    });
  });
  it("saves auth and profile data before granting the requested role", async () => {
    const { client, auth, profile, rpc } = setup();
    const result = await updateManagedUser(client, id, "user", {
      ...value,
      role: "admin",
    });
    expect(auth.updateUserById).toHaveBeenCalledExactlyOnceWith(id, {
      email: value.email,
      user_metadata: { display_name: value.name },
    });
    expect(profile.update).toHaveBeenCalledWith({
      display_name: value.name,
      email: value.email,
    });
    expect(rpc).toHaveBeenCalledWith("set_system_user_role", {
      p_user_id: id,
      p_role: "admin",
    });
    expect(auth.updateUserById.mock.invocationCallOrder[0]).toBeLessThan(
      profile.update.mock.invocationCallOrder[0] ?? 0,
    );
    expect(profile.update.mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[0] ?? 0,
    );
    expect(result).toEqual({ id, ...value, role: "admin" });
  });
  it("does not rewrite permissions when only the profile changes", async () => {
    const { client, rpc } = setup();
    await updateManagedUser(client, id, "user", value);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects an occupied email before changing the profile or permissions", async () => {
    const { client, auth, profile, rpc } = setup();
    auth.updateUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "email_exists" },
    });
    await expect(
      updateManagedUser(client, id, "user", value),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(profile.update).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("restores both identity and profile after a profile write fails", async () => {
    const { client, auth, profile, rpc } = setup();
    profile.single.mockResolvedValueOnce({
      error: { message: "private-fixture" },
    });
    await expect(
      updateManagedUser(client, id, "user", value),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "用户资料保存失败，请重试。",
    });
    expect(auth.updateUserById).toHaveBeenLastCalledWith(id, {
      email: previousProfile.email,
      user_metadata: { display_name: previousProfile.display_name },
    });
    expect(profile.update).toHaveBeenLastCalledWith(previousProfile);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("restores profile changes when the last-administrator guard rejects demotion", async () => {
    const { client, auth, profile, rpc } = setup();
    rpc.mockResolvedValueOnce({
      error: { message: "Cannot remove the last administrator" },
    });
    await expect(
      updateManagedUser(client, id, "admin", value),
    ).rejects.toMatchObject({
      message: "角色修改失败；系统必须保留至少一位管理员。",
    });
    expect(auth.updateUserById).toHaveBeenCalledTimes(2);
    expect(profile.update).toHaveBeenLastCalledWith(previousProfile);
  });
  it("reports partial failure if rollback cannot complete", async () => {
    const { client, auth, rpc } = setup();
    rpc.mockResolvedValueOnce({ error: { message: "private-fixture" } });
    auth.updateUserById
      .mockResolvedValueOnce({ data: { user: { id } }, error: null })
      .mockRejectedValueOnce(new Error("private-fixture"));
    await expect(
      updateManagedUser(client, id, "admin", value),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "用户资料未完全保存，请刷新列表核对后重试。",
    });
  });
  it.each(["createUser", "updateUser"] as const)(
    "checks administrator access before %s reaches account services",
    async (method) => {
      const { client, auth, from } = setup();
      const service = createModelConfigService({
        getAdminClient: () => client,
        secret: "test-secret",
      });
      vi.spyOn(service, "role").mockResolvedValue("user");
      const operation =
        method === "createUser"
          ? service.createUser("ordinary", creation)
          : service.updateUser("ordinary", id, value);
      await expect(operation).rejects.toMatchObject({ statusCode: 403 });
      expect(auth.createUser).not.toHaveBeenCalled();
      expect(auth.getUserById).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    },
  );
});
