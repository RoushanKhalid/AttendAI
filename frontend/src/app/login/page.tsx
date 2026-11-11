"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Eye, EyeOff, Lock, Mail, ShieldCheck, ArrowRight } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/FormControls";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login } = useAuth();

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(usernameOrEmail.trim(), password);
      router.replace("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AttendAI</h1>
          <p className="text-sm text-slate-500">Sign in to manage attendance, shifts, leaves, and workforce records.</p>
        </div>

        {/* Sign In Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-[0_1px_3px_rgba(15,23,42,0.06)] space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email or Username" htmlFor="login-email" required>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  id="login-email"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="name@company.com"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="login-password" required>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-2 p-0.5 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <Button type="submit" className="w-full h-10" loading={submitting}>
              Sign In
            </Button>
          </form>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>Demo Admin:</span>
            <button
              type="button"
              onClick={() => {
                setUsernameOrEmail("admin@company.com");
                setPassword("admin123");
              }}
              className="font-mono text-blue-600 hover:text-blue-700 hover:underline"
            >
              Fill admin@company.com
            </button>
          </div>
        </div>

        {/* Direct Kiosk Terminal Link */}
        <Link
          href="/kiosk"
          className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/40 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-900">Open Live Attendance Kiosk</div>
              <div className="text-xs text-slate-500">Launch touchless face check-in terminal</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
        </Link>
      </div>
    </div>
  );
}

