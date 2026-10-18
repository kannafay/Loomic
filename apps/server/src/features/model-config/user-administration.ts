import {
  type AdminUser,
  type AdminUserCreate,
  type AdminUserUpdate,
  type SystemRole,
  adminUserCreateSchema,
  adminUserUpdateSchema,
} from "@loomic/shared";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { ModelConfigError } from "./errors.js";

function authError(
  error: { code?: string | undefined; status?: number | undefined } | null,
) {
  if (error?.code === "email_exists" || error?.code === "user_already_exists")
    return new ModelConfigError("该邮箱已被使用，请更换邮箱。", 409);
  if (error?.code === "weak_password")
    return new ModelConfigError("初始密码不符合要求，请使用更强的密码。", 400);
  if (error?.code === "email_address_invalid")
    return new ModelConfigError("请输入有效的邮箱。", 400);
  if (error?.code === "user_not_found" || error?.status === 404)
    return new ModelConfigError("用户不存在，请刷新列表。", 404);
  return new ModelConfigError("账号服务暂时不可用，请稍后重试。", 503);
}

export async function createManagedUser(
  client: AdminSupabaseClient,
  input: AdminUserCreate,
): Promise<AdminUser> {
  const value = adminUserCreateSchema.parse(input);
  const { data, error } = await client.auth.admin.createUser({
    email: value.email,
    password: value.password,
    email_confirm: true,
    user_metadata: { display_name: value.name },
  });
  if (error || !data.user) throw authError(error);
  const id = data.user.id;
  try {
    // The auth trigger can swallow bootstrap failures; explicitly verify initialization.
    const bootstrap = await client.rpc("bootstrap_viewer", {
      p_user_id: id,
      p_email: value.email,
      p_user_meta: { display_name: value.name },
    });
    if (bootstrap.error)
      throw new ModelConfigError("用户初始化失败，请重试。", 503);
    const role = await client.rpc("set_system_user_role", {
      p_user_id: id,
      p_role: value.role,
    });
    if (role.error)
      throw new ModelConfigError("用户角色保存失败，请重试。", 503);
  } catch (err) {
    // Compensate only for the account created by this request, never an existing user.
    try {
      const rollback = await client.auth.admin.deleteUser(id);
      if (rollback.error) throw rollback.error;
    } catch {
      throw new ModelConfigError(
        "账号已创建，但初始化失败且未能回退，请刷新列表并核对账号。",
        503,
      );
    }
    throw err;
  }
  return { id, name: value.name, email: value.email, role: value.role };
}

export async function updateManagedUser(
  client: AdminSupabaseClient,
  id: string,
  currentRole: SystemRole,
  input: AdminUserUpdate,
): Promise<AdminUser> {
  const value = adminUserUpdateSchema.parse(input);
  const [auth, profile] = await Promise.all([
    client.auth.admin.getUserById(id),
    client
      .from("profiles")
      .select("display_name,email")
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (auth.error || !auth.data.user) throw authError(auth.error);
  if (profile.error)
    throw new ModelConfigError("用户资料读取失败，请重试。", 503);
  if (!profile.data)
    throw new ModelConfigError("用户不存在，请刷新列表。", 404);

  const previousUser = auth.data.user;
  const previousEmail = previousUser.email;
  if (!previousEmail)
    throw new ModelConfigError("该账号没有登录邮箱，暂不支持在此编辑。");
  const previousProfile = profile.data;
  const updated = await client.auth.admin.updateUserById(id, {
    email: value.email,
    user_metadata: { display_name: value.name },
  });
  if (updated.error || !updated.data.user) throw authError(updated.error);
  try {
    const result = await client
      .from("profiles")
      .update({
        display_name: value.name,
        email: value.email,
      })
      .eq("id", id)
      .select("id")
      .single();
    if (result.error)
      throw new ModelConfigError("用户资料保存失败，请重试。", 503);
    // Grant/revoke permissions last, after the login identity and profile are saved.
    if (currentRole !== value.role) {
      const role = await client.rpc("set_system_user_role", {
        p_user_id: id,
        p_role: value.role,
      });
      if (role.error)
        throw new ModelConfigError(
          "角色修改失败；系统必须保留至少一位管理员。",
        );
    }
  } catch (err) {
    const rollbacks = await Promise.allSettled([
      client.auth.admin.updateUserById(id, {
        email: previousEmail,
        user_metadata: {
          display_name: previousUser.user_metadata.display_name ?? null,
        },
      }),
      client
        .from("profiles")
        .update(previousProfile)
        .eq("id", id)
        .select("id")
        .single(),
    ]);
    if (
      rollbacks.some(
        (result) => result.status === "rejected" || result.value.error,
      )
    )
      throw new ModelConfigError(
        "用户资料未完全保存，请刷新列表核对后重试。",
        503,
      );
    throw err;
  }
  return { id, ...value };
}
