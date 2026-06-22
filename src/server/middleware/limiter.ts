import { Request, Response, NextFunction } from "express";
/**
 * 简易限流（内存计数器）+ 安全日志
 */
import { logger } from '../../utils/logger';

const rateLimit = new Map<string, { count: number; reset: number }>();

// 每 60 秒清理过期条目，防止 Map 无限增长
const CLEANUP_INTERVAL = 60_000;
let cleanupStarted = false;

function startCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    let deleted = 0;
    for (const [key, entry] of rateLimit) {
      if (now > entry.reset) {
        rateLimit.delete(key);
        deleted++;
      }
    }
    if (deleted > 0) {
      logger.info(`限流器清理: 移除 ${deleted} 个过期条目, 剩余 ${rateLimit.size}`);
    }
  }, CLEANUP_INTERVAL);
}

startCleanup();

export function limiter(maxPerSec: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const entry = rateLimit.get(ip);
    if (!entry || now > entry.reset) {
      rateLimit.set(ip, { count: 1, reset: now + 1000 });
      return next();
    }
    if (entry.count >= maxPerSec) {
      logger.security('限流触发', {
        ip,
        path: req.originalUrl,
        limit: maxPerSec,
        trace_id: req._traceId,
      });
      return res.status(429).json({ code: -1, error: '请求太频繁' });
    }
    entry.count++;
    next();
  };
}
