"use client";

import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export function VideoDurationControl({
  id,
  value,
  options,
  extension = false,
  onValueChange,
}: {
  id: string;
  value: number;
  options: readonly number[];
  extension?: boolean;
  onValueChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const minimum = options[0] ?? value;
  const maximum = options.at(-1) ?? value;
  const isRange =
    options.length > 1 &&
    options.every((duration, index) => duration === minimum + index);

  const commit = () => {
    const parsed = draft.trim() ? Number(draft) : value;
    const duration = Number.isFinite(parsed) ? Math.round(parsed) : value;
    const next = Math.min(maximum, Math.max(minimum, duration));
    setDraft(String(next));
    if (next !== value) onValueChange(next);
  };

  if (isRange) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={id}>时长</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              aria-label="时长（秒）"
              min={minimum}
              max={maximum}
              step={1}
              value={draft}
              className="h-7 w-16 text-center tabular-nums"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
              }}
            />
            <span className="text-xs text-muted-foreground">秒</span>
          </div>
        </div>
        <input
          id={id}
          type="range"
          min={minimum}
          max={maximum}
          step={1}
          value={value}
          aria-valuetext={`${value} 秒`}
          className="h-4 w-full cursor-pointer accent-accent"
          onChange={(event) => onValueChange(Number(event.target.value))}
        />
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{minimum} 秒</span>
          <span>{maximum} 秒</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>时长</Label>
      <Select
        value={value}
        disabled={options.length <= 1}
        items={options.map((duration) => ({
          value: duration,
          label: extension ? "续写 7 秒" : `${duration} 秒`,
        }))}
        onValueChange={(duration) => {
          if (duration != null) onValueChange(duration);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((duration) => (
              <SelectItem key={duration} value={duration}>
                {extension ? "续写 7 秒" : `${duration} 秒`}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
