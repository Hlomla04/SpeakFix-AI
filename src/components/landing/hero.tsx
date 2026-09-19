"use client";

import Link from "next/link";
import { ArrowRight, AudioLines, Check, Mic, User } from "lucide-react";

/* Staged conversation shown inside the hero chat mockup */
const conversation: { role: "user" | "agent"; text: string }[] = [
  {
    role: "user",
    text: "The projector in Room 204 keeps switching off, and we have a lecture there tomorrow.",
  },
  { role: "agent", text: "Got it. A high-priority AV issue for Room 204. I'll create the ticket now." },
  { role: "user", text: "Yes please, the sooner the better." },
  {
    role: "agent",
    text: "Ticket SF-2041 is in. Once the repair is done, I'll check back to make sure it's actually fixed.",
  },
];

function ChatBubble({ role, text, delay }: { role: "user" | "agent"; text: string; delay: number }) {
  const isUser = role === "user";
  return (
    <div
      className={`msg-in flex items-start gap-2.5 ${isUser ? "flex-row" : "flex-row"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Avatar */}
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-[#1e293b] text-slate-300 ring-1 ring-[#334155]"
            : "bg-gradient-to-br from-[#4f6ef7] to-[#6b8cff] text-white shadow-[0_0_14px_rgba(79,110,247,0.5)]"
        }`}
        aria-hidden
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <AudioLines className="h-3.5 w-3.5" />}
      </span>
      {/* Bubble */}
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? "rounded-tl-md bg-[#1e293b] text-slate-200"
            : "rounded-tl-md bg-[#253352] text-slate-100"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

export function LandingHero() {
  return (
    <section id="home" className="landing relative overflow-hidden bg-[#0a0e27]">
      {/* Atmosphere */}
      <div className="hero-glow absolute inset-0" aria-hidden />
      <div className="mesh-grid absolute inset-0" aria-hidden />
      {/* Bottom fade into next section */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#0a0e27]" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-36 lg:px-8 lg:pb-28 lg:pt-44">
        <div className="grid items-center gap-16 lg:grid-cols-[45%_55%] lg:gap-8">
          {/* ------------------------------ Left: copy ------------------------------ */}
          <div className="reveal reveal-visible text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#4f6ef7]/30 bg-[#4f6ef7]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#6b8cff]">
              <span className="live-dot" aria-hidden />
              Speak. Fix. Verify.
            </span>

            <h1 className="font-display mt-6 text-5xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-6xl lg:text-[64px]">
              Don&apos;t fill out a
              <br />
              maintenance form.{" "}
              <span className="bg-gradient-to-r from-[#4f6ef7] via-[#6b8cff] to-[#00d4ff] bg-clip-text text-transparent">
                Just speak.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-[480px] text-base leading-relaxed text-slate-400 lg:mx-0 sm:text-lg">
              Turn everyday maintenance complaints into actionable tickets, and verify
              that they&apos;re actually fixed. Just tell Iris what&apos;s wrong; she handles the rest.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <Link
                href="/signup"
                className="btn-primary-landing group inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-[15px] font-semibold"
              >
                Get Started
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </Link>
              <Link
                href="/login"
                className="btn-ghost-landing inline-flex items-center rounded-full px-8 py-3.5 text-[15px] font-semibold"
              >
                Sign In
              </Link>
            </div>

            {/* Trust badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500 lg:justify-start">
              {["No forms", "Smart follow-ups", "Verified fixes"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[#10b981]" aria-hidden />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* --------------------------- Right: visual --------------------------- */}
          <div className="relative mx-auto w-full max-w-[560px] px-6 sm:px-10 lg:px-0">
            {/* Character illustration — overlaps the chat window from the left */}
            <img
              src="/hero-character.png"
              alt="SpeakFix AI voice assistant presenting the live conversation interface"
              className="animate-float-soft pointer-events-none absolute bottom-0 left-0 z-10 w-44 select-none sm:w-56 lg:-left-16 lg:w-72"
              aria-hidden={false}
            />

            {/* Chat window mockup */}
            <div className="chat-tilt relative z-20 ml-auto w-full max-w-[440px] rounded-2xl border border-[#253054] bg-[#111836] shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]">
              {/* Window header */}
              <div className="flex items-center justify-between border-b border-[#253054] px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="live-dot" aria-hidden />
                  <span className="text-sm font-semibold text-white">Live Conversation</span>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-medium text-[#10b981]">
                  <span className="eq-bar !h-3" style={{ animationDuration: "0.8s" }} />
                  <span className="eq-bar !h-2" style={{ animationDuration: "1.1s", animationDelay: "0.2s" }} />
                  <span className="eq-bar !h-3.5" style={{ animationDuration: "0.9s", animationDelay: "0.4s" }} />
                  Listening…
                </span>
              </div>

              {/* Messages */}
              <div className="flex flex-col gap-4 px-5 py-5">
                {conversation.map((m, i) => (
                  <ChatBubble key={i} role={m.role} text={m.text} delay={350 + i * 900} />
                ))}

                {/* Typing indicator */}
                <div className="msg-in flex items-center gap-2.5" style={{ animationDelay: "4100ms" }}>
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4f6ef7] to-[#6b8cff] text-white"
                    aria-hidden
                  >
                    <AudioLines className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-[#253352] px-4 py-3">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>

              {/* Floating mic button — overlaps the bottom edge */}
              <div className="absolute -bottom-8 left-1/2 z-30 -translate-x-1/2">
                <span className="pulse-ring" aria-hidden />
                <span className="pulse-ring delay-1" aria-hidden />
                <span className="pulse-ring delay-2" aria-hidden />
                <span className="mic-glow relative flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#4f6ef7]/80">
                  <Mic className="h-6 w-6 text-white" aria-hidden />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
