"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface User {
  id: number;
  email: string;
  full_name?: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Restore auth from localStorage on mount
  useEffect(() => {
    const restoreAuth = async () => {
      try {
        const accessToken = localStorage.getItem("access_token");
        if (accessToken) {
          // Verify token is still valid and fetch user
          const response = await fetch("/auth/profile", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            setIsAuthenticated(true);
          } else {
            // Token invalid, try to refresh
            await refreshToken();
          }
        }
      } catch (error) {
        console.error("Failed to restore auth:", error);
      } finally {
        setLoading(false);
      }
    };

    restoreAuth();
  }, []);

  const register = async (email: string, password: string, fullName?: string) => {
    try {
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Registration failed");
      }

      const userData = await response.json();
      setUser(userData);

      // Auto-login after registration
      await login(email, password);
    } catch (error) {
      throw error;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Login failed");
      }

      const tokenData: TokenResponse = await response.json();

      // Store tokens
      localStorage.setItem("access_token", tokenData.access_token);
      localStorage.setItem("refresh_token", tokenData.refresh_token);

      // Set expiry timer
      const expiresIn = tokenData.expires_in * 1000; // Convert to milliseconds
      setTimeout(
        () => {
          refreshToken();
        },
        expiresIn - 60000 // Refresh 1 minute before expiry
      );

      // Fetch user profile
      const profileResponse = await fetch("/auth/profile", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (profileResponse.ok) {
        const userData = await profileResponse.json();
        setUser(userData);
        setIsAuthenticated(true);
      }
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      const accessToken = localStorage.getItem("access_token");
      if (accessToken) {
        await fetch("/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const refreshToken = async () => {
    try {
      const refreshTokenValue = localStorage.getItem("refresh_token");
      if (!refreshTokenValue) {
        throw new Error("No refresh token");
      }

      const response = await fetch("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshTokenValue }),
      });

      if (!response.ok) {
        // Refresh failed, logout user
        await logout();
        throw new Error("Token refresh failed");
      }

      const tokenData: TokenResponse = await response.json();

      // Update tokens
      localStorage.setItem("access_token", tokenData.access_token);
      localStorage.setItem("refresh_token", tokenData.refresh_token);

      // Set new expiry timer
      const expiresIn = tokenData.expires_in * 1000;
      setTimeout(
        () => {
          refreshToken();
        },
        expiresIn - 60000
      );
    } catch (error) {
      console.error("Token refresh error:", error);
      await logout();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated,
        register,
        login,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
