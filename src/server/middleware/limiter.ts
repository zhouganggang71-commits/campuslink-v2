import { Request, Response, NextFunction } from "express";
/**
 * 双层限流（秒级 + 分钟级），防暴力破解
 */
import { logger } from '../../utils/logger';

interface RateEntry {
  secCount: number;
  secReset: number;
  minCount: number;
  minReset: number;
}

const rateLimit = new Map<string, RateEntry>();

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
      if (now > entry.secReset && now > entry.minReset) {
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

export function limiter(maxPerSec: number, maxPerMinute?: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let entry = rateLimit.get(ip);

    if (!entry) {
      entry = { secCount: 0, secReset: now + 1000, minCount: 0, minReset: now + 60_000 };
      rateLimit.set(ip, entry);
    }

    // 重置过期窗口
    if (now > entry.secReset) {
      entry.secCount = 0;
      entry.secReset = now + 1000;
    }
    if (now > entry.minReset) {
      entry.minCount = 0;
      entry.minReset = now + 60_000;
    }

    // 秒级限流
    if (entry.secCount >= maxPerSec) {
      logger.security('限流触发(秒级)', {
        ip,
        path: req.originalUrl,
        limit: maxPerSec,
        trace_id: req._traceId,
      });
      return res.status(429).json({ code: -1, error: '请求太频繁' });
    }

    // 分钟级限流（可选）
    if (maxPerMinute && entry.minCount >= maxPerMinute) {
      logger.security('限流触发(分钟级)', {
        ip,
        path: req.originalUrl,
        limit: maxPerMinute,
        trace_id: req._traceId,
      });
      return res.status(429).json({ code: -1, error: '请求太频繁，请稍后再试' });
    }

    entry.secCount++;
    entry.minCount++;
    next();
  };
}
