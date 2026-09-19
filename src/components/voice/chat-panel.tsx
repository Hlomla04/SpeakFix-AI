"use client";

import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { Equalizer } from "./equalizer";

interface ChatPanelProps {
  messages: ChatMessage[];
  interimTranscript: string;
  isAgentSpeaking: boolean;
  isAgentThinking: boolean;
}

/**
 * Conversation transcript: glass agent bubbles on the left, gradient
 * user bubbles on the right, plus a live interim-transcript bubble
 * while the user is speaking.
 */
export function ChatPanel({
  messages,
  interimTranscript,
  isAgentSpeaking,
  isAgentThinking,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, interimTranscript, isAgentThinking]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar"
      role="log"
      aria-live="polite"
      aria-label="Conversation transcript"
    >
      {messages.map((msg, i) => {
        const isAgent = msg.role === "agent";
        const isLatestAgent = isAgent && i === messages.length - 1;
        return (
          <div
            key={`${msg.timestamp}-${i}`}
            className={cn("flex items-start gap-2.5", !isAgent && "flex-row-reverse")}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl mt-0.5",
                isAgent
                  ? "bg-brand-gradient text-white shadow-md shadow-primary/30"
                  : "bg-card/80 text-foreground border backdrop-blur-sm"
              )}
              aria-hidden
            >
              {isAgent ? <Bot className="h-4.5 w-4.5" /> : <User className="h-4.5 w-4.5" />}
            </div>
            <div
              className={cn(
                "relative max-w-[80%] px-4 py-2.5 text-sm leading-relaxed",
                isAgent
                  ? "rounded-2xl rounded-tl-sm border bg-card/70 backdrop-blur-md text-foreground rounded-tl-md shadow-sm"
                  : "rounded-2xl rounded-tr-md bg-brand-gradient text-white shadow-lg shadow-primary/25"
              )}
            >
              {isAgent && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl rounded-tl-sm bg-gradient-to-br from-primary/8 to-cyan-500/8"
                />
              )}
              <p className="relative whitespace-pre-wrap break-words">{msg.content}</p>
              {isLatestAgent && isAgentSpeaking && (
                <p className="relative mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary dark:text-primary/90">
                  <Equalizer className="h-3" barsClassName="!w-[2px]" ariaLabel="Agent is speaking" />
                  Speaking…
                </p>
              )}
            </div>
          </div>
        );
      })}

      {/* Interim transcript while the user speaks */}
      {interimTranscript && (
        <div className="flex items-start gap-2.5 flex-row-reverse">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl mt-0.5 bg-card/80 text-foreground border backdrop-blur-sm"
            aria-hidden
          >
            <User className="h-4.5 w-4.5" />
          </div>
          <div className="max-w-[80%] rounded-2xl rounded-tr-md border border-dashed border-primary/50 bg-primary/5 backdrop-blur-sm px-4 py-2.5 text-sm text-primary dark:text-primary/90 leading-relaxed">
            <p className="whitespace-pre-wrap break-words italic">
              {interimTranscript}…
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold">
              <Equalizer className="h-2.5" barsClassName="!w-[2px]" ariaLabel="Listening" />
              Listening
            </p>
          </div>
        </div>
      )}

      {/* Agent thinking indicator */}
      {isAgentThinking && (
        <div className="flex items-start gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl mt-0.5 bg-brand-gradient text-white shadow-md shadow-primary/30"
            aria-hidden
          >
            <Bot className="h-4.5 w-4.5" />
          </div>
          <div className="rounded-2xl rounded-tl-sm border bg-card/70 backdrop-blur-md px-4 py-3 flex items-center gap-1.5 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
            <span className="h-2 w-2 rounded-full bg-cyan-500 animate-bounce [animation-delay:150ms]" />
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" />
            <span className="sr-only">Agent is thinking</span>
          </div>
        </div>
      )}
    </div>
  );
}
