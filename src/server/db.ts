/**
 * 数据库 + 连接池 + 慢查询追踪 + 熔断保护
 */
import mysql from 'mysql2/promise';
import { logger } from '../utils/logger';
import { CircuitBreaker } from './circuitBreaker';
import { env } from './envSchema';

const dbBreaker = new CircuitBreaker({
  failureThreshold: 10,
  resetTimeout: 30_000,
  name: 'mysql',
});

const rawPool = mysql.createPool({
  host: '127.0.0.1',
  user: 'campuslink',
  password: env.CAMPUSLINK_DB_PW,
  database: 'campuslink',
  connectionLimit: 50,
  waitForConnections: true,
  queueLimit: 100, // 超过 100 个排队请求时拒绝新连接，防止 OOM
});

let charsetEnsured = false;

// ── 慢查询阈值 ──
const SLOW_QUERY_MS = 200;

function sqlDigest(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 200);
}

// ── 查询追踪 + 熔断 + 字符集保证 ──
const _rawQuery = rawPool.query.bind(rawPool);
const _rawExecute = rawPool.execute.bind(rawPool);

async function traceQuery(fn: (...args: any[]) => Promise<any>, sql: string, params?: any): Promise<any> {
  // 首次查询时确保 utf8mb4 字符集（直接调用原始方法，不走 proxy 避免递归）
  if (!charsetEnsured) {
    charsetEnsured = true;
    try {
      await _rawQuery('SET NAMES utf8mb4');
    } catch {
      /* 非关键 */
    }
  }
  const start = Date.now();

  return dbBreaker
    .exec(
      () => fn(sql, params),
      // 降级：熔断时返回空结果避免崩溃
      () => {
        const isSelect = /^\s*SELECT/i.test(sql);
        if (!isSelect) throw new Error('数据库熔断中，写操作被拒绝');
        return [[]]; // SELECT 返回空结果
      },
    )
    .then(
      (result: any) => {
        const duration = Date.now() - start;
        if (duration >= SLOW_QUERY_MS) {
          logger.slow('慢查询', {
            sql: sqlDigest(sql),
            params: Array.isArray(params) ? params.slice(0, 10) : undefined,
            duration,
          });
        }
        return result;
      },
      (err: any) => {
        const duration = Date.now() - start;
        logger.slow('查询错误', {
          sql: sqlDigest(sql),
          params: Array.isArray(params) ? params.slice(0, 10) : undefined,
          duration,
          error: err.message?.slice(0, 200),
        });
        throw err;
      },
    );
}

export const pool = new Proxy(rawPool, {
  get(target, prop) {
    if (prop === 'query') {
      return (sql: string, params?: any) => traceQuery(_rawQuery, sql, params);
    }
    if (prop === 'execute') {
      return (sql: string, params?: any) => traceQuery(_rawExecute, sql, params);
    }
    const val = (target as any)[prop];
    return typeof val === 'function' ? val.bind(target) : val;
  },
});

export function getDbBreakerState() {
  return dbBreaker.getState();
}
