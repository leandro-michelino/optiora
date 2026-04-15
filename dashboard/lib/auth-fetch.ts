"use client";

import { backendUrl } from "@/lib/backend-url";
 
export async function refreshAccessToken(): Promise<boolean> {
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
