"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

import type { ChatSessionSummary } from "@loomic/shared";
import { CheckIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "./ui/popover";

type SessionSelectorProps = {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
  onDelete: (sessionId: string) => void;
};

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function NewChatIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path
        fillOpacity={0.9}
        d="M18.25 3A3.75 3.75 0 0 1 22 6.75v9a3.75 3.75 0 0 1-3.75 3.75h-2.874a.25.25 0 0 0-.16.058l-2.098 1.738a1.75 1.75 0 0 1-2.24-.007l-2.065-1.73a.25.25 0 0 0-.162-.059H5.75A3.75 3.75 0 0 1 2 15.75v-9A3.75 3.75 0 0 1 5.75 3zM5.75 4.5A2.25 2.25 0 0 0 3.5 6.75v9A2.25 2.25 0 0 0 5.75 18h2.901c.412 0 .81.145 1.125.41l2.065 1.73a.25.25 0 0 0 .32 0l2.099-1.738A1.75 1.75 0 0 1 15.376 18h2.874a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25zm6.25 3a.75.75 0 0 1 .75.75v2.25H15a.75.75 0 0 1 0 1.5h-2.25v2.25a.75.75 0 0 1-1.5 0V12H9a.75.75 0 0 1 0-1.5h2.25V8.25A.75.75 0 0 1 12 7.5"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M5.75 2.5a.75.75 0 0 0-.75.75V4H2.5a.5.5 0 0 0 0 1h.614l.573 7.454A1.75 1.75 0 0 0 5.435 14h5.13a1.75 1.75 0 0 0 1.748-1.546L12.886 5h.614a.5.5 0 0 0 0-1H11v-.75a.75.75 0 0 0-.75-.75h-4.5ZM10 4H6v-.75a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25V4Z" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" strokeLinecap="round" />
    </svg>
  );
}

export function SessionSelector({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
  onDelete,
}: SessionSelectorProps) {
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const [open, setOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase()),
      )
    : sessions;

  const handleSelect = useCallback(
    (sessionId: string) => {
      onSelect(sessionId);
      setOpen(false);
      setConfirmingId(null);
      setSearch("");
    },
    [onSelect],
  );

  const handleDelete = useCallback(
    (sessionId: string) => {
      onDelete(sessionId);
      setConfirmingId(null);
    },
    [onDelete],
  );

  return (
    <div className="flex items-center gap-1.5">
      {/* History toggle */}
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          setConfirmingId(null);
          setSearch("");
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            />
          }
        >
          <HistoryIcon className="h-3.5 w-3.5" />
          <span className="max-w-[140px] truncate">
            {activeSession?.title ?? "历史对话"}
          </span>
          <svg
            aria-hidden="true"
            className={`h-3 w-3 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-(--available-height) w-64 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
        >
          {/* Header */}
          <div className="shrink-0 px-2.5 pt-2.5 pb-2">
            <PopoverTitle className="mb-2 text-xs font-medium">
              历史对话
            </PopoverTitle>
            {/* Search */}
            <div className="relative">
              <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
              <Input
                type="search"
                aria-label="搜索历史对话"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="请输入搜索关键词"
                className="pl-7 text-xs md:text-xs"
              />
            </div>
          </div>

          {/* Session list */}
          <ScrollArea
            orientation="vertical"
            className="min-h-0 max-h-60 overflow-y-auto overscroll-contain px-1 pb-1"
          >
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground/70">
                {search ? "无匹配结果" : "暂无对话"}
              </p>
            )}
            {filtered.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center justify-between gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors focus-within:bg-muted ${
                  s.id === activeSessionId
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {confirmingId === s.id ? (
                  /* Inline confirm */
                  <>
                    <span className="truncate flex-1">{s.title}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingId(null);
                        }}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded text-xs text-destructive-foreground bg-destructive hover:bg-destructive/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s.id);
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </>
                ) : (
                  /* Normal state */
                  <>
                    <button
                      type="button"
                      className="min-w-0 truncate flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => handleSelect(s.id)}
                    >
                      {s.title}
                    </button>
                    {s.id === activeSessionId && (
                      <CheckIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    )}
                    <button
                      type="button"
                      aria-label={`删除${s.title}`}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 outline-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingId(s.id);
                      }}
                    >
                      <TrashIcon className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* New chat button */}
      <button
        type="button"
        onClick={onNewChat}
        className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        title="新建对话"
      >
        <NewChatIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
