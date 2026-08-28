/**
 * 统一内容举报路由 — 帖子/圈子帖子/圈子评论/私信共用一张 reports 表
 * 举报人必须登录（不允许匿名举报），否则被滥用协同诬告时无法追责
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { auth, adminAuth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { ErrorCode } from '../errors';
import { createReportSchema, resolveReportSchema, createAppealSchema, resolveAppealSchema } from '../validators';

// 命中这么多个不同举报人，自动软隐藏内容（保留可追溯，非作者本人看到"待审核"而非直接消失）
const AUTO_HIDE_THRESHOLD = 3;
// 同一账号名下不同内容被举报的件数达到这个值，视为惯犯信号，提升审核优先级
const REPEAT_OFFENDER_THRESHOLD = 3;

function isSchemaError(err: any): boolean {
  return err?.errno === 1054 || err?.code === 'ER_BAD_FIELD_ERROR' || err?.errno === 1146;
}

interface TargetInfo {
  ownerId: number | null;
  preview: string;
}

export function registerReportRoutes(app: any, pool: Pool) {
  /** 查目标内容的所有者 + 预览文本，用于展示和"不能举报自己"校验 */
  async function getTargetInfo(targetType: string, targetId: number): Promise<TargetInfo | null> {
    try {
      if (targetType === 'post') {
        const [rows]: any = await pool.query('SELECT user_id, title FROM posts WHERE id = ?', [targetId]);
        if (!rows.length) return null;
        return { ownerId: rows[0].user_id, preview: rows[0].title || '' };
      }
      if (targetType === 'circle_post') {
        const [rows]: any = await pool.query('SELECT user_id, content FROM circle_posts WHERE id = ?', [targetId]);
        if (!rows.length) return null;
        return { ownerId: rows[0].user_id, preview: (rows[0].content || '').slice(0, 60) };
      }
      if (targetType === 'circle_comment') {
        const [rows]: any = await pool.query('SELECT user_id, content FROM circle_comments WHERE id = ?', [targetId]);
        if (!rows.length) return null;
        return { ownerId: rows[0].user_id, preview: (rows[0].content || '').slice(0, 60) };
      }
      if (targetType === 'chat_message') {
        const [rows]: any = await pool.query('SELECT sender_id, content FROM chat_messages WHERE id = ?', [targetId]);
        if (!rows.length) return null;
        return { ownerId: rows[0].sender_id, preview: (rows[0].content || '').slice(0, 60) };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** 达到阈值自动软隐藏：posts → under_review，circle_post/circle_comment → hidden（复用已有状态）*/
  async function autoHideIfNeeded(targetType: string, targetId: number, traceId: string) {
    try {
      const [cntRows]: any = await pool.query(
        'SELECT COUNT(DISTINCT reporter_id) AS cnt FROM reports WHERE target_type = ? AND target_id = ?',
        [targetType, targetId],
      );
      if (cntRows[0].cnt < AUTO_HIDE_THRESHOLD) return;

      if (targetType === 'post') {
        await pool.query("UPDATE posts SET status = 'under_review' WHERE id = ? AND status = 'active'", [targetId]);
      } else if (targetType === 'circle_post') {
        await pool.query("UPDATE circle_posts SET status = 'hidden' WHERE id = ? AND status = 'active'", [targetId]);
      } else if (targetType === 'circle_comment') {
        await pool.query("UPDATE circle_comments SET status = 'hidden' WHERE id = ? AND status = 'active'", [targetId]);
      }
      logger.security('内容因多人举报自动软隐藏', {
        target_type: targetType,
        target_id: targetId,
        reporter_count: cntRows[0].cnt,
        trace_id: traceId,
      });
    } catch (err: any) {
      logger.error('自动软隐藏失败', {
        error: err.message,
        target_type: targetType,
        target_id: targetId,
        trace_id: traceId,
      });
    }
  }

  /** 同账号名下不同内容累计被举报件数达阈值 → 记安全日志，供管理端优先级排序 */
  async function checkRepeatOffender(ownerId: number | null, traceId: string) {
    if (!ownerId) return;
    try {
      const [rows]: any = await pool.query(
        `SELECT COUNT(*) AS cnt FROM (
           SELECT r.target_type, r.target_id FROM reports r
           LEFT JOIN posts p ON r.target_type = 'post' AND r.target_id = p.id
           LEFT JOIN circle_posts cp ON r.target_type = 'circle_post' AND r.target_id = cp.id
           LEFT JOIN circle_comments cc ON r.target_type = 'circle_comment' AND r.target_id = cc.id
           LEFT JOIN chat_messages cm ON r.target_type = 'chat_message' AND r.target_id = cm.id
           WHERE COALESCE(p.user_id, cp.user_id, cc.user_id, cm.sender_id) = ?
             AND r.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
           GROUP BY r.target_type, r.target_id
         ) t`,
        [ownerId],
      );
      if (rows[0].cnt >= REPEAT_OFFENDER_THRESHOLD) {
        logger.security('账号多次被举报，建议优先审核', {
          owner_id: ownerId,
          distinct_reported_items: rows[0].cnt,
          trace_id: traceId,
        });
      }
    } catch (err: any) {
      logger.error('惯犯检测失败', { error: err.message, owner_id: ownerId, trace_id: traceId });
    }
  }

  // ── 提交举报 ──
  app.post('/api/v1/reports', auth, limiter(5, 20), async (req: Request, res: Response) => {
    const input = validate(res, createReportSchema, req.body);
    if (!input) return;

    const userId = req.userId!;
    const traceId = (req as any)._traceId;

    try {
      const target = await getTargetInfo(input.targetType, input.targetId);
      if (!target) return fail(res, 404, '举报目标不存在', ErrorCode.NOT_FOUND);
      if (target.ownerId === userId) {
        return fail(res, 400, '不能举报自己的内容', ErrorCode.INVALID_INPUT);
      }

      try {
        await pool.query(
          'INSERT INTO reports (reporter_id, target_type, target_id, reason, reason_detail) VALUES (?, ?, ?, ?, ?)',
          [userId, input.targetType, input.targetId, input.reason, input.reasonDetail || null],
        );
      } catch (insertErr: any) {
        // 唯一约束命中：同一人已经举报过同一目标，幂等返回成功，不重复计数
        if (insertErr?.errno !== 1062) throw insertErr;
        return ok(res, { reported: true, duplicate: true });
      }

      logger.business('提交举报', {
        reporter_id: userId,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        trace_id: traceId,
      });

      // 异步触发自动检测，不阻塞响应
      autoHideIfNeeded(input.targetType, input.targetId, traceId).catch(() => {});
      checkRepeatOffender(target.ownerId, traceId).catch(() => {});

      ok(res, { reported: true, duplicate: false });
    } catch (err: any) {
      if (isSchemaError(err)) return fail(res, 500, '举报功能暂不可用');
      logger.error('提交举报失败', { error: err.message, user_id: userId, trace_id: traceId });
      fail(res, 500, '提交举报失败');
    }
  });

  // ── 管理端：举报列表（按状态筛选；支持 sort=priority 按"举报人数多→旧的优先"排序，
  //    帮管理员先看最该处理的，而不是清一色按提交时间倒序）──
  app.get('/api/v1/admin/reports', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string;
      const sort = req.query.sort as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      let where = '';
      const params: any[] = [];
      if (status) {
        where = ' WHERE r.status = ?';
        params.push(status);
      }
      // report_count/pending_appeal 是每行的"优先级信号"：同一个 target 被举报的人越多、
      // 或者已经挂着一条待审申诉，越应该被优先看到，而不是单纯按提交时间排队
      const orderBy = sort === 'priority' ? 'report_count DESC, r.created_at ASC' : 'r.created_at DESC';
      const [rows]: any = await pool.query(
        `SELECT r.id, r.target_type, r.target_id, r.reason, r.reason_detail, r.status, r.created_at, r.resolved_at, r.resolution_note,
                u.nickname AS reporter_nickname, u.student_id AS reporter_student_id,
                (SELECT COUNT(DISTINCT r2.reporter_id) FROM reports r2 WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id) AS report_count,
                (SELECT COUNT(*) FROM report_appeals a WHERE a.target_type = r.target_type AND a.target_id = r.target_id AND a.status = 'pending') AS pending_appeal
         FROM reports r
         JOIN users u ON r.reporter_id = u.id
         ${where}
         ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      const [countRows]: any = await pool.query(`SELECT COUNT(*) AS total FROM reports r ${where}`, params);

      // 补上目标预览和所有者，便于管理员不用点进去就能判断
      const list = await Promise.all(
        rows.map(async (r: any) => {
          const target = await getTargetInfo(r.target_type, r.target_id);
          return {
            id: r.id,
            targetType: r.target_type,
            targetId: r.target_id,
            reason: r.reason,
            reasonDetail: r.reason_detail,
            status: r.status,
            createdAt: r.created_at,
            resolvedAt: r.resolved_at,
            resolutionNote: r.resolution_note,
            reporterNickname: r.reporter_nickname,
            reporterStudentId: r.reporter_student_id,
            targetOwnerId: target?.ownerId ?? null,
            targetPreview: target?.preview ?? '(内容已删除)',
            reportCount: Number(r.report_count) || 1,
            hasPendingAppeal: !!r.pending_appeal,
          };
        }),
      );

      ok(res, { list, total: countRows[0].total });
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, { list: [], total: 0 });
      logger.error('管理端获取举报列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 管理端：按账号聚合举报历史（判断是否惯犯，而非孤立看单条内容） ──
  app.get('/api/v1/admin/reports/account/:userId', adminAuth, limiter(30), async (req: Request, res: Response) => {
    const ownerId = parseInt(req.params.userId as string, 10);
    if (isNaN(ownerId)) return fail(res, 400, '用户ID无效');
    // 管理员查看操作留痕：谁在什么时候查了谁的举报历史，防止滥权扒学生隐私
    logger.security('管理员查看账号举报历史', {
      admin_id: req.userId,
      target_owner_id: ownerId,
      trace_id: (req as any)._traceId,
    });
    try {
      const [rows]: any = await pool.query(
        `SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at
         FROM reports r
         LEFT JOIN posts p ON r.target_type = 'post' AND r.target_id = p.id
         LEFT JOIN circle_posts cp ON r.target_type = 'circle_post' AND r.target_id = cp.id
         LEFT JOIN circle_comments cc ON r.target_type = 'circle_comment' AND r.target_id = cc.id
         LEFT JOIN chat_messages cm ON r.target_type = 'chat_message' AND r.target_id = cm.id
         WHERE COALESCE(p.user_id, cp.user_id, cc.user_id, cm.sender_id) = ?
         ORDER BY r.created_at DESC`,
        [ownerId],
      );
      ok(res, rows);
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, []);
      logger.error('账号举报历史查询失败', { error: err.message, owner_id: ownerId, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 管理端：处理举报（驳回恢复内容 / 成立维持下架） ──
  app.put('/api/v1/admin/reports/:id', adminAuth, limiter(20), async (req: Request, res: Response) => {
    const reportId = parseInt(req.params.id as string, 10);
    if (isNaN(reportId)) return fail(res, 400, '举报ID无效');
    const input = validate(res, resolveReportSchema, req.body);
    if (!input) return;

    try {
      const [rows]: any = await pool.query('SELECT id, target_type, target_id, status FROM reports WHERE id = ?', [
        reportId,
      ]);
      if (!rows.length) return fail(res, 404, '举报不存在', ErrorCode.NOT_FOUND);
      const report = rows[0];

      await pool.query(
        'UPDATE reports SET status = ?, resolved_by = ?, resolution_note = ?, resolved_at = NOW() WHERE id = ?',
        [input.status, req.userId || null, input.resolutionNote || null, reportId],
      );

      if (input.status === 'dismissed') {
        // 驳回：如果内容之前是因为这套机制被软隐藏的，恢复可见
        if (report.target_type === 'post') {
          await pool.query("UPDATE posts SET status = 'active' WHERE id = ? AND status = 'under_review'", [
            report.target_id,
          ]);
        } else if (report.target_type === 'circle_post') {
          await pool.query("UPDATE circle_posts SET status = 'active' WHERE id = ? AND status = 'hidden'", [
            report.target_id,
          ]);
        } else if (report.target_type === 'circle_comment') {
          await pool.query("UPDATE circle_comments SET status = 'active' WHERE id = ? AND status = 'hidden'", [
            report.target_id,
          ]);
        }
      } else if (input.status === 'upheld') {
        // 成立：确保内容处于下架状态（哪怕之前没到自动阈值）
        if (report.target_type === 'post') {
          await pool.query("UPDATE posts SET status = 'under_review' WHERE id = ? AND status = 'active'", [
            report.target_id,
          ]);
        } else if (report.target_type === 'circle_post') {
          await pool.query("UPDATE circle_posts SET status = 'hidden' WHERE id = ? AND status = 'active'", [
            report.target_id,
          ]);
        } else if (report.target_type === 'circle_comment') {
          await pool.query("UPDATE circle_comments SET status = 'hidden' WHERE id = ? AND status = 'active'", [
            report.target_id,
          ]);
        }
      }

      logger.business('处理举报', {
        report_id: reportId,
        admin_id: req.userId,
        result: input.status,
        trace_id: (req as any)._traceId,
      });
      ok(res, { resolved: true });
    } catch (err: any) {
      if (isSchemaError(err)) return fail(res, 500, '功能暂不可用');
      logger.error('处理举报失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });

  /** 目标内容当前是否处于"因举报被软隐藏"的状态——只有这种状态下才有申诉的意义 */
  async function isTargetHidden(targetType: string, targetId: number): Promise<boolean> {
    try {
      if (targetType === 'post') {
        const [rows]: any = await pool.query("SELECT id FROM posts WHERE id = ? AND status = 'under_review'", [
          targetId,
        ]);
        return rows.length > 0;
      }
      const table = targetType === 'circle_post' ? 'circle_posts' : 'circle_comments';
      const [rows]: any = await pool.query(`SELECT id FROM ${table} WHERE id = ? AND status = 'hidden'`, [targetId]);
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  // ── 提交/重新提交申诉（仅内容作者本人，且内容当前确实处于隐藏状态才能申诉）──
  app.post('/api/v1/report-appeals', auth, limiter(5, 20), async (req: Request, res: Response) => {
    const input = validate(res, createAppealSchema, req.body);
    if (!input) return;
    const userId = req.userId!;
    const traceId = (req as any)._traceId;

    try {
      const target = await getTargetInfo(input.targetType, input.targetId);
      if (!target) return fail(res, 404, '内容不存在', ErrorCode.NOT_FOUND);
      if (target.ownerId !== userId) {
        return fail(res, 403, '只能对自己的内容提交申诉');
      }
      if (!(await isTargetHidden(input.targetType, input.targetId))) {
        return fail(res, 400, '该内容当前不是隐藏状态，无需申诉');
      }

      // upsert：被驳回后可以改一改理由重新提交，覆盖回 pending，不留多条历史造成状态歧义
      await pool.query(
        `INSERT INTO report_appeals (target_type, target_id, user_id, appeal_text)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE appeal_text = VALUES(appeal_text), status = 'pending',
           admin_note = NULL, resolved_by = NULL, resolved_at = NULL`,
        [input.targetType, input.targetId, userId, input.appealText],
      );

      logger.business('提交举报申诉', {
        user_id: userId,
        target_type: input.targetType,
        target_id: input.targetId,
        trace_id: traceId,
      });
      ok(res, { submitted: true });
    } catch (err: any) {
      if (isSchemaError(err)) return fail(res, 500, '申诉功能暂不可用');
      logger.error('提交申诉失败', { error: err.message, user_id: userId, trace_id: traceId });
      fail(res, 500, '提交申诉失败');
    }
  });

  // ── 查自己某条内容的申诉状态（内容详情页/我的发布页展示用）──
  app.get('/api/v1/report-appeals/mine', auth, limiter(30), async (req: Request, res: Response) => {
    const targetType = req.query.targetType as string;
    const targetId = parseInt(req.query.targetId as string, 10);
    if (!targetType || isNaN(targetId)) return fail(res, 400, '参数无效');

    try {
      const [rows]: any = await pool.query(
        'SELECT status, appeal_text, admin_note, created_at, resolved_at FROM report_appeals WHERE target_type = ? AND target_id = ? AND user_id = ?',
        [targetType, targetId, req.userId],
      );
      ok(res, rows[0] || null);
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, null);
      logger.error('查询申诉状态失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '查询失败');
    }
  });

  // ── 管理端：申诉列表 ──
  app.get('/api/v1/admin/report-appeals', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const status = (req.query.status as string) || 'pending';
      const [rows]: any = await pool.query(
        `SELECT a.id, a.target_type, a.target_id, a.appeal_text, a.status, a.admin_note, a.created_at, a.resolved_at,
                u.nickname, u.student_id
         FROM report_appeals a
         JOIN users u ON a.user_id = u.id
         WHERE a.status = ?
         ORDER BY a.created_at ASC`,
        [status],
      );
      const list = await Promise.all(
        rows.map(async (r: any) => {
          const target = await getTargetInfo(r.target_type, r.target_id);
          return {
            id: r.id,
            targetType: r.target_type,
            targetId: r.target_id,
            appealText: r.appeal_text,
            status: r.status,
            adminNote: r.admin_note,
            createdAt: r.created_at,
            resolvedAt: r.resolved_at,
            nickname: r.nickname,
            studentId: r.student_id,
            targetPreview: target?.preview ?? '(内容已删除)',
          };
        }),
      );
      ok(res, list);
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, []);
      logger.error('管理端获取申诉列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 管理端：审核申诉（通过=恢复内容可见+批量驳回该内容其余举报；驳回=维持隐藏，仅记录理由）──
  app.put('/api/v1/admin/report-appeals/:id', adminAuth, limiter(20), async (req: Request, res: Response) => {
    const appealId = parseInt(req.params.id as string, 10);
    if (isNaN(appealId)) return fail(res, 400, '申诉ID无效');
    const input = validate(res, resolveAppealSchema, req.body);
    if (!input) return;

    try {
      const [rows]: any = await pool.query('SELECT id, target_type, target_id FROM report_appeals WHERE id = ?', [
        appealId,
      ]);
      if (!rows.length) return fail(res, 404, '申诉不存在', ErrorCode.NOT_FOUND);
      const appeal = rows[0];

      await pool.query(
        'UPDATE report_appeals SET status = ?, admin_note = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?',
        [input.status, input.adminNote || null, req.userId || null, appealId],
      );

      if (input.status === 'approved') {
        if (appeal.target_type === 'post') {
          await pool.query("UPDATE posts SET status = 'active' WHERE id = ? AND status = 'under_review'", [
            appeal.target_id,
          ]);
        } else if (appeal.target_type === 'circle_post') {
          await pool.query("UPDATE circle_posts SET status = 'active' WHERE id = ? AND status = 'hidden'", [
            appeal.target_id,
          ]);
        } else if (appeal.target_type === 'circle_comment') {
          await pool.query("UPDATE circle_comments SET status = 'active' WHERE id = ? AND status = 'hidden'", [
            appeal.target_id,
          ]);
        }
        // 申诉通过等于承认之前的举报是误判，批量把这条内容名下还没处理完的举报一并驳回，
        // 不然申诉通过了、恢复了可见，那些 pending/upheld 的举报记录却孤零零地挂在那里自相矛盾
        await pool.query(
          "UPDATE reports SET status = 'dismissed', resolved_by = ?, resolution_note = '因申诉通过自动驳回', resolved_at = NOW() WHERE target_type = ? AND target_id = ? AND status IN ('pending', 'upheld')",
          [req.userId || null, appeal.target_type, appeal.target_id],
        );
      }

      logger.security('处理举报申诉', {
        appeal_id: appealId,
        admin_id: req.userId,
        result: input.status,
        trace_id: (req as any)._traceId,
      });
      ok(res, { resolved: true });
    } catch (err: any) {
      if (isSchemaError(err)) return fail(res, 500, '功能暂不可用');
      logger.error('处理申诉失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });
}
