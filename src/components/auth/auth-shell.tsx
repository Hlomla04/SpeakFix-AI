"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AudioLines, Mic, Brain, Ticket, ShieldCheck } from "lucide-react";

/**
 * Shared shell for the auth pages (/login, /signup, /forgot-password, /reset-password).
 * Deep Signal identity: navy sky + electric-blue glow + brand panel + glass form card.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  narrow = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="landing relative flex min-h-screen flex-col bg-[#0a0e27] font-sans">
      {/* Atmosphere */}
      <div className="hero-glow absolute inset-0" aria-hidden />
      <div className="mesh-grid absolute inset-0" aria-hidden />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-10 lg:px-8">
        <div className="grid w-full items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* ------------------------- Brand panel ------------------------- */}
          <div className="relative hidden min-h-[560px] lg:block">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#4f6ef7] to-[#6b8cff] text-white shadow-[0_4px_18px_rgba(79,110,247,0.5)]">
                <AudioLines className="h-5 w-5" aria-hidden />
              </span>
              <span className="font-display text-lg font-bold tracking-tight text-white">
                SpeakFix <span className="text-[#6b8cff]">AI</span>
              </span>
            </Link>

            <h1 className="font-display relative z-10 mt-10 max-w-lg text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">
              Your voice is the{" "}
              <span className="bg-gradient-to-r from-[#4f6ef7] via-[#6b8cff] to-[#00d4ff] bg-clip-text text-transparent">
                ticket form.
              </span>
            </h1>
            <p className="relative z-10 mt-4 max-w-md pr-6 text-base leading-relaxed text-slate-400">
              Report maintenance issues by simply speaking. SpeakFix listens, asks smart
              follow-ups, and files a structured ticket. Every report is tied to your account,
              private to you.
            </p>

            <ul className="relative z-10 mt-8 space-y-3.5">
              {[
                { icon: Mic, text: "Speak naturally, no forms to fill in" },
                { icon: Brain, text: "AI follow-ups & auto-classification" },
                { icon: Ticket, text: "Structured tickets, created in seconds" },
                { icon: ShieldCheck, text: "Your tickets stay private to your account" },
              ].map((item) => (
                <li key={item.text} className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#253054] bg-[#111836] text-[#6b8cff]">
                    <item.icon className="h-4 w-4" aria-hidden />
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          {/* ------------------------- Form card ------------------------- */}
          <div className={`mx-auto w-full ${narrow ? "max-w-md" : "max-w-lg"}`}>
            {/* Compact logo (mobile + small screens) */}
            <Link href="/" className="mb-8 inline-flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#4f6ef7] to-[#6b8cff] text-white shadow-[0_4px_18px_rgba(79,110,247,0.5)]">
                <AudioLines className="h-4.5 w-4.5" aria-hidden />
              </span>
              <span className="font-display text-base font-bold tracking-tight text-white">
                SpeakFix <span className="text-[#6b8cff]">AI</span>
              </span>
            </Link>

            <div className="rounded-2xl border border-[#253054] bg-[#111836]/80 p-7 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-9">
              <h2 className="font-display text-2xl font-bold tracking-tight text-white">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{subtitle}</p>

              <div className="mt-7">{children}</div>
            </div>

            {footer && <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
