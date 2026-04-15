"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { backendUrl } from "@/lib/backend-url";

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
    } catch (err: any) {
      setError(err?.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !authEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center text-slate-300">
          <p className="text-lg font-medium">Redirecting to the dashboard...</p>
          <p className="mt-2 text-sm text-slate-400">
            Password reset is unavailable while authentication is disabled for this deployment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-md p-8 bg-slate-800 rounded-lg shadow-lg border border-slate-700">
        <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
        <p className="text-slate-400 mb-8">
          Paste your reset token and choose a new password.
        </p>

        {message && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-300 text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
            {error}
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
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-medium rounded transition-colors"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        <p className="mt-6 text-center text-slate-400 text-sm">
          Need a token?{" "}
          <Link href="/forgot-password" className="text-blue-400 hover:text-blue-300 font-medium">
            Request reset
          </Link>
        </p>
      </div>
    </div>
  );
}
