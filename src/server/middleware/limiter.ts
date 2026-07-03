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

// 每个 limiter 实例（即每个接口）独立计数桶。
// 修复：旧实现全部接口共享同一个按 IP 的计数器，登录后的背景轮询
// （私信 3s/会话 15s）会把计数顶满，导致扫码登录等低频接口误判 429。
const allStores: Map<string, RateEntry>[] = [];

// 每 60 秒清理过期条目，防止 Map 无限增长
const CLEANUP_INTERVAL = 60_000;
let cleanupStarted = false;

function startCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    let deleted = 0;
    let remaining = 0;
    for (const store of allStores) {
      for (const [key, entry] of store) {
        if (now > entry.secReset && now > entry.minReset) {
          store.delete(key);
          deleted++;
        }
      }
      remaining += store.size;
    }
    if (deleted > 0) {
      logger.info(`限流器清理: 移除 ${deleted} 个过期条目, 剩余 ${remaining}`);
    }
  }, CLEANUP_INTERVAL);
}

startCleanup();

export function limiter(maxPerSec: number, maxPerMinute?: number) {
  const store = new Map<string, RateEntry>();
  allStores.push(store);
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let entry = store.get(ip);

    if (!entry) {
      entry = { secCount: 0, secReset: now + 1000, minCount: 0, minReset: now + 60_000 };
      store.set(ip, entry);
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
