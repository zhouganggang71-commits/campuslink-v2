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
  app.get('/api/v1/admin/stats', adminAuth, async (req: Request, res: Response) => {
    try {
      const [users]: any = await pool.query('SELECT COUNT(*) as c FROM users');
      const [posts]: any = await pool.query('SELECT COUNT(*) as c FROM posts');
      const [regs]: any = await pool.query('SELECT COUNT(*) as c FROM registrations');
      const [pending]: any = await pool.query("SELECT COUNT(*) as c FROM users WHERE auth_status='pending'");
      ok(res, {
        users: users[0].c,
        posts: posts[0].c,
        registrations: regs[0].c,
        pendingUsers: pending[0].c,
      });
    } catch (err: any) {
      logger.error('管理统计失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '统计失败');
    }
  });

  // ── 帖子 ──
  app.get('/api/v1/admin/posts', adminAuth, async (req: Request, res: Response) => {
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
      await pool.query('UPDATE posts SET status = ?, reject_reason = ? WHERE id = ?', [
        input.status,
        input.rejectReason || null,
        String(req.params.id),
      ]);
      logger.business('帖子审核', { post_id: String(req.params.id), status: input.status, trace_id: req._traceId });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('管理审核失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '审核失败');
    }
  });

  // ── 用户 ──
  app.get('/api/v1/admin/users', adminAuth, async (req: Request, res: Response) => {
    try {
      const status = (req.query.status as string) || 'all';
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      let query = 'SELECT id, student_id, nickname, auth_status, is_admin, created_at FROM users';
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
      await pool.query('UPDATE users SET auth_status = ? WHERE id = ?', [input.auth_status, req.params.id]);
      clearAuthCache(parseInt(String(req.params.id)));
      logger.business('用户审核', { user_id: String(req.params.id), status: input.auth_status, trace_id: req._traceId });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('管理审核失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '审核失败');
    }
  });

  // ── 课表 ──
  app.get('/api/v1/admin/courses', adminAuth, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      const [rows]: any = await pool.query(
        'SELECT c.*, u.nickname FROM courses c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.id DESC LIMIT ? OFFSET ?',
        [limit, (page - 1) * limit],
      );
      const [countRows]: any = await pool.query('SELECT COUNT(*) as total FROM courses');
      ok(res, { list: rows, total: countRows[0].total });
    } catch (err: any) {
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '获取失败');
    }
  });

  // ── 报名 ──
  app.get('/api/v1/admin/registrations', adminAuth, async (req: Request, res: Response) => {
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
  app.get('/api/v1/admin/favorites', adminAuth, async (req: Request, res: Response) => {
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
  app.get('/api/v1/admin/tokens', adminAuth, async (req: Request, res: Response) => {
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
  app.get('/api/v1/admin/ads', adminAuth, async (req: Request, res: Response) => {
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
      const fields: string[] = [];
      const values: any[] = [];
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) {
          fields.push(`${k} = ?`);
          values.push(v);
        }
      }
      if (fields.length === 0) return fail(res, 400, '无更新内容');
      values.push(String(req.params.id));
      await pool.query(`UPDATE ads SET ${fields.join(', ')} WHERE id = ?`, values);
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
