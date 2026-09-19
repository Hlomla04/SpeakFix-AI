"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Equalizer } from "./equalizer";

interface MicButtonProps {
  isListening: boolean;
  isProcessing: boolean;
  isTranscribing: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label?: string;
}

/**
 * The voice orb — a glowing conic-gradient aura with pulse rings while
 * listening and live equalizer bars at its base.
 */
export function MicButton({
  isListening,
  isProcessing,
  isTranscribing,
  disabled = false,
  onToggle,
  label,
}: MicButtonProps) {
  const busy = isProcessing || isTranscribing;

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative flex h-28 w-28 items-center justify-center">
              {/* Rotating conic aura */}
              <span
                aria-hidden
                className={cn(
                  "conic-aura absolute -inset-1.5 rounded-full opacity-70 blur-[10px] transition-opacity duration-500",
                  isListening && "conic-aura-fast opacity-95",
                  busy && "opacity-40",
                  disabled && "opacity-20"
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "conic-aura absolute -inset-1 rounded-full transition-opacity duration-500",
                  isListening && "conic-aura-fast",
                  busy && "opacity-50",
                  disabled && "opacity-25"
                )}
              />

              {/* Pulse rings while listening */}
              {isListening && (
                <>
                  <span className="absolute inset-0 rounded-full bg-rose-500/40 animate-ping-slow" />
                  <span
                    className="absolute inset-0 rounded-full bg-rose-500/25 animate-ping-slow"
                    style={{ animationDelay: "0.45s" }}
                  />
                  <span
                    className="absolute inset-0 rounded-full bg-rose-500/15 animate-ping-slow"
                    style={{ animationDelay: "0.9s" }}
                  />
                </>
              )}

              <button
                type="button"
                onClick={onToggle}
                disabled={disabled}
                aria-label={
                  isListening ? "Stop recording" : "Start recording, describe your issue"
                }
                aria-pressed={isListening}
                className={cn(
                  "relative flex h-24 w-24 items-center justify-center rounded-full",
                  "transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/45",
                  "touch-manipulation",
                  disabled && "opacity-50 cursor-not-allowed",
                  !disabled && "cursor-pointer active:scale-95",
                  busy
                    ? "bg-card/90 text-foreground border shadow-lg shadow-primary/20 backdrop-blur-md"
                    : isListening
                      ? "scale-105 bg-brand-gradient text-white shadow-[0_10px_36px_-6px_oklch(0.652_0.177_264/0.7),inset_0_1px_0_0_oklch(1_0_0/0.45)] border border-white/30"
                      : "bg-brand-gradient text-white shadow-[0_10px_30px_-8px_oklch(0.561_0.209_264/0.65),inset_0_1px_0_0_oklch(1_0_0/0.4)] border border-white/25 hover:scale-105"
                )}
              >
                {/* Glass sheen */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-3 top-1.5 h-1/3 rounded-full bg-gradient-to-b from-white/35 to-transparent"
                />
                <span className="relative flex flex-col items-center gap-1.5">
                  {busy ? (
                    <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
                  ) : isListening ? (
                    <>
                      <MicOff className="h-8 w-8" aria-hidden />
                      <Equalizer
                        className="h-3 text-white/90"
                        barsClassName="!w-[2.5px]"
                        ariaLabel="Recording level"
                      />
                    </>
                  ) : (
                    <Mic className="h-10 w-10" aria-hidden />
                  )}
                </span>
              </button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            {disabled
              ? "Agent is thinking…"
              : isListening
                ? "Tap to stop & send"
                : "Tap and describe your issue"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="h-5">
        {label && (
          <p
            className={cn(
              "text-sm font-medium animate-pulse font-display",
              isListening
                ? "text-rose-500 dark:text-rose-400"
                : busy
                  ? "text-primary"
                  : "text-muted-foreground"
            )}
          >
            {label}
          </p>
        )}
      </div>
    </div>
  );
}
