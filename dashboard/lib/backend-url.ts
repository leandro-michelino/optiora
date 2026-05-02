function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, "");
}

function browserDefaultApiUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }
  // In direct-service deployments, dashboard usually runs on :3000 while API runs on :8000.
  // Explicit NEXT_PUBLIC_API_URL still overrides this default.
  if (window.location.port === "3000") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  // Otherwise prefer same-origin (reverse proxy / container safe).
  return window.location.origin;
}

export function resolveBackendUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    return normalizeBaseUrl(fromEnv);
  }
  return normalizeBaseUrl(browserDefaultApiUrl());
}

export const BACKEND_URL = resolveBackendUrl();

export function backendUrl(path: string): string {
  return `${resolveBackendUrl()}/${path.replace(/^\/+/, "")}`;
}
