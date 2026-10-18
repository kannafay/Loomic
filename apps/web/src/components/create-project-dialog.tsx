"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { useToast } from "./toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string }) => Promise<void>;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setLoading(true);
    setError(null);

    try {
      const payload: { name: string; description?: string } = {
        name: trimmedName,
      };
      const trimmedDesc = description.trim();
      if (trimmedDesc) {
        payload.description = trimmedDesc;
      }
      await onSubmit(payload);
      // Success -- reset and close
      toastSuccess("项目创建成功");
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err) {
        const apiErr = err as { code: string };
        if (apiErr.code === "project_slug_taken") {
          setError("同名项目已存在，请使用其他名称。");
        } else {
          toastError("项目创建失败");
        }
      } else {
        toastError("项目创建失败");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName("");
      setDescription("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">名称</Label>
            <Input
              id="project-name"
              placeholder="我的项目"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">说明（选填）</Label>
            <Input
              id="project-description"
              placeholder="简单描述一下这个项目…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden text-sm text-destructive"
                role="alert"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "正在创建…" : "创建"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
