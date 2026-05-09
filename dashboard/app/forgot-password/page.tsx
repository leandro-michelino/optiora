"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { backendUrl } from "@/lib/backend-url";
import { AuthRedirectState, AuthShell } from "@/components/AuthShell";
import { AlertCircle, CheckCircle2, KeyRound } from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { authEnabled, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !authEnabled) {
      router.replace("/dashboard");
    }
  }, [authEnabled, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(
        backendUrl("/auth/password-reset-request"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to submit password reset request");
      }
      const resetHint = data?.reset_token
        ? ` Local reset token: ${data.reset_token}`
        : "";
      setMessage(`${data?.message || "If the email exists, a reset link will be sent."}${resetHint}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit password reset request");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !authEnabled) {
    return (
      <AuthRedirectState>
        <p className="text-lg font-medium">Opening dashboard</p>
        <p className="mt-2 text-sm text-slate-400">Password reset is unavailable while authentication is disabled.</p>
      </AuthRedirectState>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your account email to start a reset request."
      footer={
        <div className="space-y-2">
          <p>
            Remembered your password?{" "}
            <Link href="/login" className="font-medium text-blue-300 transition hover:text-blue-200">
              Back to login
            </Link>
          </p>
          <p>
            Already have a token?{" "}
            <Link href="/reset-password" className="font-medium text-blue-300 transition hover:text-blue-200">
              Reset password
            </Link>
          </p>
        </div>
      }
    >
        {message && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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

          <button
            type="submit"
            disabled={loading}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 py-2.5 disabled:bg-slate-700"
          >
            <KeyRound className="h-4 w-4" />
            {loading ? "Submitting..." : "Request Password Reset"}
          </button>
        </form>
    </AuthShell>
  );
}
