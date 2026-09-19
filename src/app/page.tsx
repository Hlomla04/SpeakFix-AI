"use client";

import { useEffect } from "react";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingHero } from "@/components/landing/hero";
import { LandingFeatures } from "@/components/landing/features";
import { LandingHowItWorks } from "@/components/landing/how-it-works";
import { LandingAbout, LandingCta, LandingFooter } from "@/components/landing/cta-footer";

/**
 * SpeakFix AI — marketing landing page.
 * The live application (voice agent + ticket dashboard) lives at /app.
 */
export default function LandingPage() {
  // Scroll-reveal: every .reveal element fades in when it enters the viewport
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("reveal-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing min-h-screen bg-[#0a0e27] font-sans">
      <LandingNavbar />
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingAbout />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
