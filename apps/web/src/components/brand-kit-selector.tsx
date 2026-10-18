"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchBrandKits } from "@/lib/brand-kit-api";
import { updateProject } from "@/lib/server-api";
import type { BrandKitSummary } from "@loomic/shared";

interface BrandKitSelectorProps {
  accessToken: string;
  projectId: string;
  currentBrandKitId: string | null;
  onBrandKitChange: (kitId: string | null) => void;
}

export function BrandKitSelector({
  accessToken,
  projectId,
  currentBrandKitId,
  onBrandKitChange,
}: BrandKitSelectorProps) {
  const [kits, setKits] = useState<BrandKitSummary[]>([]);
  const [updating, setUpdating] = useState(false);

  // Use a ref for accessToken to prevent tab-switch reload cascades.
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  // Fetch brand kits on mount
  useEffect(() => {
    let cancelled = false;
    fetchBrandKits(accessTokenRef.current)
      .then((res) => {
        if (!cancelled) setKits(res.brandKits);
      })
      .catch(() => {
        /* silently ignore – selector stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentKit = kits.find((k) => k.id === currentBrandKitId);
  const label = currentKit ? currentKit.name : "品牌套件: 无";

  const handleSelect = useCallback(
    async (kitId: string | null) => {
      if (kitId === currentBrandKitId) {
        return;
      }
      setUpdating(true);
      try {
        await updateProject(accessTokenRef.current, projectId, {
          brand_kit_id: kitId,
        });
        onBrandKitChange(kitId);
      } catch {
        /* keep current state on failure */
      } finally {
        setUpdating(false);
      }
    },
    [projectId, currentBrandKitId, onBrandKitChange],
  );

  return (
    <Select
      items={[
        { value: "", label: "无" },
        ...kits.map((kit) => ({ value: kit.id, label: kit.name })),
      ]}
      value={currentBrandKitId ?? ""}
      disabled={updating}
      onValueChange={(value) => {
        if (value !== null) void handleSelect(value || null);
      }}
    >
      <SelectTrigger
        aria-label="品牌套件"
        className="max-w-48 bg-card/80 shadow-sm backdrop-blur-sm"
      >
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="min-w-44 max-w-[calc(100vw-1rem)]"
      >
        <SelectGroup>
          <SelectItem value="">无</SelectItem>
          {kits.map((kit) => (
            <SelectItem key={kit.id} value={kit.id} title={kit.name}>
              <span className="truncate">{kit.name}</span>
            </SelectItem>
          ))}
          {kits.length === 0 && (
            <p className="px-1.5 py-2 text-xs text-muted-foreground">
              暂无品牌套件
            </p>
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
