"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";

interface ColorPickerPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactElement;
  onSave: (name: string, hex: string) => void;
  initialName?: string;
  initialHex?: string;
  mode: "create" | "edit";
}

const HEX_RE = /^[0-9A-Fa-f]{6}$/;

function normalizeHex(raw: string): string | null {
  const cleaned = raw.replace(/^#/, "");
  if (HEX_RE.test(cleaned)) return `#${cleaned.toUpperCase()}`;
  return null;
}

export function ColorPickerPopover({
  open,
  onOpenChange,
  children,
  onSave,
  initialName = "",
  initialHex = "#6366F1",
  mode,
}: ColorPickerPopoverProps) {
  const [name, setName] = useState(initialName);
  const [hex, setHex] = useState(initialHex);
  const [hexInput, setHexInput] = useState(initialHex.replace("#", ""));

  // Sync initial values when popover opens
  useEffect(() => {
    if (open) {
      setName(initialName);
      setHex(initialHex);
      setHexInput(initialHex.replace("#", ""));
    }
  }, [open, initialName, initialHex]);

  const handlePickerChange = useCallback((newHex: string) => {
    const upper = newHex.toUpperCase();
    setHex(upper);
    setHexInput(upper.replace("#", ""));
  }, []);

  const handleHexInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setHexInput(raw);
      const normalized = normalizeHex(raw);
      if (normalized) setHex(normalized);
    },
    [],
  );

  const handleSave = useCallback(() => {
    const trimmedName = name.trim() || hex;
    onSave(trimmedName, hex);
    onOpenChange(false);
  }, [name, hex, onSave, onOpenChange]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={children} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-[260px] p-3"
      >
        <PopoverTitle>
          {mode === "create" ? "添加颜色" : "编辑颜色"}
        </PopoverTitle>
        <Input
          aria-label="颜色名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="颜色名称"
        />
        <div className="[&_.react-colorful]:h-[160px]! [&_.react-colorful]:w-full! [&_.react-colorful]:rounded-lg">
          <HexColorPicker color={hex} onChange={handlePickerChange} />
        </div>
        <div className="flex items-center gap-2">
          <div
            className="size-8 shrink-0 rounded-lg border"
            style={{ backgroundColor: hex }}
          />
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              #
            </span>
            <Input
              aria-label="颜色十六进制值"
              value={hexInput}
              onChange={handleHexInputChange}
              maxLength={6}
              className="pl-6 font-mono uppercase"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>
            {mode === "create" ? "添加" : "保存"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
