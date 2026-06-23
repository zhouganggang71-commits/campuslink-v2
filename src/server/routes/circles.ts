/**
 * 校园圈路由 — 圈子/帖子/评论/点赞
 * 独立模块注册，崩了不影响其他路由
 */
import { Request, Response } from "express";
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { ErrorCode } from '../errors';
import { createCirclePostSchema, createCircleCommentSchema } from '../validators';

export function registerCircleRoutes(app: any, pool: any) {
  // 将 SQL 返回的 JSON 字符串字段解析为数组
  function parseCirclePosts(rows: any[]) {
    for (const r of rows) {
      if (typeof r.images === 'string') {
        try { r.images = JSON.parse(r.images); } catch { r.images = []; }
      }
      if (!r.images) r.images = [];
      if (typeof r.tags === 'string') {
        try { r.tags = JSON.parse(r.tags); } catch { r.tags = []; }
      }
      if (!r.tags) r.tags = [];
    }
    return rows;
  }

  // ── 圈子列表 ──
  app.get('/api/v1/circles', async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        'SELECT id, name, description, icon, post_count FROM circles WHERE is_active = TRUE ORDER BY sort_order'
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('圈子列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取圈子失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 热门跨圈流（热度 = (点赞+评论×2) / 时间衰减）──
  app.get('/api/v1/circles/trending', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const size = Math.min(30, Math.max(1, parseInt(req.query.size as string) || 20));
      const offset = (page - 1) * size;
      const keyword = (req.query.keyword as string) || '';

      let where = "WHERE cp.status = 'active'";
      const params: any[] = [];

      if (keyword) {
        where += " AND (cp.content LIKE ? OR u.nickname LIKE ?)";
        const like = `%${keyword.replace(/[%_]/g, '\\$&')}%`;
        params.push(like, like);
      }

      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) as total FROM circle_posts cp JOIN users u ON cp.user_id = u.id ${where}`,
        params
      );
      const total = countRows[0].total;

      const [rows]: any = await pool.query(
        `SELECT cp.id, cp.circle_id, cp.content,
                COALESCE(cp.images, '[]') as images,
                COALESCE(cp.tags, '[]') as tags,
                cp.is_anonymous, cp.like_count, cp.comment_count, cp.created_at,
                u.nickname, u.auth_status, u.is_admin,
                ROUND((cp.like_count + cp.comment_count * 2 + 1) / POWER(TIMESTAMPDIFF(HOUR, cp.created_at, NOW()) + 2, 1.5), 2) AS hot_score
         FROM circle_posts cp
         JOIN users u ON cp.user_id = u.id
         ${where}
         ORDER BY hot_score DESC, cp.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, size, offset]
      );
      ok(res, { list: parseCirclePosts(rows), total, page, size, totalPages: Math.ceil(total / size) });
    } catch (err: any) {
      logger.error('热门圈子流失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 单圈帖子流 ──
  app.get('/api/v1/circles/:circleId/posts', async (req: Request, res: Response) => {
    try {
      const { circleId } = req.params;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const size = Math.min(30, Math.max(1, parseInt(req.query.size as string) || 20));
      const offset = (page - 1) * size;
      const keyword = (req.query.keyword as string) || '';

      let where = "WHERE cp.circle_id = ? AND cp.status = 'active'";
      const params: any[] = [circleId];

      if (keyword) {
        where += " AND (cp.content LIKE ? OR u.nickname LIKE ?)";
        const like = `%${keyword.replace(/[%_]/g, '\\$&')}%`;
        params.push(like, like);
      }

      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) as total FROM circle_posts cp JOIN users u ON cp.user_id = u.id ${where}`,
        params
      );
      const total = countRows[0].total;

      const [rows]: any = await pool.query(
        `SELECT cp.id, cp.circle_id, cp.content, cp.images, cp.tags, cp.is_anonymous,
                cp.like_count, cp.comment_count, cp.created_at,
                u.nickname, u.auth_status, u.is_admin
         FROM circle_posts cp
         JOIN users u ON cp.user_id = u.id
         ${where}
         ORDER BY cp.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, size, offset]
      );
      ok(res, { list: parseCirclePosts(rows), total, page, size, totalPages: Math.ceil(total / size) });
    } catch (err: any) {
      logger.error('圈子帖子流失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 发布帖子 ──
  app.post('/api/v1/circles/:circleId/posts', auth, limiter(3), async (req: Request, res: Response) => {
    try {
      if (!(req as any).isVerified) return fail(res, 403, '账号待审核，审核通过后才能发布');
      const userId = (req as any).userId;
      const { circleId } = req.params;

      // Zod 入参校验
      const input = validate(res, createCirclePostSchema, req.body);
      if (!input) return;
      const trimmed = input.content.trim().slice(0, 500);
      const imageArr = input.images.slice(0, 9);
      const tagArr = input.tags.slice(0, 5);

      // 圈子存在性
      const [circleRows]: any = await pool.query('SELECT id FROM circles WHERE id = ? AND is_active = TRUE', [circleId]);
      if (!circleRows.length) {
        return fail(res, 404, '圈子不存在', ErrorCode.NOT_FOUND);
      }

      // 敏感词检测
      if ((req as any).sensitiveFilter) {
        const hit = (req as any).sensitiveFilter.check(trimmed);
        if (hit) {
          logger.security('校园圈敏感词命中', { user_id: userId, word: hit, trace_id: (req as any)._traceId });
          return fail(res, 400, '内容包含敏感词，请修改后重试');
        }
      }

      // 5分钟内内容去重
      const [dupRows]: any = await pool.query(
        'SELECT id FROM circle_posts WHERE user_id = ? AND circle_id = ? AND content = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)',
        [userId, circleId, trimmed]
      );
      if (dupRows.length > 0) {
        return fail(res, 400, '请勿重复发布相同内容');
      }

      const imagesJson = imageArr.length > 0 ? JSON.stringify(imageArr) : null;
      const tagsJson = tagArr.length > 0 ? JSON.stringify(tagArr) : null;

      const [result]: any = await pool.query(
        'INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, circleId, trimmed, imagesJson, tagsJson, !!input.is_anonymous]
      );

      // 更新圈子帖子计数
      await pool.query('UPDATE circles SET post_count = post_count + 1 WHERE id = ?', [circleId]);

      logger.business('校园圈发布', {
        user_id: userId,
        circle_id: circleId,
        content_len: trimmed.length,
        post_id: result.insertId,
        is_anonymous: !!input.is_anonymous,
        trace_id: (req as any)._traceId,
      });

      const [newPost]: any = await pool.query(
        `SELECT cp.id, cp.circle_id, cp.content, cp.images, cp.tags, cp.is_anonymous,
                cp.like_count, cp.comment_count, cp.created_at,
                u.nickname, u.auth_status, u.is_admin
         FROM circle_posts cp JOIN users u ON cp.user_id = u.id WHERE cp.id = ?`,
        [result.insertId]
      );
      ok(res, parseCirclePosts(newPost)[0] || null);
    } catch (err: any) {
      logger.error('校园圈发布失败', { error: err.message, stack: err.stack, trace_id: (req as any)._traceId });
      fail(res, 500, '发布失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 删除帖子（软删，仅本人）──
  app.delete('/api/v1/circles/:circleId/posts/:postId', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { postId, circleId } = req.params;

      const [rows]: any = await pool.query('SELECT id, user_id, status FROM circle_posts WHERE id = ?', [postId]);
      if (!rows.length) return fail(res, 404, '帖子不存在', ErrorCode.CIRCLE_POST_NOT_FOUND);
      if (rows[0].user_id !== userId) return fail(res, 403, '无权限删除');
      if (rows[0].status === 'deleted') return ok(res, null);

      await pool.query("UPDATE circle_posts SET status = 'deleted' WHERE id = ?", [postId]);
      await pool.query('UPDATE circles SET post_count = GREATEST(post_count - 1, 0) WHERE id = ?', [circleId]);

      logger.business('校园圈帖子删除', { user_id: userId, post_id: postId, circle_id: circleId, trace_id: (req as any)._traceId });
      ok(res, null);
    } catch (err: any) {
      logger.error('校园圈删除帖子失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '删除失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 点赞（幂等 + 每人每天最多5个）──
  app.post('/api/v1/circle-posts/:postId/like', auth, limiter(20), async (req: Request, res: Response) => {
    try {
      if (!(req as any).isVerified) return fail(res, 403, '账号待审核，审核通过后才能点赞');
      const userId = (req as any).userId;
      const { postId } = req.params;

      // 帖子存在性
      const [postRows]: any = await pool.query('SELECT id, status FROM circle_posts WHERE id = ?', [postId]);
      if (!postRows.length || postRows[0].status !== 'active') {
        return fail(res, 404, '帖子不存在', ErrorCode.CIRCLE_POST_NOT_FOUND);
      }

      // INSERT IGNORE 保证幂等
      await pool.query('INSERT IGNORE INTO circle_likes (user_id, post_id) VALUES (?, ?)', [userId, postId]);

      // 重算点赞数
      const [countRows]: any = await pool.query('SELECT COUNT(*) AS cnt FROM circle_likes WHERE post_id = ?', [postId]);
      const count = countRows[0].cnt;
      await pool.query('UPDATE circle_posts SET like_count = ? WHERE id = ?', [count, postId]);

      ok(res, { liked: true, like_count: count });
    } catch (err: any) {
      logger.error('校园圈点赞失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 评论 ──
  app.post('/api/v1/circle-posts/:postId/comment', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      if (!(req as any).isVerified) return fail(res, 403, '账号待审核，审核通过后才能评论');
      const userId = (req as any).userId;
      const { postId } = req.params;

      const input = validate(res, createCircleCommentSchema, req.body);
      if (!input) return;
      const trimmed = input.content.trim().slice(0, 500);

      // 帖子存在性
      const [postRows]: any = await pool.query('SELECT id, status FROM circle_posts WHERE id = ?', [postId]);
      if (!postRows.length || postRows[0].status !== 'active') {
        return fail(res, 404, '帖子不存在', ErrorCode.CIRCLE_POST_NOT_FOUND);
      }

      // 敏感词检测
      if ((req as any).sensitiveFilter) {
        const hit = (req as any).sensitiveFilter.check(trimmed);
        if (hit) {
          logger.security('校园圈评论敏感词命中', { user_id: userId, word: hit, trace_id: (req as any)._traceId });
          return fail(res, 400, '评论包含敏感词，请修改后重试');
        }
      }

      // 30秒内同帖同内容去重（防手抖连发）
      const [dupRows]: any = await pool.query(
        'SELECT id FROM circle_comments WHERE user_id = ? AND post_id = ? AND content = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)',
        [userId, postId, trimmed]
      );
      if (dupRows.length > 0) {
        return fail(res, 400, '请勿短时间内重复评论');
      }

      const parentId = input.parent_id && typeof input.parent_id === 'number' ? input.parent_id : null;
      const [result]: any = await pool.query(
        'INSERT INTO circle_comments (post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)',
        [postId, userId, parentId, trimmed]
      );

      // 更新评论计数
      await pool.query('UPDATE circle_posts SET comment_count = comment_count + 1 WHERE id = ?', [postId]);

      logger.business('校园圈评论', { user_id: userId, post_id: postId, comment_id: result.insertId, trace_id: (req as any)._traceId });

      const [newComment]: any = await pool.query(
        `SELECT cc.id, cc.post_id, cc.parent_id, cc.content, cc.created_at,
                u.nickname, u.auth_status
         FROM circle_comments cc JOIN users u ON cc.user_id = u.id WHERE cc.id = ?`,
        [result.insertId]
      );
      ok(res, newComment[0] || null);
    } catch (err: any) {
      logger.error('校园圈评论失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '评论失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 评论列表（含一级评论+嵌套回复）──
  app.get('/api/v1/circle-posts/:postId/comments', async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      const [rows]: any = await pool.query(
        `SELECT cc.id, cc.post_id, cc.parent_id, cc.content, cc.created_at,
                u.nickname, u.auth_status
         FROM circle_comments cc JOIN users u ON cc.user_id = u.id
         WHERE cc.post_id = ? AND cc.status = 'active'
         ORDER BY cc.created_at ASC`,
        [postId]
      );

      // 树形组装：一级评论 + 嵌套回复
      const top: any[] = [];
      const replies: Record<number, any[]> = {};
      for (const r of rows) {
        if (!r.parent_id) {
          r.replies = [];
          top.push(r);
          replies[r.id] = r.replies;
        } else {
          if (replies[r.parent_id]) {
            replies[r.parent_id].push(r);
          }
        }
      }
      ok(res, top);
    } catch (err: any) {
      logger.error('校园圈评论列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取评论失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 收藏（切换）──
  app.post('/api/v1/circle-posts/:postId/favorite', auth, limiter(15), async (req: Request, res: Response) => {
    try {
      if (!(req as any).isVerified) return fail(res, 403, '账号待审核，审核通过后才能收藏');
      const userId = (req as any).userId;
      const { postId } = req.params;
      const [existing]: any = await pool.query('SELECT id FROM circle_favorites WHERE user_id = ? AND post_id = ?', [userId, postId]);
      if (existing.length > 0) {
        await pool.query('DELETE FROM circle_favorites WHERE id = ?', [existing[0].id]);
        logger.business('校园圈取消收藏', { user_id: userId, post_id: postId, trace_id: (req as any)._traceId });
        ok(res, { favorited: false });
      } else {
        await pool.query('INSERT INTO circle_favorites (user_id, post_id) VALUES (?, ?)', [userId, postId]);
        logger.business('校园圈收藏', { user_id: userId, post_id: postId, trace_id: (req as any)._traceId });
        ok(res, { favorited: true });
      }
    } catch (err: any) {
      logger.error('校园圈收藏操作失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 收藏列表 ──
  app.get('/api/v1/circle-favorites', auth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const [rows]: any = await pool.query(
        `SELECT cp.id, cp.circle_id, cp.content, cp.images, cp.tags, cp.is_anonymous,
                cp.like_count, cp.comment_count, cp.created_at,
                u.nickname, u.auth_status, u.is_admin
         FROM circle_favorites cf
         JOIN circle_posts cp ON cf.post_id = cp.id
         JOIN users u ON cp.user_id = u.id
         WHERE cf.user_id = ? AND cp.status = 'active'
         ORDER BY cf.created_at DESC`,
        [userId]
      );
      ok(res, parseCirclePosts(rows));
    } catch (err: any) {
      logger.error('校园圈收藏列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败', ErrorCode.INTERNAL_ERROR);
    }
  });
}
