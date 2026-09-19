"use client";

import Link from "next/link";
import {
  Mic,
  Brain,
  MessageCircle,
  FileText,
  CheckCircle2,
  LayoutDashboard,
  Ticket,
  User,
  LogOut,
  Bell,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

/* ---------------------------------- Steps ---------------------------------- */

type Step = {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string; // icon color
  ring: string; // glow ring color
};

const steps: Step[] = [
  {
    icon: Mic,
    title: "Speak",
    description: "Describe the problem in your own words.",
    color: "text-[#3b82f6]",
    ring: "shadow-[0_0_20px_rgba(59,130,246,0.35)]",
  },
  {
    icon: Brain,
    title: "Understand",
    description: "Iris asks what's missing and classifies the issue.",
    color: "text-[#8b5cf6]",
    ring: "shadow-[0_0_20px_rgba(139,92,246,0.35)]",
  },
  {
    icon: MessageCircle,
    title: "Action",
    description: "A structured ticket is sent to the maintenance team.",
    color: "text-[#00d4ff]",
    ring: "shadow-[0_0_20px_rgba(0,212,255,0.35)]",
  },
  {
    icon: FileText,
    title: "Repair",
    description: "Technicians document the fix with tests and evidence.",
    color: "text-[#94a3b8]",
    ring: "shadow-[0_0_20px_rgba(148,163,184,0.3)]",
  },
  {
    icon: CheckCircle2,
    title: "Verify & Confirm",
    description: "The reporter confirms it's actually fixed, and then it's closed.",
    color: "text-[#10b981]",
    ring: "shadow-[0_0_20px_rgba(16,185,129,0.35)]",
  },
];

/* ------------------------------ Mockup tickets ------------------------------ */

const mockTickets = [
  { dot: "bg-red-500", title: "Projector not working", room: "Room 204", time: "2 hours ago", priority: "High", pill: "bg-red-500/15 text-red-400 border-red-500/30" },
  { dot: "bg-orange-400", title: "Leaking tap", room: "Bathroom 2F", time: "5 hours ago", priority: "Medium", pill: "bg-orange-400/15 text-orange-300 border-orange-400/30" },
  { dot: "bg-emerald-400", title: "Flickering lights", room: "Room 118", time: "Yesterday", priority: "Low", pill: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" },
];

const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: false },
  { icon: Mic, label: "Report Issue", active: true },
  { icon: Ticket, label: "My Tickets", active: false },
  { icon: User, label: "Profile", active: false },
  { icon: LogOut, label: "Logout", active: false },
];

/* ------------------------------- Component -------------------------------- */

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="landing relative overflow-hidden bg-[#0a0e27] py-24">
      {/* Atmosphere */}
      <div className="hero-glow absolute inset-0 opacity-70" aria-hidden />
      <div className="mesh-grid absolute inset-0" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        {/* Section header */}
        <div className="reveal mx-auto max-w-[600px] text-center">
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            How It Works
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            From a spoken complaint to a verified fix.
          </p>
        </div>

        <div className="mt-16 grid items-center gap-14 lg:grid-cols-[45%_55%] lg:gap-10">
          {/* ------------------------------ Steps ------------------------------ */}
          <ol className="relative flex flex-col gap-8 sm:gap-9">
            {steps.map((step, i) => (
              <li key={step.title} className="reveal flex items-start gap-5" style={{ transitionDelay: `${i * 90}ms` }}>
                {/* Icon + number + connector */}
                <div className="relative flex flex-col items-center">
                  <span
                    className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-[#334155] bg-[#1e293b] ${step.ring}`}
                  >
                    <step.icon className={`h-5 w-5 ${step.color}`} aria-hidden />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[#334155] bg-[#0f172a] text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                  </span>
                  {/* Vertical dashed connector */}
                  {i < steps.length - 1 && (
                    <span
                      className="step-connector absolute -bottom-9 top-12 w-0.5 rotate-90 sm:-bottom-9"
                      style={{ height: 32 }}
                      aria-hidden
                    />
                  )}
                </div>
                {/* Copy */}
                <div className="pt-1">
                  <h3 className="text-xl font-bold text-white">{step.title}</h3>
                  <p className="mt-1 max-w-[240px] text-sm leading-relaxed text-slate-400">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* -------------------------- Dashboard mockup -------------------------- */}
          <div className="reveal relative">
            {/* Glow behind the mockup */}
            <div
              className="absolute -inset-8 rounded-[32px] bg-[#4f6ef7]/15 blur-3xl"
              aria-hidden
            />
            <div className="dash-tilt relative overflow-hidden rounded-xl border border-[#334155] bg-white shadow-[0_25px_60px_-12px_rgba(0,0,0,0.55)]">
              <div className="flex">
                {/* Sidebar */}
                <aside className="hidden w-[190px] shrink-0 flex-col bg-[#0f172a] p-4 sm:flex">
                  <div className="flex items-center gap-2 px-2 pb-5 pt-1">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#4f6ef7] to-[#6b8cff] text-white">
                      <Mic className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="text-sm font-bold text-white">
                      SpeakFix <span className="text-[#6b8cff]">AI</span>
                    </span>
                  </div>
                  <nav className="flex flex-col gap-1">
                    {sidebarItems.map((item) => (
                      <span
                        key={item.label}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium ${
                          item.active
                            ? "bg-[#4f6ef7] text-white shadow-[0_4px_14px_rgba(79,110,247,0.4)]"
                            : "text-slate-400"
                        }`}
                      >
                        <item.icon className="h-4 w-4" aria-hidden />
                        {item.label}
                      </span>
                    ))}
                  </nav>
                </aside>

                {/* Main */}
                <div className="flex min-w-0 flex-1 flex-col">
                  {/* App header */}
                  <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
                    <p className="text-sm font-semibold text-[#0f172a]">
                      Good morning, <span className="text-[#4f6ef7]">Hiomla</span>
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Bell className="h-3.5 w-3.5" aria-hidden />
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
                      </span>
                      <span className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1 pr-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#4f6ef7] to-[#6b8cff] text-[10px] font-bold text-white">
                          H
                        </span>
                        <ChevronDown className="h-3 w-3 text-slate-500" aria-hidden />
                      </span>
                    </div>
                  </div>

                  {/* Body: mic + tickets */}
                  <div className="grid flex-1 grid-cols-[1fr_170px] gap-4 p-5">
                    {/* Central mic */}
                    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/60 py-8">
                      <span className="relative">
                        <span className="pulse-ring" aria-hidden />
                        <span className="mic-glow flex h-[84px] w-[84px] items-center justify-center rounded-full border-[3px] border-[#4f6ef7]/80">
                          <Mic className="h-8 w-8 text-white" aria-hidden />
                        </span>
                      </span>
                      <p className="mt-4 text-[13px] font-medium text-slate-500">Tap to speak</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        &ldquo;The projector in Room 204…&rdquo;
                      </p>
                    </div>

                    {/* Recent tickets */}
                    <div className="flex flex-col gap-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Recent Tickets
                      </p>
                      {mockTickets.map((t) => (
                        <div
                          key={t.title}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden />
                            <p className="truncate text-[12px] font-semibold text-[#0f172a]">
                              {t.title}
                            </p>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-1">
                            <span className="truncate text-[10px] text-slate-400">
                              {t.room} · {t.time}
                            </span>
                            <span
                              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${t.pill}`}
                            >
                              {t.priority}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Caption under mockup */}
            <p className="mt-8 text-center text-sm text-slate-500">
              Your personal dashboard. Every voice report, structured and trackable.{" "}
              <Link href="/login" className="font-semibold text-[#6b8cff] hover:text-[#00d4ff]">
                Try it live →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
