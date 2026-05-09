"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { backendUrl } from "@/lib/backend-url";
import { AuthRedirectState, AuthShell } from "@/components/AuthShell";
import { AlertCircle, CheckCircle2, KeyRound } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { authEnabled, loading: authLoading } = useAuth();
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
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
      const response = await fetch(backendUrl("/auth/password-reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to reset password");
      }
      setMessage(data?.message || "Password reset successfully.");
      setResetToken("");
      setNewPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
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
      title="Reset password"
      subtitle="Paste your reset token and choose a new password."
      footer={
        <>
          Need a token?{" "}
          <Link href="/forgot-password" className="font-medium text-blue-300 transition hover:text-blue-200">
            Request reset
          </Link>
        </>
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
            <label htmlFor="reset-token" className="block text-sm font-medium text-slate-300 mb-2">
              Reset Token
            </label>
            <textarea
              id="reset-token"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              required
              rows={3}
              placeholder="Paste reset token"
              className="form-field border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-slate-300 mb-2">
              New Password
            </label>
            <input
              type="password"
              id="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="StrongPass1!"
              className="form-field border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 py-2.5 disabled:bg-slate-700"
          >
            <KeyRound className="h-4 w-4" />
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
    </AuthShell>
  );
}
