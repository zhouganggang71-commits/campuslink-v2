/**
 * 用户消息通知路由
 * 提供消息列表、单条已读、全部已读
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail } from '../response';

export function registerNoticeRoutes(app: any, pool: Pool) {
  // ── 防御：迁移未执行时降级返回空数据，而非 500 ──
  function isSchemaError(err: any): boolean {
    // errno 1054 = Unknown column（迁移尚未执行）
    return err?.errno === 1054 || err?.code === 'ER_BAD_FIELD_ERROR';
  }

  // ── 获取我的消息列表 ──
  app.get('/api/v1/notices', auth, async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT id, title, content, category, is_read, created_at
         FROM notices
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.userId],
      );
      ok(res, rows);
    } catch (err: any) {
      if (isSchemaError(err)) {
        logger.warn('notices 表结构未升级，返回空消息', { user_id: req.userId, trace_id: req._traceId });
        return ok(res, []);
      }
      logger.error('获取消息失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '获取消息失败');
    }
  });

  // ── 单条已读 ──
  app.put('/api/v1/notices/:id/read', auth, limiter(30), async (req: Request, res: Response) => {
    try {
      const [result]: any = await pool.query(
        'UPDATE notices SET is_read = TRUE WHERE id = ? AND user_id = ?',
        [req.params.id, req.userId],
      );
      if (result.affectedRows === 0) {
        return fail(res, 404, '消息不存在或不属于你');
      }
      ok(res, null);
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, null);
      logger.error('标记已读失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 全部已读 ──
  app.put('/api/v1/notices/read-all', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      await pool.query(
        'UPDATE notices SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
        [req.userId],
      );
      ok(res, null);
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, null);
      logger.error('全部已读失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '操作失败');
    }
  });
}
