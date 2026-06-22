/**
 * React 错误边界 — 捕获子组件树未处理异常，上报服务端
 * 作用：防止单个组件崩溃导致整个页面白屏
 */
import React from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const payload = {
      message: error.message?.slice(0, 500),
      stack: (error.stack || '').slice(0, 1000),
      component: (info.componentStack || '').split('\n').slice(1, 4).join(' | ').slice(0, 500),
      url: window.location.href,
    };

    // 上报服务端（fire-and-forget）
    fetch('/campus/api/log/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-gray-400">
            <div className="text-5xl mb-4">:(</div>
            <p className="text-sm font-semibold text-gray-500 mb-1">页面遇到问题</p>
            <p className="text-xs mb-4">请刷新页面重试</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary text-white text-xs font-semibold px-4 py-2 rounded-lg"
            >
              刷新页面
            </button>
            {this.state.error && (
              <details className="mt-4 text-xs text-gray-400 max-w-md">
                <summary className="cursor-pointer">错误详情</summary>
                <pre className="mt-1 whitespace-pre-wrap">{this.state.error.message}</pre>
              </details>
            )}
          </div>
        )
      );
    }
    return this.props.children;
  }
}
