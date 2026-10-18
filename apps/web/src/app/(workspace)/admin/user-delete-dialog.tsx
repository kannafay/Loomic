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
import type { AdminUser } from "@/lib/model-admin-api";
import { LoaderCircleIcon } from "lucide-react";
import { useRef } from "react";

export function UserDeleteDialog({
  user,
  open,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  user: AdminUser | null;
  open: boolean;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={false} initialFocus={cancel}>
        <DialogHeader>
          <DialogTitle>删除用户</DialogTitle>
          <DialogDescription>
            该账号及其拥有的工作空间、项目和历史记录将永久删除，无法恢复。共用的模型配置会保留。
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="break-words text-sm font-medium">
            {user?.name || "未命名用户"}
          </p>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {user?.email}
          </p>
        </div>
        <DialogFooter>
          <Button
            ref={cancel}
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting || !user}
            aria-busy={deleting}
            onClick={() => void onConfirm()}
          >
            {deleting && (
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-3.5 motion-safe:animate-spin"
              />
            )}
            {deleting ? "正在删除…" : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
