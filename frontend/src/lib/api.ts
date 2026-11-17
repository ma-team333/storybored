// Tiny fetch wrapper. All paths are relative (/api/...) — the vite dev server
// proxies to the backend, and in production the backend serves the bundle.

const TOKEN_KEY = "sb_token";

/** Shared-access token (STORYBORED_TOKEN on the server). Empty = unset. */
export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode etc. — token just won't persist */
  }
}
/** Notebook URLs pass the token as ?token=. Capture it before React mounts
 *  so the first /api request already carries it, then strip it from the bar. */
function absorbUrlToken(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const inUrl = url.searchParams.get("token");
  if (!inUrl) return;
  setToken(inUrl);
  url.searchParams.delete("token");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

absorbUrlToken();


export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.name = "ApiError";
  }
}

/** Fired when the server rejects a request for lack of a valid token
 *  (STORYBORED_TOKEN set on the server). TokenGate listens and prompts. */
export const UNAUTHORIZED_EVENT = "sb:unauthorized";

async function parseError(res: Response): Promise<ApiError> {
  let detail = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body && typeof body.detail === "string") detail = body.detail;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, detail);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, "Can't reach the StoryBored server.");
  }
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw await parseError(res);
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function apiDelete<T = void>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

export function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: "POST", body: form });
}

/** Build a URL for a media file path returned by the API. <img>/<video> tags
 *  can't send headers, so the shared token travels as a query parameter. */
export function mediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  const clean = path.replace(/^\/+/, "");
  const token = getToken();
  const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
  return `/api/media/${clean}${suffix}`;
}
