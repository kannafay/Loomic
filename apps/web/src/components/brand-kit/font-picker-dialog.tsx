"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GoogleFontItem } from "../../lib/font-api";
import { fetchGoogleFonts } from "../../lib/font-api";

interface FontPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (font: {
    family: string;
    variant: string;
    category: string;
  }) => void;
}

const CATEGORIES = [
  { value: "", label: "全部字体" },
  { value: "sans-serif", label: "无衬线字体" },
  { value: "serif", label: "衬线字体" },
  { value: "display", label: "展示字体" },
  { value: "handwriting", label: "手写字体" },
  { value: "monospace", label: "等宽字体" },
];

const PAGE_SIZE = 50;

export function FontPickerDialog({
  open,
  onClose,
  onSelect,
}: FontPickerDialogProps) {
  const [fonts, setFonts] = useState<GoogleFontItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<GoogleFontItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadedRef = useRef<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch fonts on open / search / category change
  useEffect(() => {
    if (!open) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      async () => {
        try {
          const result = await fetchGoogleFonts(
            search || undefined,
            category || undefined,
          );
          setFonts(result);
          setVisibleCount(PAGE_SIZE);
        } catch {
          // API failure — keep current list or show empty
          setFonts([]);
        }
      },
      search ? 300 : 0,
    );
    return () => clearTimeout(searchTimer.current);
  }, [open, search, category]);

  // Load Google Fonts CSS for visible items (side-effect in useEffect, not during render)
  const visibleFamilies = useMemo(
    () => (open ? fonts.slice(0, visibleCount).map((f) => f.family) : []),
    [open, fonts, visibleCount],
  );
  useEffect(() => {
    for (const family of visibleFamilies) {
      if (loadedRef.current.has(family)) continue;
      loadedRef.current.add(family);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
      document.head.appendChild(link);
    }
  }, [visibleFamilies]);

  // Scroll handler for loading more
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVisibleCount((c) => Math.min(c + PAGE_SIZE, fonts.length));
    }
  }, [fonts.length]);

  const handleAdd = useCallback(() => {
    if (!selected) return;
    onSelect({
      family: selected.family,
      variant: selected.variants.includes("regular")
        ? "regular"
        : (selected.variants[0] ?? "400"),
      category: selected.category,
    });
    onClose();
  }, [selected, onSelect, onClose]);

  if (!open) return null;

  const visibleFonts = fonts.slice(0, visibleCount);
  // Font CSS is loaded via useEffect above (visibleFamilies), not during render

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="flex max-h-[min(80vh,620px)] flex-col gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择字体</DialogTitle>
          <DialogDescription>
            搜索字体并选择要添加到品牌套件的字体。
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="搜索字体"
          placeholder="搜索字体..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          value={category}
          items={CATEGORIES}
          onValueChange={(value) => setCategory(value ?? "")}
        >
          <SelectTrigger aria-label="字体分类" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {CATEGORIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <ScrollArea
          orientation="vertical"
          ref={listRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {visibleFonts.map((item) => (
            <Button
              key={item.family}
              variant="ghost"
              aria-pressed={selected?.family === item.family}
              onClick={() => setSelected(item)}
              className="h-auto w-full justify-start px-3 py-2 text-left text-base aria-pressed:bg-accent-soft aria-pressed:text-accent-soft-foreground aria-pressed:hover:bg-accent/15 aria-pressed:hover:text-accent-soft-foreground dark:aria-pressed:hover:bg-accent/15"
              style={{ fontFamily: `"${item.family}", sans-serif` }}
            >
              {item.family}
            </Button>
          ))}
          {fonts.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {search ? "未找到匹配字体" : "加载中..."}
            </p>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleAdd} disabled={!selected}>
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
