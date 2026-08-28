/**
 * 课表 CRUD
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { createCourseSchema, courseOverrideSchema } from '../validators';
import { getCurrentSchoolTerm } from '../currentTerm';

export function registerCourseRoutes(app: any, pool: Pool) {
  // ── 单次调课 ──────────────────────────────────────────
  // 老师口头调课教务不反映，学生自己改"某周某节课"：本周停课 / 挪到(目标周,星期,节次)
  // (course_id, week) 唯一，重复提交 = 覆盖更新；恢复原状走 DELETE

  // 全部调课记录（随课表一起拉，前端渲染时叠加）
  app.get('/api/v1/course-overrides', auth, async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT o.id, o.course_id, o.week, o.action, o.to_week, o.to_weekday, o.to_start_period, o.to_period_span, o.to_classroom
         FROM course_overrides o WHERE o.user_id = ?`,
        [req.userId],
      );
      ok(res, rows);
    } catch (err: any) {
      // 表未迁移等情况优雅降级：返回空数组，课表照常显示
      if (err.code === 'ER_NO_SUCH_TABLE') return ok(res, []);
      logger.error('获取调课记录失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '获取调课记录失败');
    }
  });

  app.post('/api/v1/courses/:id/override', auth, limiter(20), async (req: Request, res: Response) => {
    try {
      const input = validate(res, courseOverrideSchema, req.body);
      if (!input) return;
      const courseId = String(req.params.id);
      // 归属校验：只能调自己的课
      const [rows]: any = await pool.query('SELECT id FROM courses WHERE id = ? AND user_id = ?', [
        courseId,
        req.userId,
      ]);
      if (!rows.length) return fail(res, 404, '课程不存在');

      await pool.query(
        `INSERT INTO course_overrides (user_id, course_id, week, action, to_week, to_weekday, to_start_period, to_period_span, to_classroom)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE action = VALUES(action), to_week = VALUES(to_week), to_weekday = VALUES(to_weekday),
           to_start_period = VALUES(to_start_period), to_period_span = VALUES(to_period_span), to_classroom = VALUES(to_classroom)`,
        [
          req.userId,
          courseId,
          input.week,
          input.action,
          input.action === 'move' ? input.toWeek : null,
          input.action === 'move' ? input.toWeekday : null,
          input.action === 'move' ? input.toStartPeriod : null,
          input.action === 'move' ? (input.toPeriodSpan ?? null) : null,
          input.action === 'move' ? input.toClassroom || null : null,
        ],
      );
      logger.business('调课', { user_id: req.userId, course_id: courseId, week: input.week, action: input.action });
      ok(res, { message: input.action === 'cancel' ? '本周该节课已停' : '调课成功' });
    } catch (err: any) {
      logger.error('调课失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '调课失败');
    }
  });

  // 恢复原状（按 课程+周 删除）
  app.delete('/api/v1/courses/:id/override', auth, limiter(20), async (req: Request, res: Response) => {
    try {
      const week = parseInt(String(req.query.week), 10);
      if (!week || week < 1 || week > 30) return fail(res, 400, 'week 参数无效');
      await pool.query('DELETE FROM course_overrides WHERE course_id = ? AND week = ? AND user_id = ?', [
        String(req.params.id),
        week,
        req.userId,
      ]);
      logger.business('调课恢复', { user_id: req.userId, course_id: req.params.id, week });
      ok(res, { message: '已恢复原课表' });
    } catch (err: any) {
      logger.error('调课恢复失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // 仿官网"学年+学期"筛选：不传 school_year/school_term 时返回全部（兼容旧客户端/无学期概念的场景）
  app.get('/api/v1/courses', auth, async (req: Request, res: Response) => {
    try {
      const { school_year, school_term } = req.query;
      let sql = 'SELECT * FROM courses WHERE user_id = ?';
      const params: any[] = [req.userId];
      if (school_year) {
        sql += ' AND school_year = ?';
        params.push(school_year);
      }
      if (school_term) {
        sql += ' AND school_term = ?';
        params.push(school_term);
      }
      sql += ' ORDER BY weekday, start_period';
      const [rows]: any = await pool.query(sql, params);
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取课表失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '获取课表失败');
    }
  });

  // 该用户已有数据的学年学期组合，供前端选择器渲染选项（不同学生年级不同，不能写死）
  app.get('/api/v1/courses/terms', auth, async (req: Request, res: Response) => {
    try {
      // xnm 语义 = 学期开始所在自然年（2026-07-04 实测核对）：同一 xnm 下
      // 春季(12)=当年3月 早于 秋季(3)=当年9月，时间倒序时秋季排前面
      const [rows]: any = await pool.query(
        `SELECT DISTINCT school_year, school_term FROM courses
         WHERE user_id = ? AND school_year IS NOT NULL AND school_term IS NOT NULL
         ORDER BY school_year DESC, (CASE school_term WHEN '3' THEN 2 WHEN '12' THEN 1 ELSE 0 END) DESC`,
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
      logger.error('添加课程失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
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
        logger.warn('课表批量导入跳过无效项', {
          index: i,
          course: JSON.stringify(courses[i]).slice(0, 200),
          trace_id: (req as any)._traceId,
        });
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
      logger.error('课表批量导入失败，已回滚', {
        error: err.message,
        user_id: req.userId,
        count: valid.length,
        trace_id: req._traceId,
      });
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
      logger.error('清空课表失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
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
          req.params.id,
          req.userId,
        ],
      );
      logger.business('课程编辑', {
        course_id: req.params.id,
        name: input.name,
        user_id: req.userId,
        trace_id: req._traceId,
      });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('编辑课程失败', {
        error: err.message,
        course_id: req.params.id,
        user_id: req.userId,
        trace_id: req._traceId,
      });
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
      logger.error('删除课程失败', {
        error: err.message,
        course_id: req.params.id,
        user_id: req.userId,
        trace_id: req._traceId,
      });
      fail(res, 500, '删除失败');
    }
  });
}
