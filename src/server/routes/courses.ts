/**
 * 课表 CRUD
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { createCourseSchema } from '../validators';

export function registerCourseRoutes(app: any, pool: Pool) {
  app.get('/api/v1/courses', auth, async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query('SELECT * FROM courses WHERE user_id = ? ORDER BY weekday, start_period', [
        req.userId,
      ]);
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取课表失败', { error: err.message, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '获取课表失败');
    }
  });

  app.post('/api/v1/courses', auth, limiter(50), async (req: Request, res: Response) => {
    try {
      const input = validate(res, createCourseSchema, req.body);
      if (!input) return;

      const col = input.colorClass || 'bg-course-blue text-white';
      const [result]: any = await pool.query(
        `INSERT INTO courses (user_id, name, teacher, classroom, weekday, start_period, period_span, week_start, week_end, week_type, course_type, color_class)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          req.userId,
          input.name,
          input.teacher,
          input.classroom,
          input.weekday,
          input.startPeriod,
          input.periodSpan,
          input.weekStart,
          input.weekEnd,
          input.weekType,
          input.courseType,
          col,
        ],
      );
      logger.business('课程添加', {
        course_id: result.insertId,
        name: input.name,
        user_id: req.userId,
        trace_id: req._traceId,
      });
      ok(res, { id: result.insertId });
    } catch (err: any) {
      logger.error('添加课程失败', { error: err.message, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '添加课程失败');
    }
  });

  // ── 批量替换课表（原子操作：清空 + 导入）──
  app.put('/api/v1/courses/batch', auth, limiter(50), async (req: Request, res: Response) => {
    const courses = req.body;
    if (!Array.isArray(courses)) return fail(res, 400, '请求体必须是课程数组');

    // 逐项 Zod 校验（与单条 POST 一致）
    for (let i = 0; i < courses.length; i++) {
      const parsed = validate(res, createCourseSchema, courses[i]);
      if (!parsed) return;
      courses[i] = parsed;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 清空当前用户全部课程
      await conn.query('DELETE FROM courses WHERE user_id = ?', [req.userId]);

      // 批量插入
      for (const c of courses) {
        const col = c.colorClass || 'bg-course-blue text-white';
        await conn.query(
          `INSERT INTO courses (user_id, name, teacher, classroom, weekday, start_period, period_span, week_start, week_end, week_type, course_type, color_class)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            req.userId,
            c.name,
            c.teacher || '',
            c.classroom || '',
            c.weekday || 1,
            c.startPeriod || 1,
            c.periodSpan || 2,
            c.weekStart || 1,
            c.weekEnd || 18,
            c.weekType || 'all',
            c.courseType || 'theory',
            col,
          ],
        );
      }

      await conn.commit();
      logger.business('课表批量导入', { user_id: req.userId, count: courses.length, trace_id: req._traceId });
      ok(res, { count: courses.length });
    } catch (err: any) {
      await conn.rollback();
      logger.error('课表批量导入失败，已回滚', { error: err.message, user_id: req.userId, count: courses.length, trace_id: req._traceId});
      fail(res, 500, '导入失败');
    } finally {
      conn.release();
    }
  });

  app.delete('/api/v1/courses', auth, limiter(5), async (req: Request, res: Response) => {
    try {
      await pool.query('DELETE FROM courses WHERE user_id = ?', [req.userId]);
      logger.business('课表已清空', { user_id: req.userId, trace_id: req._traceId });
      ok(res, null, '已清空');
    } catch (err: any) {
      logger.error('清空课表失败', { error: err.message, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '清空失败');
    }
  });

  app.delete('/api/v1/courses/:id', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const [result]: any = await pool.query('DELETE FROM courses WHERE id = ? AND user_id = ?', [
        req.params.id,
        req.userId,
      ]);
      if (result.affectedRows === 0) return fail(res, 404, '课程不存在或无权操作');
      logger.business('课程删除', { course_id: req.params.id, user_id: req.userId, trace_id: req._traceId });
      ok(res, null, '已删除');
    } catch (err: any) {
      logger.error('删除课程失败', { error: err.message, course_id: req.params.id, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '删除失败');
    }
  });
}
