"use client";

import { cn } from "@/lib/utils";
import type { TicketPriority, TicketStatus } from "@/lib/types";

/** Small, quiet status tags — information over decoration */
export function PriorityTag({ priority }: { priority: string }) {
  const p = priority as TicketPriority;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
        p === "CRITICAL" && "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
        p === "HIGH" && "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/70 dark:text-orange-300",
        p === "MEDIUM" && "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
        p === "LOW" && "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400"
      )}
    >
      {priority.toLowerCase()}
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  const s = status as TicketStatus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
        s === "OPEN" && "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
        s === "IN_PROGRESS" && "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
        s === "AWAITING_VERIFICATION" &&
          "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
        s === "RESOLVED" &&
          "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
        s === "REOPENED" &&
          "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          s === "OPEN" && "bg-blue-500",
          s === "IN_PROGRESS" && "bg-amber-500",
          s === "AWAITING_VERIFICATION" && "bg-violet-500 animate-pulse",
          s === "RESOLVED" && "bg-emerald-500",
          s === "REOPENED" && "bg-rose-500"
        )}
      />
      {status === "AWAITING_VERIFICATION" ? "awaiting your confirmation" : status.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

/** Legacy aliases kept for older call sites */
export const PriorityBadge = PriorityTag;
export const StatusBadge = StatusTag;

export function CategoryTag({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded border border-foreground/15 bg-foreground/[0.03] px-1.5 py-px text-[10px] font-medium text-muted-foreground">
      {category}
    </span>
  );
}
export const CategoryBadge = CategoryTag;
