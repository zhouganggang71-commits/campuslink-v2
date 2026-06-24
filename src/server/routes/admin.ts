import { Request, Response } from "express";
/**
 * 管理员路由 — 全表查询 + 审核 + 数据解密
 */
import { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { adminAuth, clearAuthCache } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { updatePostStatusSchema, updateUserStatusSchema } from '../validators';
import { decrypt } from '../crypto';

export function registerAdminRoutes(app: any, pool: Pool) {
  // ── 仪表盘统计 ──
  app.get('/api/v1/admin/stats', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const [users]: any = await pool.query('SELECT COUNT(*) as c FROM users');
      const [posts]: any = await pool.query('SELECT COUNT(*) as c FROM posts');
      const [regs]: any = await pool.query('SELECT COUNT(*) as c FROM registrations');
      const [pending]: any = await pool.query("SELECT COUNT(*) as c FROM users WHERE auth_status='pending'");
      const [orgPending]: any = await pool.query("SELECT COUNT(*) as c FROM users WHERE auth_status='pending' AND org_level != '' AND position != ''");
      ok(res, {
        users: users[0].c,
        posts: posts[0].c,
        registrations: regs[0].c,
        pendingUsers: pending[0].c,
        orgPending: orgPending[0].c,
      });
    } catch (err: any) {
      logger.error('管理统计失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '统计失败');
    }
  });

  // ── 帖子 ──
  app.get('/api/v1/admin/posts', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      const status = req.query.status as string;
      let where = '';
      const params: any[] = [];
      if (status) {
        where = ' WHERE status = ?';
        params.push(status);
      }
      const [rows]: any = await pool.query(`SELECT * FROM posts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [
        ...params,
        limit,
        (page - 1) * limit,
      ]);
      const [countRows]: any = await pool.query(`SELECT COUNT(*) as total FROM posts ${where}`, params);
      ok(res, {
        list: rows.map((p: any) => ({ ...p, contact_info: decrypt(p.contact_info) || p.contact_info })),
        total: countRows[0].total,
      });
    } catch (err: any) {
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '获取失败');
    }
  });

  app.put('/api/v1/admin/posts/:id', adminAuth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, updatePostStatusSchema, req.body);
      if (!input) return;

      // 先获取帖子信息（用于写通知）
      const [postRows]: any = await pool.query('SELECT user_id, title FROM posts WHERE id = ?', [String(req.params.id)]);

      await pool.query('UPDATE posts SET status = ?, reject_reason = ? WHERE id = ?', [
        input.status,
        input.rejectReason || null,
        String(req.params.id),
      ]);

      // ── 向帖子作者推送审核结果通知 ──
      if (postRows.length > 0 && postRows[0].user_id) {
        const postUserId = postRows[0].user_id;
        const postTitle = postRows[0].title || '未命名帖子';
        const statusLabel = input.status === 'active' ? '已通过审核' : '已被打回';
        const noticeContent = input.status === 'rejected' && input.rejectReason
          ? `你的帖子「${postTitle}」已被打回。原因：${input.rejectReason}`
          : `你的帖子「${postTitle}」${statusLabel}，现已公开可见`;

        await pool.query(
          "INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'approval')",
          [postUserId, `帖子审核${input.status === 'active' ? '通过' : '打回'}`, noticeContent],
        ).catch((err: any) => logger.warn('审核通知写入失败', { error: err.message, post_id: req.params.id }));
      }

      logger.business('帖子审核', { post_id: String(req.params.id), status: input.status, trace_id: req._traceId });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('管理审核失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '审核失败');
    }
  });

  // ── 用户 ──
  app.get('/api/v1/admin/users', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const status = (req.query.status as string) || 'all';
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      let query = 'SELECT id, student_id, nickname, auth_status, is_admin, department, org_level, org_name, position, created_at FROM users';
      const params: any[] = [];
      if (status !== 'all') {
        query += ' WHERE auth_status = ?';
        params.push(status);
      }
      query += ' ORDER BY id DESC LIMIT ?';
      params.push(limit);
      const [rows]: any = await pool.query(query, params);
      ok(res, rows);
    } catch (err: any) {
      logger.error('管理获取用户失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '获取用户失败');
    }
  });

  app.put('/api/v1/admin/users/:id', adminAuth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, updateUserStatusSchema, req.body);
      if (!input) return;

      // 先获取用户信息（用于写通知）
      const [userRows]: any = await pool.query('SELECT nickname FROM users WHERE id = ?', [req.params.id]);

      await pool.query('UPDATE users SET auth_status = ? WHERE id = ?', [input.auth_status, req.params.id]);
      clearAuthCache(parseInt(String(req.params.id)));

      // ── 向用户推送身份审核结果通知 ──
      if (userRows.length > 0) {
        const userName = userRows[0].nickname || '同学';
        const statusMap: Record<string, string> = {
          verified: '你的身份认证已通过审核，现在可以使用全部功能了',
          rejected: '你的身份认证未通过审核，请检查提交的信息后重新认证',
        };
        const content = statusMap[input.auth_status];
        if (content) {
          await pool.query(
            "INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'approval')",
            [req.params.id, `身份认证${input.auth_status === 'verified' ? '通过' : '打回'}`, `${userName}，${content}`],
          ).catch((err: any) => logger.warn('审核通知写入失败', { error: err.message, user_id: req.params.id }));
        }
      }

      logger.business('用户审核', { user_id: String(req.params.id), status: input.auth_status, trace_id: req._traceId });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('管理审核失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '审核失败');
    }
  });

  // ── 课表（按用户分组）──
  app.get('/api/v1/admin/courses', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const userId = req.query.user_id as string;
      if (userId) {
        // 查看单个用户的课程
        const [rows]: any = await pool.query(
          'SELECT c.* FROM courses c WHERE c.user_id = ? ORDER BY c.weekday, c.start_period',
          [userId],
        );
        return ok(res, { courses: rows });
      }
      // 用户列表（有课表的）
      const [rows]: any = await pool.query(
        'SELECT u.id, u.nickname, u.student_id, COUNT(c.id) AS course_count FROM users u JOIN courses c ON c.user_id = u.id GROUP BY u.id ORDER BY u.id DESC',
      );
      ok(res, { users: rows });
    } catch (err: any) {
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '获取失败');
    }
  });

  // ── 报名 ──
  app.get('/api/v1/admin/registrations', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      const [rows]: any = await pool.query('SELECT * FROM registrations ORDER BY created_at DESC LIMIT ? OFFSET ?', [
        limit,
        (page - 1) * limit,
      ]);
      const [countRows]: any = await pool.query('SELECT COUNT(*) as total FROM registrations');
      ok(res, {
        list: rows.map((r: any) => ({
          ...r,
          registrant_name: decrypt(r.registrant_name) || r.registrant_name,
          student_id: decrypt(r.student_id) || r.student_id,
          phone: decrypt(r.phone) || r.phone,
        })),
        total: countRows[0].total,
      });
    } catch (err: any) {
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '获取失败');
    }
  });

  // ── 收藏 ──
  app.get('/api/v1/admin/favorites', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        'SELECT f.*, u.nickname, p.title as post_title FROM favorites f LEFT JOIN users u ON f.user_id = u.id LEFT JOIN posts p ON f.post_id = p.id ORDER BY f.created_at DESC LIMIT 100',
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '获取失败');
    }
  });

  // ── 登录令牌 ──
  app.get('/api/v1/admin/tokens', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        'SELECT r.*, u.nickname FROM refresh_tokens r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.created_at DESC LIMIT 100',
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '获取失败');
    }
  });

  // ── 广告管理 ──
  app.get('/api/v1/admin/ads', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query('SELECT * FROM ads ORDER BY priority DESC, id DESC');
      ok(res, rows);
    } catch (err: any) {
      logger.error('管理获取广告失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '获取失败');
    }
  });

  app.post('/api/v1/admin/ads', adminAuth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(
        res,
        z.object({
          title: z.string().min(1).max(200),
          image_url: z.string().max(500).default(''),
          link_url: z.string().max(500).default(''),
          position: z.string().default('banner'),
          priority: z.number().int().default(0),
          start_date: z.string().nullable().optional(),
          end_date: z.string().nullable().optional(),
        }),
        req.body,
      );
      if (!input) return;
      const [result]: any = await pool.query(
        'INSERT INTO ads (title, image_url, link_url, position, priority, start_date, end_date) VALUES (?,?,?,?,?,?,?)',
        [
          input.title,
          input.image_url,
          input.link_url,
          input.position,
          input.priority,
          input.start_date || null,
          input.end_date || null,
        ],
      );
      logger.business('广告添加', { ad_id: result.insertId, title: input.title, trace_id: req._traceId });
      ok(res, { id: result.insertId });
    } catch (err: any) {
      logger.error('添加广告失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '添加失败');
    }
  });

  app.put('/api/v1/admin/ads/:id', adminAuth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(
        res,
        z.object({
          title: z.string().min(1).max(200).optional(),
          image_url: z.string().max(500).optional(),
          link_url: z.string().max(500).optional(),
          is_active: z.boolean().optional(),
          priority: z.number().int().optional(),
          start_date: z.string().nullable().optional(),
          end_date: z.string().nullable().optional(),
        }),
        req.body,
      );
      if (!input) return;
      // 白名单映射：避免动态拼接列名
      const setClauses: string[] = [];
      const setValues: any[] = [];
      const columnMap: Record<string, string> = {
        title: 'title', image_url: 'image_url', link_url: 'link_url',
        is_active: 'is_active', priority: 'priority',
        start_date: 'start_date', end_date: 'end_date',
      };
      for (const [k, v] of Object.entries(input)) {
        const col = columnMap[k];
        if (col && v !== undefined) {
          setClauses.push(`${col} = ?`);
          setValues.push(v);
        }
      }
      if (setClauses.length === 0) return fail(res, 400, '无更新内容');
      setValues.push(String(req.params.id));
      await pool.query(`UPDATE ads SET ${setClauses.join(', ')} WHERE id = ?`, setValues);
      logger.business('广告更新', { ad_id: req.params.id, trace_id: req._traceId });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('更新广告失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '更新失败');
    }
  });

  app.delete('/api/v1/admin/ads/:id', adminAuth, limiter(5), async (req: Request, res: Response) => {
    try {
      await pool.query('DELETE FROM ads WHERE id = ?', [String(req.params.id)]);
      logger.business('广告删除', { ad_id: req.params.id, trace_id: req._traceId });
      ok(res, null, '已删除');
    } catch (err: any) {
      logger.error('删除广告失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '删除失败');
    }
  });
}
