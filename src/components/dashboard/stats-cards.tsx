"use client";

import { CircleDot, Loader, BadgeCheck, CheckCircle2, RotateCcw } from "lucide-react";
import type { TicketStats } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatsCardsProps {
  stats: TicketStats;
  /** Queue/all scopes include reopened tickets as their own state */
  showReopened?: boolean;
}

/** Plain, real numbers for the states people actually act on. No invented analytics. */
export function StatsCards({ stats, showReopened = false }: StatsCardsProps) {
  const items = [
    { label: "Open", value: stats.open, icon: CircleDot, dot: "bg-blue-500" },
    { label: "In progress", value: stats.inProgress, icon: Loader, dot: "bg-amber-500" },
    {
      label: "Awaiting verification",
      value: stats.awaitingVerification,
      icon: BadgeCheck,
      dot: "bg-violet-500",
    },
    { label: "Resolved", value: stats.resolved, icon: CheckCircle2, dot: "bg-emerald-500" },
    ...(showReopened
      ? [{ label: "Reopened", value: stats.reopened, icon: RotateCcw, dot: "bg-rose-500" }]
      : []),
  ];

  return (
    <dl
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border bg-border/60",
        showReopened ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4"
      )}
    >
      {items.map(({ label, value, icon: Icon, dot }) => (
        <div key={label} className="flex items-center gap-3 bg-card px-4 py-3">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className={`h-2 w-2 rounded-full ${dot}`} />
          </span>
          <div className="min-w-0">
            <dd className="text-xl font-semibold tabular-nums leading-none">{value}</dd>
            <dt className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Icon className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </dt>
          </div>
        </div>
      ))}
    </dl>
  );
}
