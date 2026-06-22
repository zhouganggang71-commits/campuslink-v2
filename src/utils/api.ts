/**
 * API 层 — 统一 HTTP 调用，自动 JWT + Trace ID + Session ID + Token 刷新
 */
const BASE = '/campus/api/v1';

function safeGetStorage(store: Storage | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function safeSetStorage(store: Storage | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* noop */
  }
}
function safeRemoveStorage(store: Storage | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    /* noop */
  }
}

const ls = typeof localStorage !== 'undefined' ? localStorage : null;
const ss = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

let token: string | null = safeGetStorage(ls, 'campuslink_token');
let refreshToken: string | null = safeGetStorage(ls, 'campuslink_refresh');

export function setSession(t: string | null, refresh: string | null) {
  token = t;
  refreshToken = refresh;
  if (t) safeSetStorage(ls, 'campuslink_token', t);
  else safeRemoveStorage(ls, 'campuslink_token');

  if (refresh) safeSetStorage(ls, 'campuslink_refresh', refresh);
  else safeRemoveStorage(ls, 'campuslink_refresh');
}

export function getToken() {
  return token;
}

function generateTraceId(): string {
  return `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const sessionId = (() => {
  const sid =
    safeGetStorage(ss, 'campuslink_sid') || `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  if (!safeGetStorage(ss, 'campuslink_sid')) safeSetStorage(ss, 'campuslink_sid', sid);
  return sid;
})();

// ── 刷新锁：避免并发多次刷新 ──
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  if (!refreshToken) return false;

  refreshPromise = fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-trace-id': generateTraceId(), 'x-session-id': sessionId },
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
    .catch(() => {
      return false;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function request<T>(
  method: string,
  path: string,
  body?: any,
): Promise<{ code: number; data?: T; message?: string; detail?: string }> {
  const headers: Record<string, string> = {
    'x-trace-id': generateTraceId(),
    'x-session-id': sessionId,
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    let resp = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });

    // Token 过期，尝试刷新
    if (resp.status === 401 && path !== '/auth/refresh' && path !== '/auth/dev-login') {
      const refreshed = await tryRefresh();
      if (refreshed && token) {
        headers['Authorization'] = `Bearer ${token}`;
        resp = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      }
    }

    if (resp.status === 401) {
      setSession(null, null);
      return { code: -1, message: '未登录' };
    }
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      return { code: -1, message: errBody.message || `HTTP ${resp.status}`, detail: errBody.detail };
    }
    return resp.json();
  } catch (err: any) {
    return { code: -1, message: err.message || '网络异常' };
  }
}

async function uploadRequest<T>(
  path: string,
  formData: FormData,
): Promise<{ code: number; data?: T; message?: string; detail?: string }> {
  const headers: Record<string, string> = {
    'x-trace-id': generateTraceId(),
    'x-session-id': sessionId,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    let resp = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });

    if (resp.status === 401 && path !== '/auth/refresh' && path !== '/auth/dev-login') {
      const refreshed = await tryRefresh();
      if (refreshed && token) {
        headers['Authorization'] = `Bearer ${token}`;
        resp = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });
      }
    }

    if (resp.status === 401) {
      setSession(null, null);
      return { code: -1, message: '未登录' };
    }
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      return { code: -1, message: errBody.message || `HTTP ${resp.status}`, detail: errBody.detail };
    }
    return resp.json();
  } catch (err: any) {
    return { code: -1, message: err.message || '网络异常' };
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: any) => request<T>('POST', path, body),
  put: <T>(path: string, body?: any) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, formData: FormData) => uploadRequest<T>(path, formData),
};
