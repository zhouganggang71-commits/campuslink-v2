/**
 * 业务配置
 * - GET /config/term            公开：当前学年/学期/第几周（前端周数展示 + 默认学期选择共用）
 * - GET /admin/term-config      管理端：全部学期配置
 * - PUT /admin/term-config      管理端：upsert 学期开学日期（一年配两次）
 */
import { Request, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { termConfigSchema } from '../validators';
import { getCurrentTermInfo } from '../termConfig';

export function registerConfigRoutes(app: any, pool: any) {
  // ── 当前学期信息（公开，无 PII） ──
  app.get('/api/v1/config/term', limiter(30), async (req: Request, res: Response) => {
    try {
      ok(res, await getCurrentTermInfo(pool));
    } catch (err: any) {
      logger.error('获取当前学期失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 管理端：学期配置列表 ──
  app.get('/api/v1/admin/term-config', adminAuth, async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        'SELECT id, school_year, school_term, start_date, weeks, updated_at FROM term_config ORDER BY start_date DESC',
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取学期配置失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 管理端：upsert 学期配置 ──
  app.put('/api/v1/admin/term-config', adminAuth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, termConfigSchema, req.body);
      if (!input) return;
      await pool.query(
        `INSERT INTO term_config (school_year, school_term, start_date, weeks)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE start_date = VALUES(start_date), weeks = VALUES(weeks)`,
        [input.schoolYear, input.schoolTerm, input.startDate, input.weeks],
      );
      logger.business('学期配置更新', {
        school_year: input.schoolYear,
        school_term: input.schoolTerm,
        start_date: input.startDate,
      });
      ok(res, { message: '已保存' });
    } catch (err: any) {
      logger.error('学期配置更新失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '保存失败');
    }
  });
}
