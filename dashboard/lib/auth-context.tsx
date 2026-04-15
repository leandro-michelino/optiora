"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { authorizedFetch } from "@/lib/auth-fetch";
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
  organizations: OrganizationMembership[];
  activeOrganization: OrganizationMembership | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: number) => Promise<void>;
  refreshOrganizations: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface OrganizationMembership {
  id: number;
  name: string;
  role: string;
  plan: string;
  is_active: boolean;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>([]);
  const [activeOrganization, setActiveOrganization] = useState<OrganizationMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = Boolean(user);

  const loadSession = async () => {
    const [profileResponse, organizationsResponse, activeOrgResponse] = await Promise.all([
      authorizedFetch(backendUrl("/auth/profile")),
      authorizedFetch(backendUrl("/auth/organizations")),
      authorizedFetch(backendUrl("/auth/organization")),
    ]);
    if (!profileResponse.ok) {
      throw new Error("Failed to load profile");
    }
    if (!organizationsResponse.ok || !activeOrgResponse.ok) {
      throw new Error("Failed to load organizations");
    }
    const profile = (await profileResponse.json()) as AuthUser;
    const orgs = (await organizationsResponse.json()) as OrganizationMembership[];
    const activeOrg = (await activeOrgResponse.json()) as OrganizationMembership;
    setUser(profile);
    setOrganizations(orgs);
    setActiveOrganization(activeOrg);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await loadSession();
      } catch {
        setUser(null);
        setOrganizations([]);
        setActiveOrganization(null);
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      await axios.post(
        backendUrl("/auth/login"),
        { email, password },
        { withCredentials: true },
      );
      await loadSession();
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
      await authorizedFetch(backendUrl("/auth/logout"), {
        method: "POST",
      });
    } catch {
      // Best-effort logout.
    } finally {
      setUser(null);
      setOrganizations([]);
      setActiveOrganization(null);
      router.push("/login");
    }
  };

  const refreshOrganizations = async () => {
    const [organizationsResponse, activeOrgResponse] = await Promise.all([
      authorizedFetch(backendUrl("/auth/organizations")),
      authorizedFetch(backendUrl("/auth/organization")),
    ]);
    if (!organizationsResponse.ok || !activeOrgResponse.ok) {
      throw new Error("Failed to refresh organizations");
    }
    setOrganizations((await organizationsResponse.json()) as OrganizationMembership[]);
    setActiveOrganization((await activeOrgResponse.json()) as OrganizationMembership);
  };

  const switchOrganization = async (organizationId: number) => {
    const response = await authorizedFetch(backendUrl("/auth/organization/select"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: organizationId }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || "Failed to switch organization");
    }
    await refreshOrganizations();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        activeOrganization,
        isAuthenticated,
        loading,
        login,
        register,
        logout,
        switchOrganization,
        refreshOrganizations,
      }}
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
