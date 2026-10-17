"use client";

import { getPlanLabel, getBillingPeriodLabel, getUserFacingError } from "@/lib/locale";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";

export function BillingSection() {
  const { subscription, loading, error, cancel } = useSubscription();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await cancel();
      setCancelConfirmOpen(false);
    } catch (err) {
      setCancelError(
        getUserFacingError(err, "取消订阅失败，请重试。"),
      );
    } finally {
      setCancelling(false);
    }
  }, [cancel]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载账单信息…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        订阅信息加载失败，请稍后重试。
      </div>
    );
  }

  const plan = subscription?.plan ?? "free";
  const isFree = plan === "free";
  const isCancelled = !!subscription?.canceledAt;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">订阅与账单</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          管理订阅套餐和账单信息。
        </p>
      </div>

      {/* Current plan card */}
      <div className="rounded-lg border p-5">
        <div className="flex items-center gap-2 mb-1">
          <Crown className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">当前套餐</span>
        </div>
        <p className="text-2xl font-bold capitalize">{getPlanLabel(plan)}</p>

        {subscription?.billingPeriod && (
          <p className="mt-1 text-sm text-muted-foreground capitalize">
            {getBillingPeriodLabel(subscription.billingPeriod)}
          </p>
        )}

        {subscription?.currentPeriodEnd && !isFree && (
          <p className="mt-1 text-sm text-muted-foreground">
            {isCancelled ? "可使用至" : "下次扣款日期"}:{" "}
            <span className="font-medium text-foreground">
              {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                "zh-CN",
                { year: "numeric", month: "long", day: "numeric" },
              )}
            </span>
          </p>
        )}

        {isCancelled && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            订阅已取消，当前套餐仍可使用至本计费周期结束。
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/pricing">
          <Button variant="default" size="lg">
            <CreditCard className="mr-1.5 h-4 w-4" />
            {isFree ? "升级套餐" : "更换套餐"}
          </Button>
        </Link>

        {subscription?.customerPortalUrl && (
          <a
            href={subscription.customerPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="lg">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              管理账单
            </Button>
          </a>
        )}

        {!isFree && !isCancelled && (
          <Button
            variant="destructive"
            size="lg"
            onClick={() => setCancelConfirmOpen(true)}
          >
            取消订阅
          </Button>
        )}
      </div>

      {/* Cancel confirmation dialog */}
      <AnimatePresence>
        {cancelConfirmOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !cancelling && setCancelConfirmOpen(false)}
            />
            <motion.div
              className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-lg"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold">确认取消订阅？</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                当前套餐仍可使用至本计费周期结束，之后将自动切换为免费版。
              </p>

              {cancelError && (
                <p className="mt-3 text-sm text-destructive">
                  {cancelError}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCancelConfirmOpen(false)}
                  disabled={cancelling}
                >
                  保留订阅
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  确认取消
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
