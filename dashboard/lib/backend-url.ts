function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, "");
}

function browserDefaultApiUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }
  return `${window.location.protocol}//${window.location.hostname}:8000`;
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
