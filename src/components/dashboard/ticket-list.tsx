"use client";

import { MapPin, Mic, ChevronRight } from "lucide-react";
import { PriorityTag, StatusTag, CategoryTag } from "./ticket-badges";
import type { TicketRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TicketListProps {
  tickets: TicketRecord[];
  onSelect: (ticket: TicketRecord) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export function TicketList({ tickets, onSelect }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-14 text-center">
        <p className="text-sm font-medium text-muted-foreground">Nothing here</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          No tickets match your filters. Report a new issue with your voice.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-card" role="list">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <button
            type="button"
            onClick={() => onSelect(ticket)}
            className={cn(
              "group flex w-full items-center gap-3 px-4 py-3 text-left",
              "transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.04]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/45 cursor-pointer"
            )}
            aria-label={`Open ticket ${ticket.ticketNumber}: ${ticket.title}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  {ticket.ticketNumber}
                </span>
                {ticket.source === "voice" && (
                  <Mic className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-label="Reported by voice" />
                )}
                <span className="truncate text-sm font-medium">{ticket.title}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  {ticket.location}
                </span>
                {ticket.assignedTechnicianName && (
                  <span className="truncate">Assigned to {ticket.assignedTechnicianName}</span>
                )}
                {ticket.reopenCount > 0 && (
                  <span className="text-rose-600 dark:text-rose-400">
                    Reopened {ticket.reopenCount}×
                  </span>
                )}
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
              <CategoryTag category={ticket.category} />
              <PriorityTag priority={ticket.priority} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <StatusTag status={ticket.status} />
              <span className="text-[11px] text-muted-foreground/80 tabular-nums">
                {formatDate(ticket.createdAt)}
              </span>
            </div>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
