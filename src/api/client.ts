/**
 * API HTTP 客户端 — 超时/重试/Token刷新/统一错误格式
 * 被域 API 模块（auth/posts/courses/circles）共用
 */
const BASE = '/campus/api/v1';
const REQUEST_TIMEOUT = 15_000;
const MAX_RETRIES_GET = 1;

function safeGet(store: Storage | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function safeSet(store: Storage | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* noop */
  }
}
function safeRemove(store: Storage | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    /* noop */
  }
}

const ls = typeof localStorage !== 'undefined' ? localStorage : null;
const ss = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

let token: string | null = safeGet(ls, 'campuslink_token');
let refreshToken: string | null = safeGet(ls, 'campuslink_refresh');

export function setSession(t: string | null, refresh: string | null) {
  token = t;
  refreshToken = refresh;
  if (t) safeSet(ls, 'campuslink_token', t);
  else safeRemove(ls, 'campuslink_token');
  if (refresh) safeSet(ls, 'campuslink_refresh', refresh);
  else safeRemove(ls, 'campuslink_refresh');
}

export function getToken() {
  return token;
}

function traceId() {
  return `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const sessionId = (() => {
  const sid =
    safeGet(ss, 'campuslink_sid') || `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  if (!safeGet(ss, 'campuslink_sid')) safeSet(ss, 'campuslink_sid', sid);
  return sid;
})();

// 刷新锁
let refreshPromise: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  if (!refreshToken) return false;
  refreshPromise = fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-trace-id': traceId(), 'x-session-id': sessionId },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(async (resp) => {
      if (resp.ok) {
        const data = await resp.json();
        if (data.code === 0 && data.data?.token) {
          setSession(data.data.token, data.data.refresh_token);
          return true;
        }
      }
      setSession(null, null);
      return false;
    })
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

// 超时 fetch
async function fetchTO(url: string, options: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface ApiResponse<T = any> {
  code: number;
  data?: T;
  message?: string;
  detail?: string | null;
}

export async function request<T = any>(
  method: string,
  path: string,
  body?: unknown,
  isFormData = false,
  retries = method === 'GET' ? MAX_RETRIES_GET : 0,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'x-trace-id': traceId(),
    'x-session-id': sessionId,
  };
  if (!isFormData && body && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const fetchBody: BodyInit | undefined = isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined;

  try {
    let resp = await fetchTO(`${BASE}${path}`, { method, headers, body: fetchBody });

    if (resp.status === 401 && path !== '/auth/refresh') {
      const ok = await tryRefresh();
      if (ok && token) {
        headers['Authorization'] = `Bearer ${token}`;
        resp = await fetchTO(`${BASE}${path}`, { method, headers, body: fetchBody });
      }
    }
    if (resp.status === 401) {
      setSession(null, null);
      return { code: -1, message: '未登录' };
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { code: -1, message: err.message || `HTTP ${resp.status}`, detail: err.detail };
    }
    return await resp.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      if (retries > 0) return request<T>(method, path, body, isFormData, retries - 1);
      return { code: -1, message: '请求超时' };
    }
    if (method === 'GET' && retries > 0) {
      return request<T>(method, path, body, isFormData, retries - 1);
    }
    return { code: -1, message: err.message || '网络异常' };
  }
}
