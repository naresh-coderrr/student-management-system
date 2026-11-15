// How the website calls the Python API.
// Viva: every button ends in api(). The login token is attached here.
// The Supabase secret key is not in this file.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const APPROVED_ACCOUNTS = [
  "nareshramrajasimhan18@gmail.com",
  "nareshram4804@gmail.com",
  "nareshramstudies@gmail.com",
] as const;

const TOKEN_KEY = "sms_token";
const USER_KEY = "sms_user";

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
};

export function readToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function readUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : "Request failed";
    if (response.status === 401 && !path.startsWith("/api/auth/login")) {
      clearSession();
    }
    throw new ApiError(detail, response.status);
  }
  return payload as T;
}

export async function downloadCsv(tableName: string) {
  const headers = new Headers();
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}/api/records/${encodeURIComponent(tableName)}/export`, {
    method: "POST",
    headers,
  });
  if (!response.ok) {
    throw new ApiError("Could not export this table.", response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${tableName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
