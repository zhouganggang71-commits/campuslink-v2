/**
 * CampusLink 全链路日志系统 v2
 * - 7 类日志分文件：access/error/business/slow/security/health/client
 * - Trace ID 贯穿：前端→服务端→响应→前端
 * - 结构化 JSON + 按日轮转 + 保留 7 天
 * - 请求中间件 + 全局错误捕获
 */
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogCategory = 'app' | 'access' | 'error' | 'business' | 'slow' | 'security' | 'health' | 'client';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let logDir = path.join(process.cwd(), 'logs');
let minLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

export function setLogDir(dir: string) {
  logDir = dir;
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  cleanOldLogs(); // 每次设置日志目录后清理过期日志
}
export function setLogLevel(level: LogLevel) {
  minLevel = level;
}

// ── Trace ID 生成 ──
export function generateTraceId(): string {
  return `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDateStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function writeFile(filename: string, line: string) {
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, filename), line + '\n');
  } catch {
    /* 写日志失败不抛异常 */
  }
}

/** 清理 7 天前的日志 */
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(logDir);
    const now = Date.now();
    for (const f of files) {
      const match = f.match(/^(\d{8})/);
      if (!match) continue;
      const fileDate = new Date(
        parseInt(match[1].slice(0, 4)),
        parseInt(match[1].slice(4, 6)) - 1,
        parseInt(match[1].slice(6, 8)),
      );
      if (now - fileDate.getTime() > 7 * 86400000) {
        fs.unlinkSync(path.join(logDir, f));
      }
    }
  } catch {
    /* 不阻塞启动 */
  }
}

// ── 核心日志函数 ──
function log(category: LogCategory, level: LogLevel, message: string, meta?: Record<string, any>) {
  if (LEVELS[level] < LEVELS[minLevel]) return;

  const ts = new Date().toISOString();
  const entry = {
    ts,
    cat: category,
    level: level.toUpperCase(),
    message,
    ...(meta || {}),
    ...(meta?.body ? { body: typeof meta.body === 'string' ? meta.body.slice(0, 500) : '[truncated]' } : {}),
  };

  const line = JSON.stringify(entry);

  // 控制台
  const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[36m';
  console.log(`${color}[${category}:${level.toUpperCase()}]\x1b[0m ${ts} ${message}`);

  // 主文件（全量）
  writeFile(`app-${getDateStr()}.log`, line);

  // 按分类分文件
  if (category !== 'app') writeFile(`${category}-${getDateStr()}.log`, line);
}

// ── 日志接口 ──
export const logger = {
  debug: (msg: string, meta?: Record<string, any>) => log('app', 'debug', msg, meta),
  info: (msg: string, meta?: Record<string, any>) => log('app', 'info', msg, meta),
  warn: (msg: string, meta?: Record<string, any>) => log('app', 'warn', msg, meta),
  error: (msg: string, meta?: Record<string, any>) => log('app', 'error', msg, meta),

  // 业务事件
  business: (event: string, meta?: Record<string, any>) => log('business', 'info', event, meta),

  // 安全事件
  security: (event: string, meta?: Record<string, any>) => log('security', 'warn', event, meta),

  // 慢请求/慢查询
  slow: (event: string, meta?: Record<string, any>) => log('slow', 'warn', event, meta),

  // 健康检查快照
  health: (event: string, meta?: Record<string, any>) => log('health', 'info', event, meta),

  // 前端上报的客户端错误
  client: (event: string, meta?: Record<string, any>) => log('client', 'error', event, meta),

  // ── 请求日志中间件（含 Trace ID 注入） ──
  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      const traceId = (req.headers['x-trace-id'] as string) || generateTraceId();
      const sessionId = (req.headers['x-session-id'] as string) || 'unknown';
      (req as any)._traceId = traceId;
      (req as any)._sessionId = sessionId;

      // 响应头注入 trace ID
      res.setHeader('x-trace-id', traceId);

      const bodyLog = req.method !== 'GET' ? JSON.stringify(req.body || {}).slice(0, 200) : undefined;

      res.on('finish', () => {
        const duration = Date.now() - start;
        const meta: Record<string, any> = {
          trace_id: traceId,
          session_id: sessionId,
          ip: req.ip || req.socket?.remoteAddress,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          duration,
        };
        if (bodyLog && bodyLog.length > 2) meta.body = bodyLog;

        if (res.statusCode >= 500) {
          log('access', 'error', `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, meta);
        } else if (res.statusCode >= 400) {
          log('access', 'warn', `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, meta);
        } else if (duration > 1000) {
          log('access', 'warn', `Slow: ${req.method} ${req.originalUrl} ${duration}ms`, meta);
          log('slow', 'warn', `Slow request: ${req.method} ${req.originalUrl} ${duration}ms`, meta);
        } else {
          log('access', 'info', `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, meta);
        }
      });
      next();
    };
  },
};

// ── 全局错误处理 ──
export function installGlobalHandlers() {
  process.on('uncaughtException', (err) => {
    logger.error(`FATAL uncaughtException: ${err.message}`, {
      stack: err.stack?.split('\n').slice(0, 5).join(' | '),
    });
  });

  process.on('unhandledRejection', (reason: any) => {
    logger.error(`FATAL unhandledRejection: ${reason?.message || String(reason)}`, {
      stack: reason?.stack?.split('\n').slice(0, 5).join(' | '),
    });
  });

  process.on('SIGTERM', () => {
    logger.info('收到 SIGTERM，优雅退出');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('收到 SIGINT，优雅退出');
    process.exit(0);
  });
}
