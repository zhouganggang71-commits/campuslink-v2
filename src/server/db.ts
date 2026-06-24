/**
 * 数据库 + 连接池 + 慢查询追踪 + 熔断保护
 */
import mysql from 'mysql2/promise';
import { logger } from '../utils/logger';
import { CircuitBreaker } from './circuitBreaker';

const dbBreaker = new CircuitBreaker({
  failureThreshold: 10,
  resetTimeout: 30_000,
  name: 'mysql',
});

const rawPool = mysql.createPool({
  host: '127.0.0.1',
  user: 'campuslink',
  password: process.env.CAMPUSLINK_DB_PW,
  database: 'campuslink',
  connectionLimit: 50,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4',
});

// ── 慢查询阈值 ──
const SLOW_QUERY_MS = 200;

function sqlDigest(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 200);
}

// ── 查询追踪 + 熔断 ──
const _query = rawPool.query.bind(rawPool);
const _execute = rawPool.execute.bind(rawPool);

function traceQuery(fn: (...args: any[]) => Promise<any>, sql: string, params?: any): Promise<any> {
  const start = Date.now();

  return dbBreaker.exec(
    () => fn(sql, params),
    // 降级：熔断时返回空结果避免崩溃
    () => {
      const isSelect = /^\s*SELECT/i.test(sql);
      if (!isSelect) throw new Error('数据库熔断中，写操作被拒绝');
      return [[]]; // SELECT 返回空结果
    },
  ).then(
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
      return (sql: string, params?: any) => traceQuery(_query, sql, params);
    }
    if (prop === 'execute') {
      return (sql: string, params?: any) => traceQuery(_execute, sql, params);
    }
    const val = (target as any)[prop];
    return typeof val === 'function' ? val.bind(target) : val;
  },
});

export function getDbBreakerState() {
  return dbBreaker.getState();
}
