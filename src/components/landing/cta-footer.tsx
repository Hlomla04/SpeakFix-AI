"use client";

import Link from "next/link";
import { AudioLines, ArrowRight } from "lucide-react";

/* --------------------------------- Stats --------------------------------- */

// Honest value props — no invented metrics. Each one describes what the
// product does, not a fake number it didn't measure.
const stats = [
  { value: "Speak", label: "Report issues by voice, no forms" },
  { value: "Classify", label: "Auto-categorised & priority-detected" },
  { value: "Verify", label: "Reporter confirms the fix is real" },
  { value: "Audit", label: "Every action recorded in a timeline" },
];

export function LandingAbout() {
  return (
    <section id="about" className="landing relative overflow-hidden border-t border-[#1a2240] bg-[#0c112e] py-20">
      <div className="hero-glow absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <div className="reveal mx-auto max-w-[620px] text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Built for teams that keep places running
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">
            From universities to office parks, SpeakFix AI turns messy incident reports into clean,
            structured tickets, the moment someone speaks.
          </p>
        </div>

        <div className="reveal mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-[#253054] bg-[#111836]/70 px-6 py-8 text-center backdrop-blur-sm"
            >
              <p className="bg-gradient-to-r from-[#6b8cff] to-[#00d4ff] bg-clip-text font-display text-4xl font-extrabold text-transparent sm:text-5xl">
                {s.value}
              </p>
              <p className="mt-2.5 text-sm text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- CTA ---------------------------------- */

export function LandingCta() {
  return (
    <section className="landing relative overflow-hidden bg-gradient-to-b from-[#0a0e27] to-[#050816] py-28">
      {/* Glow */}
      <div
        className="absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4f6ef7]/15 blur-[110px]"
        aria-hidden
      />
      <div className="mesh-grid absolute inset-0 opacity-60" aria-hidden />

      <div className="reveal relative mx-auto max-w-[640px] px-5 text-center">
        <h2 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          A ticket isn&apos;t fixed just because someone{" "}
          <span className="bg-gradient-to-r from-[#4f6ef7] via-[#6b8cff] to-[#00d4ff] bg-clip-text text-transparent">
            clicked “Resolved.”
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-[520px] text-lg leading-relaxed text-slate-400">
          SpeakFix closes the loop, from the first sentence to a repair the reporter has
          confirmed.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="btn-primary-landing group inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-[15px] font-semibold"
          >
            Get Started
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
          <a
            href="#how-it-works"
            className="btn-ghost-landing inline-flex items-center rounded-full px-8 py-3.5 text-[15px] font-semibold"
          >
            Learn More
          </a>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- Footer --------------------------------- */

export function LandingFooter() {
  return (
    <footer className="landing border-t border-[#1a2240] bg-[#050816]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 py-12 sm:flex-row lg:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#4f6ef7] to-[#6b8cff] text-white">
            <AudioLines className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="font-display text-sm font-bold text-white">
              SpeakFix <span className="text-[#6b8cff]">AI</span>
            </p>
            <p className="text-xs text-slate-500">Speak. Fix. Verify.</p>
          </div>
        </div>

        <p className="text-xs text-slate-600">© 2026 SpeakFix AI. All rights reserved.</p>
      </div>
    </footer>
  );
}
