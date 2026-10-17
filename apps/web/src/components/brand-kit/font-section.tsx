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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { BrandKitAsset } from "@loomic/shared";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { FontPickerDialog } from "./font-picker-dialog";
import { InlineInput } from "./inline-input";
import { SectionHeader } from "./section-header";

interface FontSectionProps {
  fonts: BrandKitAsset[];
  onAddFont: (data: {
    family: string;
    variant: string;
    category: string;
  }) => void;
  onDeleteFont: (assetId: string) => void;
  onUpdateLabel: (assetId: string, name: string) => void;
}

export function FontSection({
  fonts,
  onAddFont,
  onDeleteFont,
  onUpdateLabel,
}: FontSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");

  // Load Google Fonts CSS for each font card
  useEffect(() => {
    const families = fonts
      .map((f) => f.text_content)
      .filter((v): v is string => Boolean(v));

    const uniqueFamilies = [...new Set(families)];

    for (const family of uniqueFamilies) {
      const linkId = `gfont-${family.replace(/\s+/g, "-")}`;
      if (document.getElementById(linkId)) continue;
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
      document.head.appendChild(link);
    }
  }, [fonts]);

  const handlePickerSelect = useCallback(
    (font: { family: string; variant: string; category: string }) => {
      onAddFont(font);
    },
    [onAddFont],
  );

  return (
    <section>
      <SectionHeader title="字体" count={fonts.length} />
      <div className="flex flex-wrap gap-3">
        {fonts.map((font) => (
          <div key={font.id} className="flex flex-col items-center gap-1.5">
            <div className="relative group">
              <div className="w-[150px] h-[113px] rounded-xl border bg-muted/30 flex items-center justify-center">
                <span
                  className="text-3xl font-light text-foreground/70 select-none"
                  style={{
                    fontFamily: font.text_content
                      ? `"${font.text_content}", sans-serif`
                      : undefined,
                  }}
                >
                  Ag
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                type="button"
                onClick={() => onDeleteFont(font.id)}
                className={cn(
                  "absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border shadow-sm",
                  "flex items-center justify-center",
                  "opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer",
                )}
                aria-label={`删除字体${font.display_name}`}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
            <InlineInput
              value={font.display_name}
              onCommit={(name) => onUpdateLabel(font.id, name)}
              className="w-[150px]"
              inputClassName="text-xs text-center text-muted-foreground truncate"
            />
          </div>
        ))}

        {/* Add button with dropdown menu */}
        <div className="flex flex-col items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-[113px] w-[150px] rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
                  aria-label="添加字体"
                />
              }
            >
              <Plus className="size-5 text-muted-foreground/60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setPickerOpen(true)}>
                从字体库选择
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setManualName("");
                  setManualOpen(true);
                }}
              >
                手动输入字体名称
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs text-muted-foreground/60">添加</span>
        </div>
      </div>

      {pickerOpen && (
        <FontPickerDialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handlePickerSelect}
        />
      )}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加字体</DialogTitle>
            <DialogDescription>
              输入本机已安装或页面已加载的字体名称。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!manualName.trim()) return;
              onAddFont({
                family: manualName.trim(),
                variant: "regular",
                category: "sans-serif",
              });
              setManualOpen(false);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="brand-manual-font">字体名称</Label>
              <Input
                id="brand-manual-font"
                value={manualName}
                onChange={(event) => setManualName(event.target.value)}
                placeholder="例如：思源黑体"
                required
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setManualOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={!manualName.trim()}>
                添加
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
