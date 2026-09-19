"use client";

import { Mic, Brain, Ticket, AlertTriangle, LayoutGrid, BadgeCheck, type LucideIcon } from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
};

const features: Feature[] = [
  {
    icon: Mic,
    title: "Natural Voice Interaction",
    description: "Report issues by simply speaking, no forms.",
    iconBg: "bg-[#eff6ff]",
    iconColor: "text-[#3b82f6]",
  },
  {
    icon: Brain,
    title: "Smart Understanding",
    description: "Iris listens, understands and asks follow-ups only when needed.",
    iconBg: "bg-[#f5f3ff]",
    iconColor: "text-[#8b5cf6]",
  },
  {
    icon: Ticket,
    title: "Automatic Ticket Generation",
    description: "Turns your conversation into a structured ticket.",
    iconBg: "bg-[#ecfdf5]",
    iconColor: "text-[#10b981]",
  },
  {
    icon: AlertTriangle,
    title: "Smart Priority Detection",
    description: "Sparking wires are critical. A flickering light can wait.",
    iconBg: "bg-[#fffbeb]",
    iconColor: "text-[#f59e0b]",
  },
  {
    icon: LayoutGrid,
    title: "Categorization",
    description: "IT/AV, Electrical, Plumbing, HVAC, Facilities and more.",
    iconBg: "bg-[#eef2ff]",
    iconColor: "text-[#6366f1]",
  },
  {
    icon: BadgeCheck,
    title: "Verified Resolution",
    description: "A ticket isn't fixed until the person who reported it confirms it.",
    iconBg: "bg-[#faf5ff]",
    iconColor: "text-[#a855f7]",
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="relative bg-white py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        {/* Section header */}
        <div className="reveal mx-auto max-w-[600px] text-center">
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-[#0f172a] sm:text-5xl">
            Key Features
          </h2>
          <p className="mt-4 text-lg text-[#475569]">
            Everything you need for faster, smarter maintenance reporting.
          </p>
        </div>

        {/* Cards grid */}
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="feature-card reveal flex flex-col rounded-2xl border border-slate-200 bg-white p-6"
            >
              <span
                    className={`flex h-16 w-16 items-center justify-center rounded-2xl ${f.iconBg}`}
                    aria-hidden
                  >
                <f.icon className={`h-8 w-8 ${f.iconColor}`} strokeWidth={1.8} />
              </span>
              <h3 className="mt-5 text-[17px] font-semibold leading-snug text-[#0f172a]">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#64748b]">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
