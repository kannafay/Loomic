import { z } from "zod";
import { systemRoleSchema } from "./model-config-contracts.js";

export const adminUserUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "请输入姓名。")
      .max(100, "姓名不能超过 100 个字符。"),
    email: z
      .string()
      .trim()
      .email("请输入有效的邮箱。")
      .max(254, "邮箱过长。")
      .transform((value) => value.toLowerCase()),
    role: systemRoleSchema,
  })
  .strict();
export const adminUserCreateSchema = adminUserUpdateSchema.extend({
  password: z
    .string()
    .min(6, "初始密码至少需要 6 位。")
    .max(72, "初始密码不能超过 72 个字符。"),
});
export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>;
export type AdminUserCreate = z.infer<typeof adminUserCreateSchema>;
export type AdminUser = AdminUserUpdate & { id: string };
