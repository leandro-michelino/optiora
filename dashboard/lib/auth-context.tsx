"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { backendUrl } from "@/lib/backend-url";

interface AuthUser {
  id: number;
  email: string;
  full_name?: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("access_token");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = Boolean(user);

  const loadProfile = async (token: string) => {
    const response = await axios.get<AuthUser>(backendUrl("/auth/profile"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    setUser(response.data);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const token = getAccessToken();
        if (token) {
          await loadProfile(token);
        }
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post<{
        access_token: string;
        refresh_token: string;
      }>(backendUrl("/auth/login"), { email, password });

      localStorage.setItem("access_token", response.data.access_token);
      localStorage.setItem("refresh_token", response.data.refresh_token);
      await loadProfile(response.data.access_token);
    } catch (error: any) {
      const message =
        error?.response?.data?.detail || "Login failed. Check your credentials.";
      throw new Error(message);
    }
  };

  const register = async (email: string, password: string, fullName?: string) => {
    try {
      await axios.post(backendUrl("/auth/register"), {
        email,
        password,
        full_name: fullName || undefined,
      });
      await login(email, password);
    } catch (error: any) {
      const message = error?.response?.data?.detail || "Registration failed.";
      throw new Error(message);
    }
  };

  const logout = async () => {
    try {
      const token = getAccessToken();
      if (token) {
        await axios.post(
          backendUrl("/auth/logout"),
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }
    } catch {
      // Best-effort logout.
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      setUser(null);
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
