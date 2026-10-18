"use client";

import { useToast } from "@/components/toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type AdminUser,
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  updateAdminUser,
} from "@/lib/model-admin-api";
import { cn } from "@/lib/utils";
import type { AdminUserCreate, AdminUserUpdate } from "@loomic/shared";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserDeleteDialog } from "./user-delete-dialog";
import { USER_ROLE_ITEMS, UserEditorDialog } from "./user-editor-dialog";

const ROLE_FILTERS = [{ value: "all", label: "全部角色" }, ...USER_ROLE_ITEMS];
const PAGE_SIZE = 10;

function RoleBadge({ role }: { role: AdminUser["role"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        role === "admin"
          ? "border-border bg-muted text-foreground"
          : "border-transparent text-muted-foreground",
      )}
    >
      {role === "admin" && (
        <ShieldCheckIcon aria-hidden="true" className="size-3" />
      )}
      {role === "admin" ? "管理员" : "普通用户"}
    </span>
  );
}

function UserIdentity({
  user,
  current,
}: { user: AdminUser; current: boolean }) {
  const name = user.name.trim() || user.email || "未命名用户";
  const words = name.split(/\s+/);
  const initials =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
      : name.slice(0, 2);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar aria-hidden="true" className="size-9">
        <AvatarFallback className="text-xs font-medium">
          {initials.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium" title={name}>
            {name}
          </span>
          {current && (
            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] leading-3 text-muted-foreground">
              当前账号
            </span>
          )}
        </div>
        <p
          className="mt-0.5 truncate text-xs text-muted-foreground"
          title={user.email}
        >
          {user.email || "未填写邮箱"}
        </p>
      </div>
    </div>
  );
}

export function UsersPanel({
  token,
  currentUserId,
  onSelfRoleChanged,
  onSelfProfileChanged,
}: {
  token: string;
  currentUserId: string;
  onSelfRoleChanged: () => Promise<void>;
  onSelfProfileChanged?: () => Promise<void>;
}) {
  const { success, error: showError } = useToast();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletionUser, setDeletionUser] = useState<AdminUser | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletionPending = useRef(false);
  const loadRevision = useRef(0);

  const loadUsers = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await fetchAdminUsers(token);
      if (revision === loadRevision.current) setUsers(result.users);
    } catch (err) {
      if (revision === loadRevision.current)
        setLoadError(
          err instanceof Error ? err.message : "用户列表读取失败，请重试。",
        );
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
    return () => {
      loadRevision.current++;
    };
  }, [loadUsers]);

  const search = query.trim().toLocaleLowerCase();
  const filteredUsers = (users ?? []).filter(
    (user) =>
      (roleFilter === "all" || user.role === roleFilter) &&
      (!search ||
        `${user.name} ${user.email}`.toLocaleLowerCase().includes(search)),
  );
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleUsers = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const hasFilters = !!query.trim() || roleFilter !== "all";

  async function saveUser(value: AdminUserCreate | AdminUserUpdate) {
    if (saving) return;
    setSaving(true);
    let saved: AdminUser;
    try {
      const result = editingUser
        ? await updateAdminUser(token, editingUser.id, value)
        : await createAdminUser(token, {
            ...value,
            password: "password" in value ? value.password : "",
          });
      saved = result.user;
    } catch (err) {
      showError(err instanceof Error ? err.message : "用户保存失败，请重试。");
      throw err;
    } finally {
      setSaving(false);
    }
    setUsers((current) =>
      editingUser
        ? (current ?? []).map((user) => (user.id === saved.id ? saved : user))
        : [saved, ...(current ?? [])],
    );
    setEditorOpen(false);
    if (!editingUser) {
      setQuery("");
      setRoleFilter("all");
      setPage(1);
    }
    if (editingUser?.id === currentUserId) {
      try {
        if (
          editingUser.name !== saved.name ||
          editingUser.email !== saved.email
        )
          await onSelfProfileChanged?.();
        if (editingUser.role !== saved.role) await onSelfRoleChanged();
      } catch {
        showError("用户已更新，请刷新页面同步账号信息。");
        return;
      }
    }
    success(editingUser ? "用户信息已更新。" : "用户已创建。");
  }

  async function deleteUser() {
    if (
      !deletionUser ||
      deletionPending.current ||
      deletionUser.id === currentUserId
    )
      return;
    deletionPending.current = true;
    setDeleting(true);
    try {
      await deleteAdminUser(token, deletionUser.id);
      setUsers((current) =>
        (current ?? []).filter((user) => user.id !== deletionUser.id),
      );
      setDeleteOpen(false);
      success("用户已删除。");
    } catch (err) {
      showError(err instanceof Error ? err.message : "用户删除失败，请重试。");
    } finally {
      deletionPending.current = false;
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="users-heading" className="min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1 sm:min-w-[220px]">
          <div className="flex items-center gap-2">
            <h2 id="users-heading" className="text-lg font-semibold">
              用户管理
            </h2>
            {users && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {users.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            管理员可配置后台，所有用户均可使用全部创作功能。
          </p>
        </div>
        <div className="order-3 flex w-full items-center gap-2 sm:order-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-56">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="搜索用户"
              placeholder="搜索姓名或邮箱"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              className="pl-8 text-xs"
            />
          </div>
          <Select
            items={ROLE_FILTERS}
            value={roleFilter}
            onValueChange={(value) => {
              if (value) {
                setRoleFilter(value);
                setPage(1);
              }
            }}
          >
            <SelectTrigger
              aria-label="筛选用户角色"
              className="w-28 shrink-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ROLE_FILTERS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="刷新用户列表"
                  disabled={loading || saving || deleting}
                  onClick={() => void loadUsers()}
                />
              }
            >
              <RefreshCwIcon
                aria-hidden="true"
                className={cn(
                  "size-3.5",
                  loading && "motion-safe:animate-spin",
                )}
              />
            </TooltipTrigger>
            <TooltipContent>刷新用户列表</TooltipContent>
          </Tooltip>
        </div>
        <Button
          type="button"
          className="order-2 sm:order-3"
          disabled={loading || saving || deleting || !users || !!loadError}
          onClick={() => {
            setEditingUser(null);
            setEditorOpen(true);
          }}
        >
          <PlusIcon aria-hidden="true" className="size-3.5" />
          添加用户
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loadError && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-destructive/5 px-5 py-3">
            <p role="alert" className="text-xs text-destructive">
              {loadError}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void loadUsers()}
            >
              重试
            </Button>
          </div>
        )}
        <table
          aria-busy={loading}
          className="w-full table-fixed text-left text-sm"
        >
          <caption className="sr-only">用户及后台访问角色</caption>
          <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">
                用户
              </th>
              <th
                scope="col"
                className="hidden w-36 px-3 py-2.5 font-medium sm:table-cell lg:w-44"
              >
                角色
              </th>
              <th
                scope="col"
                className="w-28 px-3 py-2.5 text-right font-medium sm:w-44 sm:px-5"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && !users
              ? ["first", "second", "third", "fourth"].map((id) => (
                  <tr key={id}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 shrink-0 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 sm:table-cell">
                      <Skeleton className="h-5 w-16" />
                    </td>
                    <td className="px-3 sm:px-5">
                      <Skeleton className="ml-auto h-6 w-12" />
                    </td>
                  </tr>
                ))
              : visibleUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="transition-colors hover:bg-muted/25"
                  >
                    <td className="px-5 py-3.5">
                      <UserIdentity
                        user={user}
                        current={user.id === currentUserId}
                      />
                      <div className="mt-2 pl-12 sm:hidden">
                        <RoleBadge role={user.role} />
                      </div>
                    </td>
                    <td className="hidden px-3 py-3.5 sm:table-cell">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-3 py-3.5 text-right sm:px-5">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`编辑 ${user.name || user.email}`}
                          disabled={
                            loading || saving || deleting || !!loadError
                          }
                          onClick={() => {
                            setEditingUser(user);
                            setEditorOpen(true);
                          }}
                          className="size-11 text-muted-foreground hover:text-foreground sm:h-7 sm:w-auto"
                        >
                          <PencilIcon aria-hidden="true" className="size-3.5" />
                          <span className="hidden sm:inline">编辑</span>
                          <span className="sr-only sm:hidden">编辑用户</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`删除 ${user.name || user.email}`}
                          title={
                            user.id === currentUserId
                              ? "不能删除当前登录账号"
                              : undefined
                          }
                          disabled={
                            user.id === currentUserId ||
                            loading ||
                            saving ||
                            deleting ||
                            !!loadError
                          }
                          onClick={() => {
                            setDeletionUser(user);
                            setDeleteOpen(true);
                          }}
                          className="size-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-auto"
                        >
                          <Trash2Icon aria-hidden="true" className="size-3.5" />
                          <span className="hidden sm:inline">删除</span>
                          <span className="sr-only sm:hidden">删除用户</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && !loadError && visibleUsers.length === 0 && (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            {hasFilters ? (
              <SearchIcon
                aria-hidden="true"
                className="mb-3 size-5 text-muted-foreground"
              />
            ) : (
              <UsersIcon
                aria-hidden="true"
                className="mb-3 size-5 text-muted-foreground"
              />
            )}
            <p className="text-sm font-medium">
              {hasFilters ? "没有找到匹配的用户" : "暂无用户"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasFilters
                ? "试试其他姓名、邮箱或角色。"
                : "添加用户后即可在这里管理资料与角色。"}
            </p>
            {hasFilters && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setQuery("");
                  setRoleFilter("all");
                  setPage(1);
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        )}
        {users && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <p>
              {hasFilters
                ? `找到 ${filteredUsers.length} 位用户，共 ${users.length} 位`
                : `共 ${users.length} 位用户，${users.filter((user) => user.role === "admin").length} 位管理员`}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <span>
                  {currentPage} / {pageCount}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="上一页"
                  disabled={currentPage === 1 || loading}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="下一页"
                  disabled={currentPage === pageCount || loading}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRightIcon aria-hidden="true" className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <UserEditorDialog
        open={editorOpen}
        user={editingUser}
        currentUserId={currentUserId}
        saving={saving}
        onOpenChange={setEditorOpen}
        onSave={saveUser}
      />
      <UserDeleteDialog
        open={deleteOpen}
        user={deletionUser}
        deleting={deleting}
        onOpenChange={setDeleteOpen}
        onConfirm={deleteUser}
      />
    </section>
  );
}
