/**
 * 用户反馈/工单 — 提交 + 管理端查看/关闭
 */
import { Request, Response } from "express";
import { auth, adminAuth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { createFeedbackSchema } from '../validators';

export function registerFeedbackRoutes(app: any, pool: any) {
  // ── 提交反馈 ──
  app.post('/api/v1/feedback', auth, limiter(3), async (req: Request, res: Response) => {
    try {
      const input = validate(res, createFeedbackSchema, req.body);
      if (!input) return;
      const trimmed = input.content.trim().slice(0, 2000);
      const contactStr = input.contact.trim().slice(0, 200);
      const userId = (req as any).userId || 0;
      const userName = (req as any).userName || '';

      await pool.query(
        'INSERT INTO feedbacks (user_id, user_name, content, contact) VALUES (?, ?, ?, ?)',
        [userId, userName, trimmed, contactStr],
      );

      logger.business('反馈提交', { user_id: userId, content_len: trimmed.length });
      ok(res, { message: '反馈已提交' });
    } catch (err: any) {
      logger.error('反馈提交失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '提交失败');
    }
  });

  // ── 管理端：查看反馈列表 ──
  app.get('/api/v1/admin/feedbacks', adminAuth, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string;
      let query = 'SELECT id, user_id, user_name, content, contact, status, created_at, resolved_at FROM feedbacks';
      const params: any[] = [];
      if (status === 'pending' || status === 'resolved') {
        query += ' WHERE status = ?';
        params.push(status);
      }
      query += ' ORDER BY created_at DESC LIMIT 200';
      const [rows]: any = await pool.query(query, params);
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取反馈列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 管理端：关闭反馈 ──
  app.put('/api/v1/admin/feedbacks/:id/resolve', adminAuth, limiter(10), async (req: Request, res: Response) => {
    try {
      await pool.query('UPDATE feedbacks SET status = ?, resolved_at = NOW() WHERE id = ?', ['resolved', String(req.params.id)]);
      logger.business('反馈已处理', { feedback_id: req.params.id });
      ok(res, { message: '已标记为已处理' });
    } catch (err: any) {
      logger.error('处理反馈失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });
}
