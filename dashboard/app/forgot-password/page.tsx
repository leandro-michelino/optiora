"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { backendUrl } from "@/lib/backend-url";

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
    } catch (err: any) {
      setError(err?.message || "Failed to submit password reset request");
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
        <h1 className="text-3xl font-bold text-white mb-2">Forgot Password</h1>
        <p className="text-slate-400 mb-8">
          Enter your account email and we will trigger a password reset request.
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
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-medium rounded transition-colors"
          >
            {loading ? "Submitting..." : "Request Password Reset"}
          </button>
        </form>

        <p className="mt-6 text-center text-slate-400 text-sm">
          Remembered your password?{" "}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
            Back to login
          </Link>
        </p>
        <p className="mt-3 text-center text-slate-400 text-sm">
          Already have a token?{" "}
          <Link href="/reset-password" className="text-blue-400 hover:text-blue-300 font-medium">
            Reset password
          </Link>
        </p>
      </div>
    </div>
  );
}
