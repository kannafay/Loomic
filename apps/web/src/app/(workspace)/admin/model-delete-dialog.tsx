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
import type { ConfiguredModel } from "@loomic/shared";
import { useRef } from "react";

export function ModelDeleteDialog({
  model,
  open,
  staged,
  deleting,
  onClose,
  onConfirm,
}: {
  model: ConfiguredModel | null;
  open: boolean;
  staged: boolean;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
      <DialogContent showCloseButton={false} initialFocus={cancel}>
        <DialogHeader>
          <DialogTitle>删除模型</DialogTitle>
          <DialogDescription>
            {staged
              ? "从待保存列表移除此模型，保存提供商时将不再添加。"
              : "删除后所有用户将无法再选择此模型，已生成的内容会保留。"}
            {model?.isDefault && "这是默认模型，删除后请重新设置默认模型。"}
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="break-words text-sm font-medium">{model?.name}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {model?.apiModel}
          </p>
        </div>
        <DialogFooter>
          <Button
            ref={cancel}
            variant="outline"
            disabled={deleting}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={deleting || !model}
            aria-busy={deleting}
            onClick={() => void onConfirm()}
          >
            {deleting ? "正在删除…" : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
