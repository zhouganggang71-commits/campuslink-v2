/**
 * 数据库 + 认证工具 + 查询追踪
 */
import mysql from 'mysql2/promise';
import { logger } from '../utils/logger';

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
const SLOW_QUERY_MS = 200; // 超过 200ms 记录慢查询

function sqlDigest(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 200);
}

// ── 查询追踪 Proxy ──
const _query = rawPool.query.bind(rawPool);
const _execute = rawPool.execute.bind(rawPool);

function traceQuery(fn: (...args: any[]) => Promise<any>, sql: string, params?: any): Promise<any> {
  const start = Date.now();
  return fn(sql, params).then(
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
