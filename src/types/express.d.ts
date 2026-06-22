/**
 * Express Request 类型扩展
 * 添加中间件注入的自定义属性（userId, isAdmin, _traceId 等）
 * 避免路由中使用 req: any
 *
 * Express 类型定义在 global.Express 命名空间中（express-serve-static-core）
 * 通过 declaration merging 扩展
 */
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      isAdmin?: boolean;
      isVerified?: boolean;
      _traceId?: string;
      _sessionId?: string;
    }
  }
}

export {};
