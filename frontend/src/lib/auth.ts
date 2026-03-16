/**
 * Auth utilities — token management, API helpers, login/signup/google.
 */

const _API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_URL = _API_URL;

// ── Token management ────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("astra_token");
}

export function setToken(token: string) {
  localStorage.setItem("astra_token", token);
}

export function removeToken() {
  localStorage.removeItem("astra_token");
  localStorage.removeItem("astra_user");
}

export function getUser(): { id: string; email: string; full_name: string; avatar_url?: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("astra_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setUser(user: { id: string; email: string; full_name: string; avatar_url?: string }) {
  localStorage.setItem("astra_user", JSON.stringify(user));
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function logout() {
  removeToken();
  window.location.href = "/login";
}

// ── Fetch wrapper ───────────────────────────────────────────────

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

// ── Auth API calls ──────────────────────────────────────────────

interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    avatar_url?: string;
  };
}

export async function signup(email: string, password: string, fullName: string): Promise<AuthResult> {
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Signup failed");
  }
  const data: AuthResult = await res.json();
  setToken(data.token);
  setUser(data.user);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Login failed");
  }
  const data: AuthResult = await res.json();
  setToken(data.token);
  setUser(data.user);
  return data;
}

export async function googleLogin(idToken: string): Promise<AuthResult> {
  const res = await fetch(`${API_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Google login failed");
  }
  const data: AuthResult = await res.json();
  setToken(data.token);
  setUser(data.user);
  return data;
}
