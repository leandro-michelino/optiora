"use client";

import { backendUrl } from "@/lib/backend-url";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

export function isAuthEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_ENABLE_AUTH;
  return value === "1" || value === "true" || value === "yes";
}

interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getStoredAccessToken(): string | null {
  if (!isBrowser()) {
    return null;
  }
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  if (!isBrowser()) {
    return null;
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  if (!isBrowser()) {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearStoredTokens(): void {
  if (!isBrowser()) {
    return;
  }
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!isAuthEnabled()) {
    return null;
  }
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    clearStoredTokens();
    return null;
  }

  try {
    const response = await fetch(backendUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      clearStoredTokens();
      return null;
    }

    const data = (await response.json()) as RefreshTokenResponse;
    storeTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    clearStoredTokens();
    return null;
  }
}

function withAuthorization(
  init: RequestInit = {},
  token: string | null,
): RequestInit {
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...init, headers };
}

export async function authorizedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!isAuthEnabled()) {
    return fetch(input, init);
  }

  let token = getStoredAccessToken();
  if (!token) {
    token = await refreshAccessToken();
  }

  let response = await fetch(input, withAuthorization(init, token));
  if (response.status !== 401) {
    return response;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    return response;
  }

  response = await fetch(input, withAuthorization(init, refreshedToken));
  return response;
}
