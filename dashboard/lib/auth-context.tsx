"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import {
  authorizedFetch,
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  isAuthEnabled,
  storeTokens,
} from "@/lib/auth-fetch";
import { backendUrl } from "@/lib/backend-url";

interface AuthUser {
  id: number;
  email: string;
  full_name?: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

interface OrganizationMembership {
  id: number;
  name: string;
  role: string;
  plan: string;
  is_active: boolean;
}

const PUBLIC_USER: AuthUser = {
  id: 0,
  email: "public-access@disabled.local",
  full_name: "Public Access",
  is_active: true,
  email_verified: true,
  created_at: new Date(0).toISOString(),
};

const PUBLIC_ORGANIZATION: OrganizationMembership = {
  id: 0,
  name: "Public Workspace",
  role: "owner",
  plan: "enterprise",
  is_active: true,
};

interface AuthContextType {
  user: AuthUser | null;
  organization: OrganizationMembership | null;
  authEnabled: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authEnabled = isAuthEnabled();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<OrganizationMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = authEnabled ? Boolean(user) : true;

  const loadProfile = async () => {
    const [profileResponse, organizationResponse] = await Promise.all([
      authorizedFetch(backendUrl("/auth/profile")),
      authorizedFetch(backendUrl("/auth/organization")),
    ]);
    if (!profileResponse.ok) {
      throw new Error("Failed to load profile");
    }
    const userData = (await profileResponse.json()) as AuthUser;
    setUser(userData);
    if (organizationResponse.ok) {
      const organizationData = (await organizationResponse.json()) as OrganizationMembership;
      setOrganization(organizationData);
    } else {
      setOrganization(null);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        if (!authEnabled) {
          setUser(PUBLIC_USER);
          setOrganization(PUBLIC_ORGANIZATION);
          return;
        }
        if (!getStoredAccessToken() && !getStoredRefreshToken()) {
          setUser(null);
          setOrganization(null);
          return;
        }
        await loadProfile();
      } catch {
        clearStoredTokens();
        setUser(null);
        setOrganization(null);
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [authEnabled]);

  const login = async (email: string, password: string) => {
    if (!authEnabled) {
      router.push("/dashboard");
      return;
    }
    try {
      const response = await axios.post<{
        access_token: string;
        refresh_token: string;
      }>(backendUrl("/auth/login"), { email, password });

      storeTokens(response.data.access_token, response.data.refresh_token);
      await loadProfile();
    } catch (error: any) {
      const message =
        error?.response?.data?.detail || "Login failed. Check your credentials.";
      throw new Error(message);
    }
  };

  const register = async (email: string, password: string, fullName?: string) => {
    if (!authEnabled) {
      router.push("/dashboard");
      return;
    }
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
    if (!authEnabled) {
      router.push("/dashboard");
      return;
    }
    try {
      await authorizedFetch(backendUrl("/auth/logout"), {
        method: "POST",
      });
    } catch {
      // Best-effort logout.
    } finally {
      clearStoredTokens();
      setUser(null);
      setOrganization(null);
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, organization, authEnabled, isAuthenticated, loading, login, register, logout }}
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
