"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, UserPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthShell } from "@/components/auth/auth-shell";

const LANGUAGES = [
  "English",
  "Afrikaans",
  "isiZulu",
  "isiXhosa",
  "Sesotho",
  "Setswana",
  "Sepedi",
  "Xitsonga",
  "siSwati",
  "Tshivenda",
  "isiNdebele",
  "French",
  "Portuguese",
  "Swahili",
];

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [language, setLanguage] = useState("English");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwChecks = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "One letter", ok: /[a-zA-Z]/.test(password) },
    { label: "One number", ok: /\d/.test(password) },
  ];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, preferredLanguage: language }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not create your account. Please try again.");
        return;
      }
      // Account created — send the user to /login so they can sign in with
      // the credentials they just created. (Signup returns fast without
      // auto-logging in, which keeps the signup round-trip quick.)
      setSuccess("Account created. Redirecting you to log in…");
      setTimeout(() => {
        router.push("/login");
        router.refresh();
      }, 700);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Sign up to report maintenance issues by voice and track every ticket in one place."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#6b8cff] hover:text-[#00d4ff]">
            Log in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {/* Full name */}
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium text-slate-200">
            Full Name
          </Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="e.g. Hiomla Haldorson"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-xl border-[#253054] bg-[#0a0e27]/60 text-slate-100 placeholder:text-slate-600 focus-visible:ring-[#4f6ef7]"
          />
        </div>

        {/* Email */}
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

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-slate-200">
            Password
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
          {/* Live password checklist */}
          {password.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
              {pwChecks.map((c) => (
                <li
                  key={c.label}
                  className={`flex items-center gap-1.5 text-xs ${c.ok ? "text-emerald-400" : "text-slate-500"}`}
                >
                  <Check className={`h-3.5 w-3.5 ${c.ok ? "opacity-100" : "opacity-40"}`} aria-hidden />
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Preferred language */}
        <div className="space-y-2">
          <Label htmlFor="language" className="text-sm font-medium text-slate-200">
            Preferred Language
          </Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger
              id="language"
              className="h-11 w-full rounded-xl border-[#253054] bg-[#0a0e27]/60 text-slate-100 focus:ring-[#4f6ef7]"
            >
              <SelectValue placeholder="Choose your language" />
            </SelectTrigger>
            <SelectContent className="border-[#253054] bg-[#111836] text-slate-100">
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang} className="focus:bg-[#4f6ef7]/25 focus:text-white">
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {success}
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
            <UserPlus className="h-4.5 w-4.5" aria-hidden />
          )}
          {loading ? "Creating your account…" : success ? "Account created" : "Sign Up"}
        </Button>

        <p className="text-center text-xs leading-relaxed text-slate-500">
          By signing up you agree to keep reports accurate. Your tickets are visible only to you.
        </p>
      </form>
    </AuthShell>
  );
}
