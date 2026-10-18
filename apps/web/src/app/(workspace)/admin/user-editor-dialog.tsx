"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AdminUser,
  type AdminUserCreate,
  type AdminUserUpdate,
  adminUserCreateSchema,
  adminUserUpdateSchema,
} from "@loomic/shared";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const USER_ROLE_ITEMS = [
  { value: "user", label: "普通用户" },
  { value: "admin", label: "管理员" },
] as const;

export function UserEditorDialog({
  open,
  user,
  currentUserId,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  user: AdminUser | null;
  currentUserId: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: AdminUserCreate | AdminUserUpdate) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("user");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setPassword("");
    setShowPassword(false);
    if (open) {
      setName(user?.name ?? "");
      setEmail(user?.email ?? "");
      setRole(user?.role ?? "user");
      setErrors({});
    }
  }, [open, user]);

  const unchanged =
    !!user &&
    name.trim() === user.name &&
    email.trim().toLowerCase() === user.email &&
    role === user.role;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || unchanged) return;
    const value = { name, email, role, ...(!user ? { password } : {}) };
    const parsed = (
      user ? adminUserUpdateSchema : adminUserCreateSchema
    ).safeParse(value);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    setErrors({});
    try {
      await onSave(parsed.data);
    } catch {
      // The owner reports the operation error; retain the draft for retry.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent
        scrollable
        showCloseButton={!saving}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{user ? "编辑用户" : "添加用户"}</DialogTitle>
          <DialogDescription>
            {user
              ? "邮箱为登录账号，修改后立即生效。"
              : "创建后可使用邮箱和初始密码登录。"}
          </DialogDescription>
        </DialogHeader>
        <form ref={form} noValidate onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-user-name">姓名</Label>
            <Input
              id="admin-user-name"
              autoComplete="off"
              required
              maxLength={100}
              value={name}
              disabled={saving}
              aria-invalid={!!errors.name}
              aria-describedby={
                errors.name ? "admin-user-name-error" : undefined
              }
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: "" }));
              }}
              placeholder="填写用户姓名"
            />
            {errors.name && (
              <p
                id="admin-user-name-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {errors.name}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-user-email">邮箱</Label>
            <Input
              id="admin-user-email"
              type="email"
              autoComplete="off"
              required
              maxLength={254}
              value={email}
              disabled={saving}
              aria-invalid={!!errors.email}
              aria-describedby={
                errors.email ? "admin-user-email-error" : undefined
              }
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: "" }));
              }}
              placeholder="name@example.com"
            />
            {errors.email && (
              <p
                id="admin-user-email-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {errors.email}
              </p>
            )}
          </div>
          {!user && (
            <div className="space-y-2">
              <Label htmlFor="admin-user-password">初始密码</Label>
              <div className="relative">
                <Input
                  id="admin-user-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  maxLength={72}
                  value={password}
                  disabled={saving}
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "admin-user-password-error" : undefined
                  }
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({ ...current, password: "" }));
                  }}
                  className="pr-10"
                  placeholder="至少 6 位"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  aria-pressed={showPassword}
                  disabled={saving}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? (
                    <EyeOffIcon aria-hidden="true" className="size-3.5" />
                  ) : (
                    <EyeIcon aria-hidden="true" className="size-3.5" />
                  )}
                </Button>
              </div>
              {errors.password && (
                <p
                  id="admin-user-password-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errors.password}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="user-role">用户角色</Label>
            <Select
              items={USER_ROLE_ITEMS}
              value={role}
              disabled={saving}
              onValueChange={(value) => {
                if (value) setRole(value as AdminUser["role"]);
              }}
            >
              <SelectTrigger id="user-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {USER_ROLE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {role === "admin"
                ? "可以管理模型提供商、用户角色与网络设置。"
                : "可以使用全部创作功能，无法访问管理后台。"}
            </p>
          </div>
          {user?.role === "admin" && role === "user" && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {user.id === currentUserId
                ? "你将失去后台访问权限。系统必须保留至少一位管理员。"
                : "系统必须保留至少一位管理员。"}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving || unchanged}>
              {saving && (
                <Loader2Icon
                  aria-hidden="true"
                  className="size-3.5 motion-safe:animate-spin"
                />
              )}
              {saving ? "正在保存…" : user ? "保存更改" : "创建用户"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
