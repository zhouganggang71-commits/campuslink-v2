/**
 * 成绩 / 考试安排查询 —— 数据来源于扫码登录时顺带同步（见 auth-wechat.ts），此处只读，不做抓取
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail } from '../response';

export function registerAcademicRoutes(app: any, pool: Pool) {
  app.get('/api/v1/grades', auth, limiter(20, 100), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT id, school_year, school_term, course_name, teacher, credit, grade, grade_point,
                exam_nature, course_nature, course_category, course_attribution, open_college, created_at
         FROM grades WHERE user_id = ? ORDER BY school_year DESC, school_term DESC, id`,
        [req.userId],
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取成绩失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '获取成绩失败');
    }
  });

  app.get('/api/v1/exams', auth, limiter(20, 100), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT id, school_year, school_term, course_name, teacher, exam_name, exam_time,
                exam_location, campus, seat_number, created_at
         FROM exams WHERE user_id = ? ORDER BY school_year DESC, school_term DESC, id`,
        [req.userId],
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取考试安排失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '获取考试安排失败');
    }
  });
}
