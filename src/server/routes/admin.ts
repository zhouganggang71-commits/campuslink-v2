import { Request, Response } from 'express';
/**
 * 管理员路由 — 全表查询 + 审核 + 数据解密
 */
import { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { adminAuth, clearAuthCache } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import {
  updatePostStatusSchema,
  updateUserStatusSchema,
  updateCirclePostStatusSchema,
  updateCircleCommentStatusSchema,
} from '../validators';
import { decrypt } from '../crypto';
import { broadcastPush, sendPushToUser } from '../push';

export function registerAdminRoutes(app: any, pool: Pool) {
  // ── 仪表盘统计 ──
  app.get('/api/v1/admin/stats', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const [users]: any = await pool.query('SELECT COUNT(*) as c FROM users');
      const [posts]: any = await pool.query('SELECT COUNT(*) as c FROM posts');
      const [regs]: any = await pool.query('SELECT COUNT(*) as c FROM registrations');
      const [pending]: any = await pool.query("SELECT COUNT(*) as c FROM users WHERE auth_status='pending'");
      const [orgPending]: any = await pool.query(
        "SELECT COUNT(*) as c FROM users WHERE auth_status='pending' AND org_level != '' AND position != ''",
      );
      ok(res, {
        users: users[0].c,
        posts: posts[0].c,
        registrations: regs[0].c,
        pendingUsers: pending[0].c,
        orgPending: orgPending[0].c,
      });
    } catch (err: any) {
      logger.error('管理统计失败', { error: err.message, trace_id: req._traceId });
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
        list: rows.map((p: any) => ({ ...p, contact_info: decrypt(p.contact_info) ?? null })),
        total: countRows[0].total,
      });
    } catch (err: any) {
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '获取失败');
    }
  });

  app.put('/api/v1/admin/posts/:id', adminAuth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, updatePostStatusSchema, req.body);
      if (!input) return;

      // 先获取帖子信息（用于写通知）
      const [postRows]: any = await pool.query('SELECT user_id, title FROM posts WHERE id = ?', [
        String(req.params.id),
      ]);

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
        const noticeContent =
          input.status === 'rejected' && input.rejectReason
            ? `你的帖子「${postTitle}」已被打回。原因：${input.rejectReason}`
            : `你的帖子「${postTitle}」${statusLabel}，现已公开可见`;

        await pool
          .query("INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'approval')", [
            postUserId,
            `帖子审核${input.status === 'active' ? '通过' : '打回'}`,
            noticeContent,
          ])
          .catch((err: any) => logger.warn('审核通知写入失败', { error: err.message, post_id: req.params.id }));
      }

      logger.business('帖子审核', { post_id: String(req.params.id), status: input.status, trace_id: req._traceId });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('管理审核失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '审核失败');
    }
  });

  // ── 校园圈帖子（后台之前完全没有查看入口——"帖子"tab 只查 posts 表，
  //    校园圈内容存在独立的 circle_posts 表，管理员一条都看不到）──
  app.get('/api/v1/admin/circle-posts', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      let where = '';
      const params: any[] = [];
      if (status) {
        where = ' WHERE cp.status = ?';
        params.push(status);
      }
      // 管理端不做匿名脱敏（circles.ts 前台查询会把 is_anonymous 的作者 user_id 置空，
      // 但管理员审核违规内容必须能看到真实作者是谁，两者场景不同，故意不复用前台那套 CASE 逻辑）
      const [rows]: any = await pool.query(
        `SELECT cp.id, cp.circle_id, c.name AS circle_name, cp.user_id, u.nickname, u.student_id,
                cp.content, cp.images, cp.is_anonymous, cp.like_count, cp.comment_count, cp.status, cp.created_at
         FROM circle_posts cp
         JOIN users u ON cp.user_id = u.id
         LEFT JOIN circles c ON cp.circle_id = c.id
         ${where}
         ORDER BY cp.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      const [countRows]: any = await pool.query(`SELECT COUNT(*) as total FROM circle_posts cp ${where}`, params);
      ok(res, { list: rows, total: countRows[0].total });
    } catch (err: any) {
      logger.error('获取校园圈帖子失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '获取失败');
    }
  });

  app.put('/api/v1/admin/circle-posts/:id', adminAuth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, updateCirclePostStatusSchema, req.body);
      if (!input) return;
      const postId = String(req.params.id);

      const [rows]: any = await pool.query('SELECT user_id, content FROM circle_posts WHERE id = ?', [postId]);
      if (!rows.length) return fail(res, 404, '帖子不存在');

      await pool.query('UPDATE circle_posts SET status = ? WHERE id = ?', [input.status, postId]);

      // 管理员直接下架/恢复也通知作者一声，跟 posts 审核通知走同一张 notices 表
      if (rows[0].user_id && (input.status === 'hidden' || input.status === 'active')) {
        const preview = (rows[0].content || '').slice(0, 20);
        const noticeContent =
          input.status === 'hidden'
            ? `你的圈子帖子「${preview}」已被管理员下架`
            : `你的圈子帖子「${preview}」已恢复可见`;
        await pool
          .query("INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'approval')", [
            rows[0].user_id,
            input.status === 'hidden' ? '圈子帖子已下架' : '圈子帖子已恢复',
            noticeContent,
          ])
          .catch((err: any) => logger.warn('圈子帖子处理通知写入失败', { error: err.message, post_id: postId }));
      }

      logger.business('圈子帖子管理', {
        post_id: postId,
        status: input.status,
        admin_id: req.userId,
        trace_id: req._traceId,
      });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('圈子帖子管理失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 校园圈评论（照搬 circle_posts 模式：JOIN users 取真实昵称学号，不做匿名脱敏，
  //    额外 JOIN circle_posts 带出评论所属的帖子内容摘要，方便管理员判断上下文）──
  app.get('/api/v1/admin/circle-comments', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      let where = '';
      const params: any[] = [];
      if (status) {
        where = ' WHERE cc.status = ?';
        params.push(status);
      }
      const [rows]: any = await pool.query(
        `SELECT cc.id, cc.post_id, cp.content AS post_content, cc.user_id, u.nickname, u.student_id,
                cc.parent_id, cc.content, cc.image_url, cc.status, cc.created_at
         FROM circle_comments cc
         JOIN users u ON cc.user_id = u.id
         LEFT JOIN circle_posts cp ON cc.post_id = cp.id
         ${where}
         ORDER BY cc.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      const [countRows]: any = await pool.query(`SELECT COUNT(*) as total FROM circle_comments cc ${where}`, params);
      ok(res, { list: rows, total: countRows[0].total });
    } catch (err: any) {
      logger.error('获取校园圈评论失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '获取失败');
    }
  });

  app.put('/api/v1/admin/circle-comments/:id', adminAuth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, updateCircleCommentStatusSchema, req.body);
      if (!input) return;
      const commentId = String(req.params.id);

      const [rows]: any = await pool.query('SELECT user_id, content FROM circle_comments WHERE id = ?', [commentId]);
      if (!rows.length) return fail(res, 404, '评论不存在');

      await pool.query('UPDATE circle_comments SET status = ? WHERE id = ?', [input.status, commentId]);

      if (rows[0].user_id && (input.status === 'hidden' || input.status === 'active')) {
        const preview = (rows[0].content || '').slice(0, 20);
        const noticeContent =
          input.status === 'hidden' ? `你的评论「${preview}」已被管理员下架` : `你的评论「${preview}」已恢复可见`;
        await pool
          .query("INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'approval')", [
            rows[0].user_id,
            input.status === 'hidden' ? '评论已下架' : '评论已恢复',
            noticeContent,
          ])
          .catch((err: any) => logger.warn('评论处理通知写入失败', { error: err.message, comment_id: commentId }));
      }

      logger.business('圈子评论管理', {
        comment_id: commentId,
        status: input.status,
        admin_id: req.userId,
        trace_id: req._traceId,
      });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('圈子评论管理失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 用户 ──
  app.get('/api/v1/admin/users', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const status = (req.query.status as string) || 'all';
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      let query =
        'SELECT id, student_id, nickname, auth_status, is_admin, department, org_level, org_name, position, created_at FROM users';
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
      logger.error('管理获取用户失败', { error: err.message, trace_id: req._traceId });
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
          await pool
            .query("INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'approval')", [
              req.params.id,
              `身份认证${input.auth_status === 'verified' ? '通过' : '打回'}`,
              `${userName}，${content}`,
            ])
            .catch((err: any) => logger.warn('审核通知写入失败', { error: err.message, user_id: req.params.id }));
        }
      }

      logger.business('用户审核', {
        user_id: String(req.params.id),
        status: input.auth_status,
        trace_id: req._traceId,
      });
      ok(res, null, '已更新');
    } catch (err: any) {
      logger.error('管理审核失败', { error: err.message, trace_id: req._traceId });
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
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId });
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
          registrant_name: decrypt(r.registrant_name) ?? null,
          student_id: decrypt(r.student_id) ?? null,
          phone: decrypt(r.phone) ?? null,
        })),
        total: countRows[0].total,
      });
    } catch (err: any) {
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId });
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
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId });
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
      logger.error('管理API失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 广告管理 ──
  app.get('/api/v1/admin/ads', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query('SELECT * FROM ads ORDER BY priority DESC, id DESC');
      ok(res, rows);
    } catch (err: any) {
      logger.error('管理获取广告失败', { error: err.message, trace_id: req._traceId });
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
      logger.error('添加广告失败', { error: err.message, trace_id: req._traceId });
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
        title: 'title',
        image_url: 'image_url',
        link_url: 'link_url',
        is_active: 'is_active',
        priority: 'priority',
        start_date: 'start_date',
        end_date: 'end_date',
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
      logger.error('更新广告失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '更新失败');
    }
  });

  app.delete('/api/v1/admin/ads/:id', adminAuth, limiter(5), async (req: Request, res: Response) => {
    try {
      await pool.query('DELETE FROM ads WHERE id = ?', [String(req.params.id)]);
      logger.business('广告删除', { ad_id: req.params.id, trace_id: req._traceId });
      ok(res, null, '已删除');
    } catch (err: any) {
      logger.error('删除广告失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '删除失败');
    }
  });

  // ── PWA 安装事件（前端埋点，无需登录）──
  app.post('/api/v1/pwa/install-event', limiter(30), async (req: Request, res: Response) => {
    try {
      const { event_type, env } = req.body;
      if (
        ![
          'shown',
          'native_clicked',
          'native_accepted',
          'native_dismissed',
          'manual_opened',
          'manual_guide_viewed',
          'dismissed',
        ].includes(event_type)
      ) {
        return fail(res, 400, '无效事件类型');
      }
      const ua = (req.headers['user-agent'] || '').slice(0, 500);
      await pool.query('INSERT INTO pwa_install_events (event_type, env, user_agent, ip_address) VALUES (?, ?, ?, ?)', [
        event_type,
        env || '',
        ua,
        req.ip || '',
      ]);
      ok(res, null);
    } catch (err: any) {
      logger.error('PWA 埋点记录失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '记录失败');
    }
  });

  // ── PWA 安装统计（管理后台）──
  app.get('/api/v1/admin/pwa-install-stats', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const [total]: any = await pool.query('SELECT COUNT(*) AS c FROM pwa_install_events');
      const [byType]: any = await pool.query(
        'SELECT event_type, COUNT(*) AS c FROM pwa_install_events GROUP BY event_type ORDER BY c DESC',
      );
      const [byDay]: any = await pool.query(
        'SELECT DATE(created_at) AS day, COUNT(*) AS c FROM pwa_install_events GROUP BY day ORDER BY day DESC LIMIT 14',
      );
      // 转化率 = native_accepted / shown
      const shown = byType.find((r: any) => r.event_type === 'shown')?.c || 0;
      const accepted = byType.find((r: any) => r.event_type === 'native_accepted')?.c || 0;
      const dismissed = byType.find((r: any) => r.event_type === 'dismissed')?.c || 0;
      ok(res, {
        total: total[0].c,
        byType,
        byDay,
        rate: shown > 0 ? Math.round((accepted / shown) * 100) : 0,
        shown,
        accepted,
        dismissed,
      });
    } catch (err: any) {
      logger.error('PWA 统计失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '统计失败');
    }
  });

  // ── 测试推送（单个用户，按学号定位；调试/验证推送链路用，不走调度器/广播）──
  app.post('/api/v1/admin/push/test-user', adminAuth, limiter(10, 30), async (req: Request, res: Response) => {
    try {
      const bodySchema = z.object({
        studentId: z.string().min(1, '学号不能为空'),
        title: z.string().min(1).max(50).default('川财CampusLink'),
        body: z.string().min(1).max(200).default('这是一条测试推送'),
      });
      const input = validate(res, bodySchema, req.body);
      if (!input) return;

      const [users]: any = await pool.query('SELECT id, nickname FROM users WHERE student_id = ?', [input.studentId]);
      if (!users.length) return fail(res, 404, '未找到该学号对应的用户');
      const user = users[0];

      const [subs]: any = await pool.query('SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ?', [user.id]);
      if (!subs[0].c) return fail(res, 400, `${user.nickname || '该用户'}还没有开启消息通知，无法推送`);

      const sent = await sendPushToUser(pool, user.id, { title: input.title, body: input.body, url: '/campus/' });
      logger.security('管理员触发单用户测试推送', {
        admin_id: (req as any).userId,
        target_user_id: user.id,
        target_student_id: input.studentId,
        sent,
        trace_id: req._traceId,
      });
      if (!sent) return fail(res, 500, '推送发送失败（订阅可能已失效）');
      ok(res, { sent }, `已发送到 ${user.nickname || '该用户'} 的 ${sent} 台设备`);
    } catch (err: any) {
      logger.error('单用户测试推送失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '发送失败');
    }
  });

  // ── 出分播报广播（受限方案：不存教务凭据，无法后台自动判定"是否已出分"，
  //    只能是运营手动喊一声"预计已出分，去扫码同步查看"，不是自动化通知）──
  app.post('/api/v1/admin/push/broadcast', adminAuth, limiter(3, 10), async (req: Request, res: Response) => {
    try {
      const bodySchema = z.object({
        title: z.string().min(1).max(50).default('川财CampusLink'),
        body: z.string().min(1, '内容不能为空').max(200, '内容最多200字'),
      });
      const input = validate(res, bodySchema, req.body);
      if (!input) return;

      const result = await broadcastPush(pool, { title: input.title, body: input.body, url: '/campus/' });
      logger.security('管理员触发推送广播', {
        admin_id: (req as any).userId,
        title: input.title,
        body_length: input.body.length,
        sent: result.sent,
        total: result.total,
        trace_id: req._traceId,
      });
      ok(res, result, `已发送 ${result.sent}/${result.total} 台设备`);
    } catch (err: any) {
      logger.error('推送广播失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '广播失败');
    }
  });

  // ── 交易管理（面交交易，R12 Phase 2）──
  app.get('/api/v1/admin/transactions', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      const status = req.query.status as string;
      let where = '';
      const params: any[] = [];
      if (['pending', 'code_issued', 'completed', 'cancelled', 'disputed'].includes(status)) {
        where = ' WHERE t.status = ?';
        params.push(status);
      }
      const [rows]: any = await pool.query(
        `SELECT t.*, p.title AS post_title, p.price AS post_price,
                s.nickname AS seller_name, b.nickname AS buyer_name
         FROM transactions t
         JOIN posts p ON t.post_id = p.id
         JOIN users s ON t.seller_id = s.id
         JOIN users b ON t.buyer_id = b.id
         ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) AS total FROM transactions t${where ? ' WHERE t.status = ?' : ''}`,
        params,
      );
      ok(res, { list: rows, total: countRows[0].total, page, limit });
    } catch (err: any) {
      logger.error('管理端交易列表失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // 管理员处理交易（标记纠纷/强制完成/取消）
  app.put('/api/v1/admin/transactions/:id/status', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { status: newStatus } = req.body || {};
      if (!['completed', 'cancelled', 'disputed'].includes(newStatus)) return fail(res, 400, '状态无效');
      const [result]: any = await pool.query(
        "UPDATE transactions SET status = ?, completed_at = IF(? = 'completed', NOW(), completed_at) WHERE id = ?",
        [newStatus, newStatus, id],
      );
      if (!result.affectedRows) return fail(res, 404, '交易不存在');
      logger.business('管理员处理交易', { tx_id: id, status: newStatus, admin_id: (req as any).userId });
      ok(res, { id, status: newStatus }, '已更新');
    } catch (err: any) {
      logger.error('管理端交易处理失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '操作失败');
    }
  });
}
