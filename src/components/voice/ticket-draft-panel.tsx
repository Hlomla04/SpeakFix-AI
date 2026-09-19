"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  MapPin,
  Tag,
  User,
  Flag,
  FileText,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { AgentPhase, TicketFields } from "@/lib/types";

interface TicketDraftPanelProps {
  fields: TicketFields;
  missing: string[];
  phase: AgentPhase;
}

const FIELD_META: {
  key: keyof TicketFields;
  label: string;
  icon: typeof FileText;
  placeholder: string;
}[] = [
  { key: "description", label: "Problem", icon: FileText, placeholder: "What's wrong…" },
  { key: "location", label: "Location", icon: MapPin, placeholder: "Where…" },
  { key: "category", label: "Category", icon: Tag, placeholder: "Auto-classified" },
  { key: "priority", label: "Priority", icon: Flag, placeholder: "Auto-detected" },
  { key: "title", label: "Title", icon: FileText, placeholder: "Short summary" },
  { key: "requesterName", label: "Reporter", icon: User, placeholder: "Your name" },
  { key: "urgencyReason", label: "Urgency", icon: Clock, placeholder: "Why urgent" },
];

const CORE_KEYS: (keyof TicketFields)[] = [
  "description",
  "location",
  "category",
  "priority",
];

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "URGENT":
      return "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800";
    case "HIGH":
      return "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800";
    case "MEDIUM":
      return "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800";
    case "LOW":
      return "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * The live ticket draft, styled as a physical ticket stub: a brand strip
 * up top, dotted-leader fields like a real form, and a barcode footer
 * with punched side notches (mask applied by the wrapper).
 */
export function TicketDraftPanel({ fields, missing, phase }: TicketDraftPanelProps) {
  const filledCore = CORE_KEYS.filter((k) => fields[k]?.trim()).length;
  const progress = Math.round((filledCore / CORE_KEYS.length) * 100);

  return (
    <div className="flex flex-col h-full" aria-label="Live ticket draft">
      {/* Brand strip */}
      <div className="h-1.5 w-full bg-brand-gradient" aria-hidden />

      {/* Header */}
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold tracking-[0.08em] flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden />
            Ticket Draft
          </h3>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] uppercase tracking-wide font-bold",
              phase === "confirming" || phase === "done"
                ? "border-primary/50 text-primary dark:text-primary/90 bg-primary/5"
                : "border-amber-400/60 text-amber-600 dark:text-amber-400 bg-amber-500/5"
            )}
          >
            {phase === "gathering" && "Gathering info"}
            {phase === "confirming" && "Awaiting confirmation"}
            {phase === "done" && "Ticket created"}
          </Badge>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Progress
            value={progress}
            className="progress-brand h-2 flex-1 bg-primary/10"
            aria-label="Ticket completeness"
          />
          <span className="text-xs font-bold text-muted-foreground tabular-nums">
            {progress}%
          </span>
        </div>
      </div>

      {/* Tear line under the header */}
      <div className="perforation mx-3" aria-hidden />

      {/* Fields — dotted-leader rows like a printed form */}
      <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3.5 custom-scrollbar">
        {FIELD_META.map(({ key, label, icon: Icon, placeholder }) => {
          const value = fields[key]?.trim();
          const filled = Boolean(value);
          const isPending =
            missing.includes(key) || (key === "location" && !value && missing.includes("location"));
          return (
            <div key={key} className="flex items-start gap-2">
              <span className="flex w-[92px] shrink-0 items-center gap-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                {label}
              </span>
              <span
                aria-hidden
                className={cn(
                  "mt-2 flex-1 border-b-2 border-dotted",
                  filled ? "border-primary/30" : "border-border"
                )}
              />
              <span className="flex max-w-[58%] items-start justify-end gap-1.5 text-right">
                {key === "priority" && filled ? (
                  <Badge variant="outline" className={priorityBadgeClass(value)}>
                    {value}
                  </Badge>
                ) : (
                  <span
                    className={cn(
                      "text-sm break-words leading-snug",
                      filled
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground/80 italic font-normal"
                    )}
                  >
                    {value || placeholder}
                  </span>
                )}
                {filled ? (
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden
                  />
                ) : isPending ? (
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 animate-pulse"
                    aria-hidden
                  />
                ) : (
                  <CircleDashed
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/35"
                    aria-hidden
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Barcode footer (keeps a fixed h-14 so the punched notches line up) */}
      <footer className="flex h-14 shrink-0 items-center justify-between gap-4 border-t-2 border-dashed border-foreground/20 px-4">
        <div className="barcode w-28 text-foreground" aria-hidden />
        <p className="font-mono text-[10px] font-semibold tracking-[0.28em] text-muted-foreground">
          SF·VOICE
        </p>
      </footer>
    </div>
  );
}
