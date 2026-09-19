"use client";

import { cn } from "@/lib/utils";

interface EqualizerProps {
  className?: string;
  barsClassName?: string;
  /** Static (no animation) when false — used for idle states */
  active?: boolean;
  ariaLabel?: string;
}

const DELAYS = ["0ms", "140ms", "280ms", "80ms", "200ms"];
const DURATIONS = ["0.9s", "1.1s", "0.8s", "1.2s", "1s"];

/**
 * Animated equalizer bars — a live voice-activity indicator.
 */
export function Equalizer({
  className,
  barsClassName,
  active = true,
  ariaLabel,
}: EqualizerProps) {
  return (
    <span
      className={cn(
        "inline-flex h-4 items-end justify-center gap-[2.5px]",
        !active && "opacity-50",
        className
      )}
      role="img"
      aria-label={ariaLabel ?? (active ? "Voice active" : "Voice idle")}
      aria-hidden={false}
    >
      {DELAYS.map((delay, i) => (
        <span
          key={i}
          className={cn("eq-bar", barsClassName)}
          style={{
            animationDelay: delay,
            animationDuration: DURATIONS[i],
            ...(active ? {} : { animation: "none", height: "38%" }),
          }}
        />
      ))}
    </span>
  );
}
