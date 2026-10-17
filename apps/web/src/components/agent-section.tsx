"use client";

import type { ModelInfo } from "@loomic/shared";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface AgentSectionProps {
  defaultModel: string;
  onSave: (defaultModel: string) => Promise<void>;
  fetchModels: () => Promise<{ models: ModelInfo[] }>;
}

export function AgentSection({
  defaultModel: initialModel,
  onSave,
  fetchModels,
}: AgentSectionProps) {
  const [selectedModel, setSelectedModel] = useState(initialModel);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const hasChanges = selectedModel !== initialModel;

  useEffect(() => {
    fetchModels()
      .then((data) => {
        setModels(data.models);
        const ids = data.models.map((m: ModelInfo) => m.id);
        setSelectedModel((current) =>
          ids.length > 0 && !ids.includes(current)
            ? (ids[0] ?? current)
            : current,
        );
      })
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, [fetchModels]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedModel) return;

    setSaving(true);
    setFeedback(null);

    try {
      await onSave(selectedModel);
      setFeedback({ type: "success", message: "助手设置已更新。" });
    } catch {
      setFeedback({
        type: "error",
        message: "设置更新失败，请重试。",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">智能助手</h2>
      <p className="text-sm text-muted-foreground mb-6">
        设置工作空间默认使用的 AI 模型。
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="defaultModel">默认模型</Label>
          {modelsLoading ? (
            <p className="text-sm text-muted-foreground">正在加载模型…</p>
          ) : (
            <Select
              items={models.map((model) => ({
                value: model.id,
                label: `${model.name} (${model.provider})`,
              }))}
              value={selectedModel}
              onValueChange={(value) => {
                if (value) setSelectedModel(value);
              }}
              disabled={saving || models.length === 0}
            >
              <SelectTrigger id="defaultModel" className="w-full">
                <SelectValue placeholder="暂无可用模型" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            工作空间中的新对话将默认使用此模型。
          </p>
        </div>

        {feedback && (
          <p
            className={`text-sm ${feedback.type === "success" ? "text-success" : "text-destructive"}`}
          >
            {feedback.message}
          </p>
        )}

        <Button
          type="submit"
          disabled={saving || modelsLoading || !models.length || !hasChanges}
          size="sm"
        >
          {saving ? "正在保存…" : "保存"}
        </Button>
      </form>
    </div>
  );
}
