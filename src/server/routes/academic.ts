/**
 * 成绩 / 考试安排查询 —— 数据来源于扫码登录时顺带同步，此处读取本地 DB
 * 同时也提供一键刷新接口，复用存储的教务 Cookie 重新拉取
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail } from '../response';
import { parseExamStart } from '../../utils/examTime';

// 排序口径同 courses.ts /courses/terms：xnm(school_year)=学期开始所在自然年，同一 xnm 下
// 秋(3,当年9月) 晚于 春(12,当年3月)——旧版用 `school_term + 0 DESC` 把 12 排在 3 前面，
// 在这套语义下顺序是反的（只是目前 grades/exams 每次都整表覆盖只存一个学期，这个排序暂时
// 不影响实际展示；改成一致口径是为了不留技术债，等哪天也支持多学期存档就不会踩同一个坑）
export function registerAcademicRoutes(app: any, pool: Pool) {
  app.get('/api/v1/grades', auth, limiter(20, 100), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT id, school_year, school_term, course_name, teacher, credit, grade, grade_point,
                exam_nature, course_nature, course_category, course_attribution, open_college, created_at
         FROM grades WHERE user_id = ? ORDER BY school_year DESC, (CASE school_term WHEN '3' THEN 2 WHEN '12' THEN 1 ELSE 0 END) DESC, id`,
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
         FROM exams WHERE user_id = ? ORDER BY school_year DESC, (CASE school_term WHEN '3' THEN 2 WHEN '12' THEN 1 ELSE 0 END) DESC, id`,
        [req.userId],
      );
      // exam_time 原文动态解析（不落解析列——解析器修 bug 后立刻对存量数据生效，原文是唯一事实源）
      const unparsed: string[] = [];
      const withStart = (rows as any[]).map((r) => {
        const start = parseExamStart(r.exam_time);
        if (!start && r.exam_time) unparsed.push(r.exam_time);
        return { ...r, exam_start: start ? start.toISOString() : null };
      });
      // 格式确认点：真实 kssj 格式还没见过非空样本，解析不动的原文记日志核对（考试时间非 PII）
      if (unparsed.length) {
        logger.business('exam_time 存在未识别格式', { user_id: req.userId, samples: unparsed.slice(0, 3) });
      }
      ok(res, withStart);
    } catch (err: any) {
      logger.error('获取考试安排失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '获取考试安排失败');
    }
  });
}
