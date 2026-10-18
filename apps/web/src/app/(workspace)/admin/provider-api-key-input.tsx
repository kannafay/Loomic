"use client";

import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchProviderApiKey } from "@/lib/model-admin-api";
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ProviderApiKeyInput({
  id,
  value,
  onChange,
  token,
  providerId,
  hasSavedKey,
  required,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  token: string | undefined;
  providerId: string | undefined;
  hasSavedKey: boolean;
  required: boolean;
  disabled: boolean;
}) {
  const { success, error: showError } = useToast();
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState<"reveal" | "copy" | null>(null);
  const [copied, setCopied] = useState(false);
  const active = useRef(true);
  const revision = useRef(0);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const available = !!value || !!(token && providerId && hasSavedKey);

  async function handleKeyAction(action: "reveal" | "copy") {
    if (pending || disabled || !available) return;
    if (action === "reveal" && visible) {
      setVisible(false);
      return;
    }
    const startedRevision = revision.current;
    setPending(action);
    setCopied(false);
    try {
      const apiKey =
        value ||
        savedKey ||
        (token && providerId && hasSavedKey
          ? (await fetchProviderApiKey(token, providerId)).apiKey
          : "");
      if (!active.current || startedRevision !== revision.current) return;
      if (!apiKey) throw new Error("missing_key");
      if (!value) setSavedKey(apiKey);
      if (action === "copy") {
        await navigator.clipboard.writeText(apiKey);
        if (active.current && startedRevision === revision.current) {
          setCopied(true);
          success("密钥已复制。");
        }
      } else {
        setEdited(false);
        setVisible(true);
      }
    } catch {
      if (active.current && startedRevision === revision.current)
        showError(
          action === "copy"
            ? "复制失败，请重试或展开后手动复制。"
            : "密钥读取失败，请重试。",
        );
    } finally {
      if (active.current) setPending(null);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="relative">
        <Input
          id={id}
          className="pr-16 font-normal"
          type={visible ? "text" : "password"}
          required={required}
          disabled={disabled}
          value={edited ? value : value || savedKey || ""}
          onChange={(event) => {
            revision.current += 1;
            setEdited(true);
            setSavedKey(null);
            setCopied(false);
            onChange(event.target.value);
          }}
          placeholder={
            hasSavedKey ? "••••••••••••••••" : "填写提供商的 API Key"
          }
          autoComplete="new-password"
          spellCheck={false}
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground active:translate-y-0 hover:text-foreground"
            aria-label={visible ? "隐藏密钥" : "显示密钥"}
            aria-pressed={visible}
            title={visible ? "隐藏密钥" : "显示密钥"}
            disabled={disabled || !!pending || !available}
            onClick={() => void handleKeyAction("reveal")}
          >
            {pending === "reveal" ? (
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-3.5 animate-spin motion-reduce:animate-none"
              />
            ) : visible ? (
              <EyeOffIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <EyeIcon aria-hidden="true" className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground active:translate-y-0 hover:text-foreground"
            aria-label="复制密钥"
            title={copied ? "已复制" : "复制密钥"}
            disabled={disabled || !!pending || !available}
            onClick={() => void handleKeyAction("copy")}
          >
            {pending === "copy" ? (
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-3.5 animate-spin motion-reduce:animate-none"
              />
            ) : copied ? (
              <CheckIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <CopyIcon aria-hidden="true" className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
