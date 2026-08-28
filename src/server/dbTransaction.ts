/**
 * 事务封装 —— 自动 BEGIN/COMMIT/ROLLBACK + 连接释放
 * 替代路由中手动 getConnection/beginTransaction/commit/rollback 的重复模式
 */
import { Pool, PoolConnection } from 'mysql2/promise';

export async function withTransaction<T>(pool: Pool, fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
