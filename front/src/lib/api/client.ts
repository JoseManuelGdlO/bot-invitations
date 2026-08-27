const TOKEN_KEY = "alanna-access-token";
const REMEMBER_KEY = "alanna-remember";

const AUTH_PUBLIC_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/register-invite",
  "/auth/refresh",
  "/auth/logout",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

const viteApiUrl = (import.meta as ImportMeta & { env?: { [key: string]: string | undefined } }).env?.[
  "VITE_API_URL"
];
export const apiBase = viteApiUrl || "/api";

function readStore(kind: "session" | "local"): Storage | null {
  try {
    return kind === "session" ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}

function storageGet(kind: "session" | "local", key: string) {
  try {
    return readStore(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(kind: "session" | "local", key: string, value: string) {
  try {
    readStore(kind)?.setItem(key, value);
  } catch {
    /* noop */
  }
}

function storageRemove(kind: "session" | "local", key: string) {
  try {
    readStore(kind)?.removeItem(key);
  } catch {
    /* noop */
  }
}

export function isAuthPublicPath(path: string) {
  const bare = String(path || "").split("?")[0] ?? "";
  return AUTH_PUBLIC_PATHS.has(bare);
}

export function getRememberMe(): boolean | null {
  const sessionFlag = storageGet("session", REMEMBER_KEY);
  if (sessionFlag === "1") return true;
  if (sessionFlag === "0") return false;
  const localFlag = storageGet("local", REMEMBER_KEY);
  if (localFlag === "1") return true;
  if (localFlag === "0") return false;
  return null;
}

export function getToken() {
  return storageGet("session", TOKEN_KEY) || storageGet("local", TOKEN_KEY);
}

export function setToken(token: string | null, persist?: boolean) {
  if (!token) {
    storageRemove("session", TOKEN_KEY);
    storageRemove("session", REMEMBER_KEY);
    storageRemove("local", TOKEN_KEY);
    storageRemove("local", REMEMBER_KEY);
    return;
  }

  const remember = persist ?? getRememberMe() ?? false;
  const flag = remember ? "1" : "0";
  if (remember) {
    storageSet("local", TOKEN_KEY, token);
    storageSet("local", REMEMBER_KEY, flag);
    storageRemove("session", TOKEN_KEY);
    storageRemove("session", REMEMBER_KEY);
    return;
  }
  storageSet("session", TOKEN_KEY, token);
  storageSet("session", REMEMBER_KEY, flag);
  storageRemove("local", TOKEN_KEY);
  storageRemove("local", REMEMBER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parse(res: Response) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(data?.error || "Error de red", res.status);
  }
  return data;
}

let refreshInFlight: Promise<string> | null = null;

export async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      const accessToken = data?.accessToken ? String(data.accessToken) : "";
      if (!res.ok || !accessToken) {
        setToken(null);
        throw new ApiError(data?.error || "Sesión expirada", res.status || 401);
      }
      setToken(accessToken);
      return accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function applyAuthHeaders(headers: Headers) {
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
}

async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  applyAuthHeaders(headers);
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (res.status !== 401 || isAuthPublicPath(path) || !getToken()) {
    return res;
  }
  try {
    await refreshAccessToken();
  } catch {
    return res;
  }
  const retryHeaders = new Headers(init.headers);
  applyAuthHeaders(retryHeaders);
  return fetch(`${apiBase}${path}`, {
    ...init,
    headers: retryHeaders,
    credentials: "include",
  });
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetchWithAuth(path, { ...init, headers });
  return parse(res) as Promise<T>;
}

export async function download(path: string, filename: string) {
  const res = await fetchWithAuth(path, {});
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError((data as { error?: string }).error || "No se pudo descargar", res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
