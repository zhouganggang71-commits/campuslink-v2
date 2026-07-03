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
import { getCurrentSchoolTerm } from '../currentTerm';

export function registerCourseRoutes(app: any, pool: Pool) {
  // 仿官网"学年+学期"筛选：不传 school_year/school_term 时返回全部（兼容旧客户端/无学期概念的场景）
  app.get('/api/v1/courses', auth, async (req: Request, res: Response) => {
    try {
      const { school_year, school_term } = req.query;
      let sql = 'SELECT * FROM courses WHERE user_id = ?';
      const params: any[] = [req.userId];
      if (school_year) { sql += ' AND school_year = ?'; params.push(school_year); }
      if (school_term) { sql += ' AND school_term = ?'; params.push(school_term); }
      sql += ' ORDER BY weekday, start_period';
      const [rows]: any = await pool.query(sql, params);
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取课表失败', { error: err.message, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '获取课表失败');
    }
  });

  // 该用户已有数据的学年学期组合，供前端选择器渲染选项（不同学生年级不同，不能写死）
  app.get('/api/v1/courses/terms', auth, async (req: Request, res: Response) => {
    try {
      // school_term 是字符串编码(3=秋/12=春)，直接按字符串排会把'12'排在'3'前面(字典序)，
      // 但学年内春季(12)其实晚于秋季(3)，用 CASE 映射成序号再排才对
      const [rows]: any = await pool.query(
        `SELECT DISTINCT school_year, school_term FROM courses
         WHERE user_id = ? AND school_year IS NOT NULL AND school_term IS NOT NULL
         ORDER BY school_year DESC, (CASE school_term WHEN '12' THEN 2 WHEN '3' THEN 1 ELSE 0 END) DESC`,
        [req.userId],
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取学年学期列表失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '获取学年学期列表失败');
    }
  });

  app.post('/api/v1/courses', auth, limiter(50), async (req: Request, res: Response) => {
    try {
      if (!req.isVerified) return fail(res, 403, '账号待审核，审核通过后才能使用课表');
      const input = validate(res, createCourseSchema, req.body);
      if (!input) return;

      const col = input.colorClass || 'bg-course-blue text-white';
      // 手动添加没有学年学期概念，自动打上"当前学期"标签，才能出现在学年学期选择器里
      const { schoolYear, schoolTerm } = getCurrentSchoolTerm();
      const [result]: any = await pool.query(
        `INSERT INTO courses (user_id, school_year, school_term, source, name, teacher, classroom, weekday, start_period, period_span, week_start, week_end, week_type, course_type, color_class)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          req.userId,
          schoolYear,
          schoolTerm,
          'manual',
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

    // 逐项校验，单项失败跳过而非整批拒绝
    const valid: any[] = [];
    const skipped: { index: number; error: any }[] = [];
    for (let i = 0; i < courses.length; i++) {
      const parsed = createCourseSchema.safeParse(courses[i]);
      if (!parsed.success) {
        skipped.push({ index: i, error: parsed.error.flatten() });
        logger.warn('课表批量导入跳过无效项', { index: i, course: JSON.stringify(courses[i]).slice(0, 200), trace_id: (req as any)._traceId });
      } else {
        valid.push(parsed.data);
      }
    }
    if (valid.length === 0) return fail(res, 400, '没有有效课程可导入');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 这个接口是 PDF/HTML 课表 OCR 导入专用（见 ScheduleImportModal），只清空之前 OCR 导入的
      // 课程，不动扫码同步(scan_sync)和手动添加(manual)的课程
      await conn.query("DELETE FROM courses WHERE user_id = ? AND source = 'ocr'", [req.userId]);

      // OCR 导入没有学年学期概念，自动打上"当前学期"标签，才能出现在学年学期选择器里
      const { schoolYear, schoolTerm } = getCurrentSchoolTerm();

      // 批量插入
      for (const c of valid) {
        const col = c.colorClass || 'bg-course-blue text-white';
        await conn.query(
          `INSERT INTO courses (user_id, school_year, school_term, source, name, teacher, classroom, weekday, start_period, period_span, week_start, week_end, week_type, course_type, color_class)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            req.userId,
            schoolYear,
            schoolTerm,
            'ocr',
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
      logger.business('课表批量导入', { user_id: req.userId, count: valid.length, trace_id: req._traceId });
      ok(res, { count: valid.length });
    } catch (err: any) {
      await conn.rollback();
      logger.error('课表批量导入失败，已回滚', { error: err.message, user_id: req.userId, count: valid.length, trace_id: req._traceId});
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

  app.put('/api/v1/courses/:id', auth, limiter(50), async (req: Request, res: Response) => {
    try {
      const input = validate(res, createCourseSchema, req.body);
      if (!input) return;

      // 验证课程归属
      const [rows]: any = await pool.query('SELECT id FROM courses WHERE id = ? AND user_id = ?', [
        req.params.id,
        req.userId,
      ]);
      if (rows.length === 0) return fail(res, 404, '课程不存在或无权操作');

      const col = input.colorClass || 'bg-course-blue text-white';
      await pool.query(
        `UPDATE courses SET name=?, teacher=?, classroom=?, weekday=?, start_period=?, period_span=?,
         week_start=?, week_end=?, week_type=?, course_type=?, color_class=?
         WHERE id = ? AND user_id = ?`,
        [
          input.name, input.teacher, input.classroom, input.weekday, input.startPeriod,
          input.periodSpan, input.weekStart, input.weekEnd, input.weekType, input.courseType,
          col, req.params.id, req.userId,
        ],
      );
      logger.business('课程编辑', { course_id: req.params.id, name: input.name, user_id: req.userId, trace_id: req._traceId });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('编辑课程失败', { error: err.message, course_id: req.params.id, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '编辑失败');
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
