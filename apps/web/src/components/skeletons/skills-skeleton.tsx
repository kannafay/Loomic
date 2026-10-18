import { Skeleton } from "@/components/ui/skeleton";
import { DelayedSkeleton } from "./delayed-skeleton";

/** Skeleton placeholder matching the Skills page layout. */
export function SkillsSkeleton() {
  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      {/* Title + subtitle */}
      <h1 className="text-base font-semibold sm:text-lg">技能</h1>
      <p className="mt-1 mb-4 text-xs text-muted-foreground sm:mb-6 sm:text-sm">
        为您的智能体提供预封装且可重复的最佳实践与工具
      </p>

      <DelayedSkeleton>
        {/* Search + filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-6 sm:gap-3">
          <Skeleton className="h-10 w-20 rounded-lg sm:h-8" />
          <Skeleton className="order-last h-10 w-full rounded-lg sm:order-none sm:h-8 sm:max-w-sm sm:flex-1" />
          <Skeleton className="h-10 w-16 rounded-lg sm:h-8" />
        </div>

        {/* Banner card */}
        <Skeleton className="mb-4 h-20 w-full rounded-xl sm:mb-6 sm:h-28" />

        {/* Card grid */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          {[
            "skill-a",
            "skill-b",
            "skill-c",
            "skill-d",
            "skill-e",
            "skill-f",
          ].map((placeholderId) => (
            <div
              key={placeholderId}
              className="space-y-3 rounded-xl border border-border p-4"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex items-center justify-between border-t border-border pt-3">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </DelayedSkeleton>
    </div>
  );
}
