function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, "");
}

function browserDefaultApiUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }
  // Prefer same-origin in browser contexts (reverse proxy / container safe).
  // Explicit NEXT_PUBLIC_API_URL still overrides this default.
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
