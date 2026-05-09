"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AuthRedirectState, AuthShell } from "@/components/AuthShell";
import { AlertCircle, UserPlus } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { authEnabled, loading: authLoading, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !authEnabled) {
      router.replace("/dashboard");
    }
  }, [authEnabled, authLoading, router]);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(pwd)) return "Password must contain uppercase letter";
    if (!/[a-z]/.test(pwd)) return "Password must contain lowercase letter";
    if (!/\d/.test(pwd)) return "Password must contain a number";
    if (!/[!@#$%^&*]/.test(pwd)) return "Password must contain special character (!@#$%^&*)";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      await register(email, password, fullName);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
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
      title="Create account"
      subtitle="Create a workspace login for secured deployments."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-300 transition hover:text-blue-200">
            Sign in
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-300 mb-2">
              Full Name
            </label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              className="form-field border-slate-700 bg-slate-950 text-white"
            />
          </div>

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
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="form-field border-slate-700 bg-slate-950 text-white"
            />
            <p className="mt-2 text-xs text-slate-400">
              Min 8 chars, 1 uppercase, 1 number, 1 special char (!@#$%^&*)
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="form-field border-slate-700 bg-slate-950 text-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-2 inline-flex w-full items-center justify-center gap-2 py-2.5 disabled:bg-slate-700"
          >
            <UserPlus className="h-4 w-4" />
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
    </AuthShell>
  );
}
