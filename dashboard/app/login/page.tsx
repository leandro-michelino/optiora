"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AuthRedirectState, AuthShell } from "@/components/AuthShell";
import { AlertCircle, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { authEnabled, loading: authLoading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !authEnabled) {
      router.replace("/dashboard");
    }
  }, [authEnabled, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !authEnabled) {
    return (
      <AuthRedirectState>
        <p className="text-lg font-medium">Opening dashboard</p>
        <p className="mt-2 text-sm text-slate-400">Authentication is disabled for this deployment.</p>
      </AuthRedirectState>
    );
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use your workspace credentials to continue."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-blue-300 transition hover:text-blue-200">
            Create one
          </Link>
        </>
      }
    >
        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              className="form-field border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Forgot?
              </Link>
            </div>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="form-field border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 py-2.5 disabled:bg-slate-700"
          >
            <LogIn className="h-4 w-4" />
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
    </AuthShell>
  );
}
