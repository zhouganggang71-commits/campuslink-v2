/**
 * 前端事件上报 — 复用服务端 /api/log/client-error 通道（原只给 ErrorBoundary 用）
 * 用于非崩溃性但值得排查的前端异常（如接口返回异常结构），写入 logs/client-日期.log
 */
export function reportClientError(message: string, extra?: { stack?: string; component?: string }) {
  try {
    fetch('/campus/api/log/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message?.slice(0, 500),
        stack: extra?.stack?.slice(0, 1000),
        component: extra?.component,
        url: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).catch(() => {});
  } catch { /* 上报失败不影响主流程 */ }
}
