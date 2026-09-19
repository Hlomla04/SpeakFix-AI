"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Link2, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; resetUrl: string | null } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setResult({ message: data.message || "Request received.", resetUrl: data.resetUrl ?? null });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      narrow
      title="Forgot your password?"
      subtitle="Enter the email you signed up with and we'll generate a link to reset your password."
      footer={
        <p className="flex items-center justify-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to{" "}
          <Link href="/login" className="font-semibold text-[#6b8cff] hover:text-[#00d4ff]">
            Log in
          </Link>
        </p>
      }
    >
      {!result ? (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-slate-200">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl border-[#253054] bg-[#0a0e27]/60 text-slate-100 placeholder:text-slate-600 focus-visible:ring-[#4f6ef7]"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="btn-primary-landing h-11 w-full gap-2 rounded-xl text-[15px] font-semibold"
          >
            {loading ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden />
            ) : (
              <KeyRound className="h-4.5 w-4.5" aria-hidden />
            )}
            {loading ? "Generating link…" : "Send reset link"}
          </Button>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3.5">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
            <p className="text-sm leading-relaxed text-emerald-200">{result.message}</p>
          </div>

          {result.resetUrl ? (
            <div className="rounded-xl border border-[#4f6ef7]/25 bg-[#4f6ef7]/8 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#6b8cff]">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                Your reset link
              </p>
              <Link
                href={result.resetUrl}
                className="mt-2 block break-all rounded-lg bg-[#0a0e27]/80 px-3 py-2.5 font-mono text-xs leading-relaxed text-[#6b8cff] transition-colors hover:text-[#00d4ff]"
              >
                {result.resetUrl}
              </Link>
              <p className="mt-2.5 text-xs leading-relaxed text-slate-500">
                This demo doesn&apos;t send emails, so the link is shown here. It expires in 30
                minutes and can only be used once.
              </p>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-slate-500">
              If an account exists for this email, a reset link has been generated for it.
            </p>
          )}

          <Button
            asChild
            variant="outline"
            className="btn-ghost-landing h-11 w-full rounded-xl text-[15px] font-semibold"
          >
            <Link href="/login">Back to Log in</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
