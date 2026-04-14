const RAW_BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const BACKEND_URL = RAW_BACKEND_URL.replace(/\/+$/, "");

export function backendUrl(path: string): string {
  return `${BACKEND_URL}/${path.replace(/^\/+/, "")}`;
}
