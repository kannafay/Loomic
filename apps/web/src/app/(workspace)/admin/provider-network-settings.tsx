"use client";

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
import type { ProviderProxy } from "@loomic/shared";
import { useId } from "react";

const MODES = [
  { value: "global", label: "使用全局代理" },
  { value: "custom", label: "自定义代理" },
  { value: "direct", label: "不使用代理" },
];

export function ProviderNetworkSettings({
  value,
  disabled,
  onChange,
}: {
  value: ProviderProxy | undefined;
  disabled: boolean;
  onChange: (proxy: ProviderProxy) => void;
}) {
  const id = useId();
  const proxy = value ?? { mode: "global", url: "" };
  return (
    <div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-mode`} className="text-xs">
          代理方式
        </Label>
        <Select
          items={MODES}
          value={proxy.mode}
          disabled={disabled}
          onValueChange={(mode) => {
            if (mode)
              onChange({ ...proxy, mode: mode as ProviderProxy["mode"] });
          }}
        >
          <SelectTrigger
            id={`${id}-mode`}
            aria-label="代理方式"
            className="w-full font-normal"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {proxy.mode === "custom" ? (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-url`} className="text-xs">
            自定义代理地址
          </Label>
          <Input
            id={`${id}-url`}
            type="url"
            required
            disabled={disabled}
            value={proxy.url}
            maxLength={1000}
            placeholder="http://127.0.0.1:10808"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) =>
              onChange({ ...proxy, url: event.target.value })
            }
          />
        </div>
      ) : (
        <p className="self-end pb-2 text-xs leading-5 text-muted-foreground">
          {proxy.mode === "global"
            ? "沿用「网络设置」中的全局代理。"
            : "直接连接此提供商，忽略全局代理。"}
        </p>
      )}
    </div>
  );
}
