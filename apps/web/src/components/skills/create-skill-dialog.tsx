"use client";

import { Textarea } from "@/components/ui/textarea";

import { FileText, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";

import type { SkillCategory } from "@loomic/shared";

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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// SKILL.md boilerplate template
// ---------------------------------------------------------------------------

const SKILL_TEMPLATE = `# 技能名称

## 技能说明
描述这个技能的用途，以及智能助手应在什么情况下使用它。

## 使用步骤
1. 按顺序描述智能助手应执行的操作。
2. 明确说明输入、输出和限制条件。

## 示例
\`\`\`
用户：示例需求
智能助手：示例回复
\`\`\`

## 约束条件
- 列出需要遵守的限制和边界。
`;

// ---------------------------------------------------------------------------
// Category options
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: Array<{ value: SkillCategory; label: string }> = [
  { value: "design", label: "设计" },
  { value: "generation", label: "生成" },
  { value: "code", label: "代码" },
  { value: "data", label: "数据" },
  { value: "writing", label: "写作" },
  { value: "custom", label: "自定义" },
];

// ---------------------------------------------------------------------------
// CreateSkillDialog
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Valid path prefixes for attached files
// ---------------------------------------------------------------------------

const VALID_PATH_PREFIXES = ["scripts/", "references/", "assets/"];

function isValidFilePath(path: string): boolean {
  return VALID_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    description: string;
    category: SkillCategory;
    skillContent: string;
    files?: Array<{ filePath: string; content: string }>;
  }) => Promise<void>;
}

export function CreateSkillDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateSkillDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SkillCategory>("custom");
  const [skillContent, setSkillContent] = useState("");
  const [files, setFiles] = useState<
    Array<{ id: string; filePath: string; content: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);

  // -- File management helpers --

  const addFile = useCallback(() => {
    setFiles((prev) => [
      ...prev,
      { id: crypto.randomUUID(), filePath: "", content: "" },
    ]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateFile = useCallback(
    (index: number, field: "filePath" | "content", value: string) => {
      setFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)),
      );
    },
    [],
  );

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setCategory("custom");
    setSkillContent("");
    setFiles([]);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !description.trim() || !skillContent.trim()) return;

      // Only include files where both filePath and content are non-empty
      const validFiles = files
        .filter((f) => f.filePath.trim() && f.content.trim())
        .map(({ filePath, content }) => ({ filePath, content }));

      setSubmitting(true);
      try {
        await onSubmit({
          name,
          description,
          category,
          skillContent,
          ...(validFiles.length > 0 ? { files: validFiles } : {}),
        });
        handleOpenChange(false);
      } finally {
        setSubmitting(false);
      }
    },
    [
      name,
      description,
      category,
      skillContent,
      files,
      onSubmit,
      handleOpenChange,
    ],
  );

  const canSubmit =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    skillContent.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>添加自定义技能</DialogTitle>
          <DialogDescription>
            创建新的技能来扩展智能体的能力。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="skill-name">名称</Label>
            <Input
              id="skill-name"
              placeholder="例如：界面设计专家"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="skill-category">分类</Label>
            <Select
              items={CATEGORY_OPTIONS}
              value={category}
              onValueChange={(value) => {
                if (value) setCategory(value as SkillCategory);
              }}
            >
              <SelectTrigger id="skill-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="skill-desc">描述</Label>
            <Textarea
              id="skill-desc"
              rows={2}
              placeholder="简述技能的功能和用途..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              className="field-sizing-fixed resize-none"
            />
          </div>

          {/* Skill content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="skill-content">SKILL.md 内容</Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setSkillContent(SKILL_TEMPLATE)}
              >
                <FileText className="size-3" />
                使用模板
              </Button>
            </div>
            <Textarea
              id="skill-content"
              rows={8}
              placeholder="# 技能名称&#10;&#10;## 使用说明&#10;…"
              value={skillContent}
              onChange={(e) => setSkillContent(e.target.value)}
              className="field-sizing-fixed resize-y bg-secondary font-mono text-xs leading-relaxed"
            />
          </div>

          {/* Attached files (optional) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>附属文件（可选）</Label>
              <Button type="button" variant="ghost" size="xs" onClick={addFile}>
                <Plus className="size-3" />
                添加
              </Button>
            </div>

            {files.length > 0 && (
              <div className="space-y-3">
                {files.map((file, index) => {
                  const pathTrimmed = file.filePath.trim();
                  const showPathError =
                    pathTrimmed.length > 0 && !isValidFilePath(pathTrimmed);

                  return (
                    <div
                      key={file.id}
                      className="relative rounded-lg border border-border bg-secondary/40 p-3 space-y-2"
                    >
                      {/* Remove button */}
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute top-2 right-2 p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="删除文件"
                      >
                        <X className="size-3.5" />
                      </Button>

                      {/* File path input */}
                      <div className="pr-6">
                        <Input
                          placeholder="scripts/analyze.py"
                          value={file.filePath}
                          onChange={(e) =>
                            updateFile(index, "filePath", e.target.value)
                          }
                          className="font-mono text-xs h-7"
                          maxLength={500}
                        />
                        {showPathError && (
                          <p className="mt-1 text-[11px] text-destructive">
                            路径必须以 scripts/、references/ 或 assets/ 开头
                          </p>
                        )}
                      </div>

                      {/* File content textarea */}
                      <Textarea
                        rows={4}
                        placeholder="文件内容..."
                        value={file.content}
                        onChange={(e) =>
                          updateFile(index, "content", e.target.value)
                        }
                        className="field-sizing-fixed resize-y font-mono text-xs leading-relaxed"
                      />
                    </div>
                  );
                })}

                <p className="text-[11px] text-muted-foreground">
                  支持的路径前缀：scripts/、references/、assets/
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
