function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function normalizeConfiguredApiUrl(rawUrl: string): string {
  const normalized = normalizeBaseUrl(rawUrl);
  if (typeof window === "undefined") {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    const browserHost = window.location.hostname;
    const browserPort = window.location.port;

    // Guardrail for direct-service deployments: if a misconfigured env points at :3000,
    // transparently route to the API port.
    if (parsed.hostname === browserHost && parsed.port === "3000") {
      return `${parsed.protocol}//${parsed.hostname}:8000`;
    }

    // If a client bundle was built with localhost API settings and is accessed remotely,
    // preserve the port but target the current browser host.
    if (!isLoopbackHost(browserHost) && isLoopbackHost(parsed.hostname)) {
      const targetPort = parsed.port || "8000";
      return `${window.location.protocol}//${browserHost}:${targetPort}`;
    }
  } catch {
    return normalized;
  }

  return normalized;
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
    return normalizeConfiguredApiUrl(fromEnv);
  }
  return normalizeBaseUrl(browserDefaultApiUrl());
}

export const BACKEND_URL = resolveBackendUrl();

export function backendUrl(path: string): string {
  return `${resolveBackendUrl()}/${path.replace(/^\/+/, "")}`;
}
