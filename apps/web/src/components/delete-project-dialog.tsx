"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { type RefObject, useRef } from "react";

import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

interface DeleteProjectDialogProps {
  open: boolean;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  finalFocus?: RefObject<HTMLElement | null>;
}

export function DeleteProjectDialog({
  open,
  deleting,
  onConfirm,
  onCancel,
  finalFocus,
}: DeleteProjectDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !deleting) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-sm"
        showCloseButton={false}
        initialFocus={cancelRef}
        finalFocus={finalFocus}
      >
        <DialogTitle className="text-sm leading-normal font-medium text-foreground">
          确定删除此项目？此操作无法撤销。
        </DialogTitle>
        <div className="mt-4 flex items-center justify-end gap-3">
          <Button
            ref={cancelRef}
            variant="ghost"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-xl"
          >
            取消
          </Button>
          <Button
            onClick={onConfirm}
            disabled={deleting}
            aria-busy={deleting}
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && (
              <motion.span
                aria-hidden="true"
                animate={{ rotate: 360 }}
                transition={{
                  duration: 0.8,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "linear",
                }}
                className="flex items-center justify-center"
              >
                <Loader2 size={16} />
              </motion.span>
            )}
            {deleting ? "正在删除…" : "永久删除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
