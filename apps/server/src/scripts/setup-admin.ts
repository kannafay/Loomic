import { randomBytes } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadServerEnv } from "../config/env.js";
import { createAdminSupabaseClient } from "../supabase/admin.js";

async function main() {
  const email = process.argv[2]?.trim();
  if (!email)
    throw new Error("用法：pnpm --filter @loomic/server admin:setup 用户邮箱");
  const env = loadServerEnv();
  const admin = createAdminSupabaseClient(env);
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,display_name")
    .eq("email", email)
    .single();
  if (error || !profile) throw new Error("找不到此账号，请先注册并登录一次。");
  if (!env.modelConfigSecret) {
    const { count, error: readError } = await admin
      .from("model_providers")
      .select("id", { count: "exact" })
      .limit(0);
    if (readError) throw new Error("请先应用模型配置数据库迁移。");
    if (count)
      throw new Error(
        "已有加密配置，请恢复原 LOOMIC_CONFIG_SECRET，不能生成新密钥。",
      );
    const path = resolve(process.cwd(), "../../.env.local");
    const content = await readFile(path, "utf8");
    if (/^LOOMIC_CONFIG_SECRET=\S+/m.test(content))
      throw new Error("配置文件已有加密密钥，请重新加载环境变量后再试。");
    const setting = `LOOMIC_CONFIG_SECRET=${randomBytes(32).toString("base64")}`;
    await writeFile(
      path,
      /^LOOMIC_CONFIG_SECRET=.*$/m.test(content)
        ? content.replace(/^LOOMIC_CONFIG_SECRET=.*$/m, setting)
        : `${content}\n${setting}\n`,
    );
  }
  const { error: roleError } = await admin.rpc("set_system_user_role", {
    p_user_id: profile.id,
    p_role: "admin",
  });
  if (roleError) throw new Error("设置管理员失败，请检查数据库迁移。");
  console.log(
    `${profile.display_name ?? "此账号"} 已设为管理员。重启 API 和 Worker 后可访问 /admin。`,
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "设置失败。");
  process.exitCode = 1;
});
