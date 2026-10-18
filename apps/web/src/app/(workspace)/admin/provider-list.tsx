"use client";

import { Button } from "@/components/ui/button";
import type { ConfiguredModel, ProviderConfig } from "@loomic/shared";
import { Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { GripVerticalIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ProviderAvatar } from "./provider-avatar";

const CATEGORY_LABELS = {
  manufacturer: "模型厂商",
  third_party: "第三方",
  cloud: "云服务商",
  custom: "自定义",
};

type ProviderListProps = {
  providers: ProviderConfig[];
  models: ConfiguredModel[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (provider: ProviderConfig) => void;
  onOrderChange: (providers: ProviderConfig[]) => Promise<void>;
};

export function ProviderList({
  providers,
  models,
  selectedId,
  disabled,
  onSelect,
  onOrderChange,
}: ProviderListProps) {
  const [order, setOrder] = useState(providers);
  const orderRef = useRef(providers);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const instructionsId = useId();

  useEffect(() => {
    orderRef.current = providers;
    setOrder(providers);
  }, [providers]);

  function reorder(next: ProviderConfig[]) {
    orderRef.current = next;
    setOrder(next);
  }

  async function commitOrder() {
    if (disabled || savingRef.current) return;
    const next = orderRef.current;
    if (next.every((provider, index) => provider.id === providers[index]?.id))
      return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onOrderChange(next);
    } catch {
      // The parent reports the failure through the shared Toast system.
      reorder(providers);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <nav aria-label="模型提供商" aria-busy={saving}>
      <p id={instructionsId} className="sr-only">
        拖动手柄调整顺序，也可聚焦手柄后按上、下方向键。排序自动保存。
      </p>
      <Reorder.Group
        axis="y"
        values={order.map((provider) => provider.id)}
        onReorder={(ids: string[]) => {
          const byId = new Map(orderRef.current.map((p) => [p.id, p]));
          reorder(ids.flatMap((id) => byId.get(id) ?? []));
        }}
        className="flex flex-col gap-1"
      >
        {order.map((provider, index) => (
          <ProviderListItem
            key={provider.id}
            provider={provider}
            enabledCount={
              models.filter((m) => m.providerId === provider.id && m.enabled)
                .length
            }
            active={selectedId === provider.id}
            disabled={disabled || saving}
            sortable={order.length > 1}
            instructionsId={instructionsId}
            onSelect={() => onSelect(provider)}
            onDragEnd={() => void commitOrder()}
            onMove={(direction) => {
              if (disabled || savingRef.current) return;
              const target = index + direction;
              if (target < 0 || target >= order.length) return;
              const next = [...order];
              next.splice(index, 1);
              next.splice(target, 0, provider);
              reorder(next);
              void commitOrder();
            }}
          />
        ))}
      </Reorder.Group>
      <p aria-live="polite" className="sr-only">
        {saving ? "正在保存提供商排序…" : ""}
      </p>
    </nav>
  );
}

function ProviderListItem({
  provider,
  enabledCount,
  active,
  disabled,
  sortable,
  instructionsId,
  onSelect,
  onDragEnd,
  onMove,
}: {
  provider: ProviderConfig;
  enabledCount: number;
  active: boolean;
  disabled: boolean;
  sortable: boolean;
  instructionsId: string;
  onSelect: () => void;
  onDragEnd: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const controls = useDragControls();
  const reducedMotion = useReducedMotion();
  const status = provider.enabled ? "提供商已启用" : "提供商已停用";
  return (
    <Reorder.Item
      value={provider.id}
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      {...(reducedMotion ? { transition: { duration: 0 } } : {})}
      aria-label={provider.name}
      className={`relative flex min-w-0 items-center rounded-lg border bg-card pl-1 transition-colors ${active ? "border-border/70 bg-muted" : "border-transparent hover:bg-muted/50"}`}
    >
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={`排序 ${provider.name}`}
        aria-describedby={instructionsId}
        aria-keyshortcuts="ArrowUp ArrowDown"
        title="拖动排序，或用 ↑ / ↓ 键调整"
        disabled={disabled || !sortable}
        className="touch-none cursor-grab text-muted-foreground/60 active:translate-y-0 active:cursor-grabbing"
        onPointerDown={(event) => {
          if (!disabled && sortable && event.button === 0)
            controls.start(event);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          event.stopPropagation();
          onMove(event.key === "ArrowUp" ? -1 : 1);
        }}
      >
        <GripVerticalIcon aria-hidden="true" className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        type="button"
        disabled={disabled}
        onClick={onSelect}
        aria-label={provider.name}
        aria-describedby={`provider-meta-${provider.id} provider-status-${provider.id}`}
        aria-pressed={active}
        className="h-auto min-w-0 flex-1 justify-start gap-2.5 rounded-lg border-0 bg-transparent p-2.5 text-left hover:bg-transparent active:translate-y-0"
      >
        <ProviderAvatar preset={provider.preset} name={provider.name} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center justify-between gap-2">
            <span
              className="truncate text-sm font-medium leading-5 text-foreground"
              title={provider.name}
            >
              {provider.name}
            </span>
            <span
              aria-hidden="true"
              title={status}
              className={`size-1.5 shrink-0 rounded-full ${provider.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
            />
            <span id={`provider-status-${provider.id}`} className="sr-only">
              {status}
            </span>
          </span>
          <span
            id={`provider-meta-${provider.id}`}
            className="flex items-center justify-between gap-2 text-xs font-normal leading-4 text-muted-foreground"
          >
            <span className="truncate">
              {CATEGORY_LABELS[provider.category]}
            </span>
            <span
              className="shrink-0 tabular-nums"
              title={`${enabledCount} 个启用模型`}
            >
              已启用 {enabledCount}
            </span>
          </span>
        </span>
      </Button>
    </Reorder.Item>
  );
}
