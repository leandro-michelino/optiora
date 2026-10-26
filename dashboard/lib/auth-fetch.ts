"use client";

import { backendUrl } from "@/lib/backend-url";
 
let pendingRefresh: Promise<boolean> | null = null;

async function requestTokenRefresh(): Promise<boolean> {
  try {
    const response = await fetch(backendUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function refreshAccessToken(): Promise<boolean> {
  // Session loading makes parallel requests. Share the refresh so a rotated
  // refresh token is not submitted repeatedly and cookies cannot race.
  if (!pendingRefresh) {
    pendingRefresh = requestTokenRefresh().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

function withCredentials(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    credentials: "include",
  };
}

export async function authorizedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  let response = await fetch(input, withCredentials(init));
  if (response.status !== 401) {
    return response;
  }

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    return response;
  }

  response = await fetch(input, withCredentials(init));
  return response;
}
