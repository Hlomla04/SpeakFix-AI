"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not reset your password. Please try again.");
        return;
      }
      setDone(true);
      // Give the user a moment to see the success state, then go to login
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-5">
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200">
          This reset link is missing its token. Please request a fresh link from the{" "}
          <Link href="/forgot-password" className="font-semibold underline">
            forgot password
          </Link>{" "}
          page.
        </p>
        <Button
          asChild
          variant="outline"
          className="btn-ghost-landing h-11 w-full rounded-xl text-[15px] font-semibold"
        >
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-5 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </span>
        <p className="text-sm leading-relaxed text-slate-300">
          Your password has been reset. Taking you to the login page…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {/* New password */}
      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-slate-200">
          New Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-xl border-[#253054] bg-[#0a0e27]/60 pr-11 text-slate-100 placeholder:text-slate-600 focus-visible:ring-[#4f6ef7]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
          >
            {showPassword ? <EyeOff className="h-4.5 w-4.5" aria-hidden /> : <Eye className="h-4.5 w-4.5" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Confirm password */}
      <div className="space-y-2">
        <Label htmlFor="confirm" className="text-sm font-medium text-slate-200">
          Confirm New Password
        </Label>
        <Input
          id="confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Repeat your new password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
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
          <ShieldCheck className="h-4.5 w-4.5" aria-hidden />
        )}
        {loading ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      narrow
      title="Choose a new password"
      subtitle="Pick a strong new password for your SpeakFix AI account. Your other sessions will be logged out."
      footer={
        <p>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-[#6b8cff] hover:text-[#00d4ff]">
            Back to Log in
          </Link>
        </p>
      }
    >
      <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin text-[#6b8cff]" aria-hidden />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
