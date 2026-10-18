"use client";

import { useToast } from "@/components/toast";
import { updateProject } from "@/lib/server-api";
import { useCallback, useEffect, useRef, useState } from "react";

interface EditableProjectNameProps {
  accessToken: string;
  projectId: string;
  initialName: string;
}

export function EditableProjectName({
  accessToken,
  projectId,
  initialName,
}: EditableProjectNameProps) {
  const { success, error: showError } = useToast();
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevName = useRef(initialName);

  // Sync if initialName changes externally
  useEffect(() => {
    setName(initialName);
    prevName.current = initialName;
  }, [initialName]);

  const save = useCallback(
    async (newName: string) => {
      if (saving) return;
      const trimmed = newName.trim() || "未命名项目";
      setName(trimmed);
      setEditing(false);
      if (trimmed !== prevName.current) {
        const previousName = prevName.current;
        prevName.current = trimmed;
        setSaving(true);
        try {
          await updateProject(accessToken, projectId, { name: trimmed });
          success("项目名称已更新。");
        } catch (err) {
          prevName.current = previousName;
          setName(previousName);
          showError("项目名称保存失败，请重试。");
          console.warn("Failed to update project name:", err);
        } finally {
          setSaving(false);
        }
      }
    },
    [accessToken, projectId, saving, success, showError],
  );

  const startEditing = useCallback(() => {
    setEditing(true);
    // Select all text after render
    requestAnimationFrame(() => inputRef.current?.select());
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save(name);
      } else if (e.key === "Escape") {
        setName(prevName.current);
        setEditing(false);
      }
    },
    [name, save],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label="项目名称"
        value={name}
        disabled={saving}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => save(name)}
        onKeyDown={handleKeyDown}
        className="h-8 rounded-lg bg-card/80 backdrop-blur-sm border border-border px-2.5 text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-ring/20 max-w-[200px]"
        maxLength={100}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={saving}
      className="h-8 rounded-lg bg-transparent hover:bg-card/60 backdrop-blur-sm px-2.5 text-sm font-medium text-foreground transition-colors truncate max-w-[200px] cursor-text"
      title={name}
    >
      {name}
    </button>
  );
}
