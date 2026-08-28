/**
 * 校园圈路由 — 圈子/帖子/评论/点赞
 * 独立模块注册，崩了不影响其他路由
 */
import { Request, Response } from 'express';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { ErrorCode } from '../errors';
import { createCirclePostSchema, createCircleCommentSchema } from '../validators';
import { checkSensitive } from '../../utils/sensitiveFilter';

export function registerCircleRoutes(app: any, pool: any) {
  /**
   * 互动消息：点赞/评论/回复复用 notices 表，不另起新表
   * category: circle_like / circle_comment / circle_reply；target_type/target_id 供前端点击跳转
   */
  async function notifyInteraction(
    recipientId: number,
    actorId: number,
    category: string,
    postId: number,
    actionText: string,
  ) {
    try {
      const [actorRows]: any = await pool.query('SELECT nickname FROM users WHERE id = ?', [actorId]);
      const actorName = actorRows[0]?.nickname || '有人';
      const content = `${actorName} ${actionText}`;
      try {
        await pool.query(
          "INSERT INTO notices (user_id, title, content, category, target_type, target_id) VALUES (?, ?, ?, ?, 'circle_post', ?)",
          [recipientId, actionText, content, category, postId],
        );
      } catch (err: any) {
        // 迁移040未执行时 target_type/target_id 列不存在，降级为纯文本通知，不阻塞主流程
        if (err?.errno !== 1054 && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
        await pool.query('INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, ?)', [
          recipientId,
          actionText,
          content,
          category,
        ]);
      }
    } catch (err: any) {
      logger.error('写入互动通知失败', { error: err.message, recipient_id: recipientId, actor_id: actorId, category });
    }
  }

  // 将 SQL 返回的 JSON 字符串字段解析为数组
  function parseCirclePosts(rows: any[]) {
    for (const r of rows) {
      if (typeof r.images === 'string') {
        try {
          r.images = JSON.parse(r.images);
        } catch {
          r.images = [];
        }
      }
      if (!r.images) r.images = [];
      if (typeof r.tags === 'string') {
        try {
          r.tags = JSON.parse(r.tags);
        } catch {
          r.tags = [];
        }
      }
      if (!r.tags) r.tags = [];
    }
    return rows;
  }

  // ── 圈子列表 ──
  app.get('/api/v1/circles', async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        'SELECT id, name, description, icon, post_count FROM circles WHERE is_active = TRUE ORDER BY sort_order',
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
        const safeKeyword = keyword.slice(0, 100);
        where += ' AND (cp.content LIKE ? OR u.nickname LIKE ?)';
        const like = `%${safeKeyword.replace(/[%_]/g, '\\$&')}%`;
        params.push(like, like);
      }

      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) as total FROM circle_posts cp JOIN users u ON cp.user_id = u.id ${where}`,
        params,
      );
      const total = countRows[0].total;

      const [rows]: any = await pool.query(
        `SELECT cp.id, cp.circle_id, cp.content,
                (CASE WHEN cp.is_anonymous THEN NULL ELSE cp.user_id END) AS user_id,
                COALESCE(cp.images, '[]') as images,
                COALESCE(cp.tags, '[]') as tags,
                cp.is_anonymous, cp.like_count, cp.comment_count, cp.created_at,
                u.nickname, u.auth_status, u.is_admin,
                (CASE WHEN cp.is_anonymous THEN NULL ELSE u.avatar_url END) AS avatar_url,
                (CASE WHEN cp.is_anonymous OR NOT u.gender_visible THEN NULL ELSE u.gender END) AS gender,
                ROUND((cp.like_count + cp.comment_count * 2 + 1) / POWER(TIMESTAMPDIFF(HOUR, cp.created_at, NOW()) + 2, 1.5), 2) AS hot_score
         FROM circle_posts cp
         JOIN users u ON cp.user_id = u.id
         ${where}
         ORDER BY hot_score DESC, cp.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, size, offset],
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
        const safeKeyword = keyword.slice(0, 100);
        where += ' AND (cp.content LIKE ? OR u.nickname LIKE ?)';
        const like = `%${safeKeyword.replace(/[%_]/g, '\\$&')}%`;
        params.push(like, like);
      }

      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) as total FROM circle_posts cp JOIN users u ON cp.user_id = u.id ${where}`,
        params,
      );
      const total = countRows[0].total;

      const [rows]: any = await pool.query(
        `SELECT cp.id, cp.circle_id, cp.content,
                (CASE WHEN cp.is_anonymous THEN NULL ELSE cp.user_id END) AS user_id,
                cp.images, cp.tags, cp.is_anonymous,
                cp.like_count, cp.comment_count, cp.created_at,
                u.nickname, u.auth_status, u.is_admin,
                (CASE WHEN cp.is_anonymous THEN NULL ELSE u.avatar_url END) AS avatar_url,
                (CASE WHEN cp.is_anonymous OR NOT u.gender_visible THEN NULL ELSE u.gender END) AS gender
         FROM circle_posts cp
         JOIN users u ON cp.user_id = u.id
         ${where}
         ORDER BY cp.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, size, offset],
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
      const [circleRows]: any = await pool.query('SELECT id FROM circles WHERE id = ? AND is_active = TRUE', [
        circleId,
      ]);
      if (!circleRows.length) {
        return fail(res, 404, '圈子不存在', ErrorCode.NOT_FOUND);
      }

      // 敏感词检测
      const sensitive = checkSensitive(trimmed);
      if (!sensitive.passed) {
        logger.security('校园圈敏感词命中', {
          user_id: userId,
          hit_words: sensitive.hitWords,
          trace_id: (req as any)._traceId,
        });
        return fail(res, 400, `内容包含违规词汇：${sensitive.hitWords.slice(0, 5).join('、')}`);
      }

      // 5分钟内内容去重
      const [dupRows]: any = await pool.query(
        'SELECT id FROM circle_posts WHERE user_id = ? AND circle_id = ? AND content = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)',
        [userId, circleId, trimmed],
      );
      if (dupRows.length > 0) {
        return fail(res, 400, '请勿重复发布相同内容');
      }

      const imagesJson = imageArr.length > 0 ? JSON.stringify(imageArr) : null;
      const tagsJson = tagArr.length > 0 ? JSON.stringify(tagArr) : null;

      const [result]: any = await pool.query(
        'INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, circleId, trimmed, imagesJson, tagsJson, !!input.is_anonymous],
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
        `SELECT cp.id, cp.circle_id, cp.content,
                (CASE WHEN cp.is_anonymous THEN NULL ELSE cp.user_id END) AS user_id,
                cp.images, cp.tags, cp.is_anonymous,
                cp.like_count, cp.comment_count, cp.created_at,
                u.nickname, u.auth_status, u.is_admin,
                (CASE WHEN cp.is_anonymous THEN NULL ELSE u.avatar_url END) AS avatar_url,
                (CASE WHEN cp.is_anonymous OR NOT u.gender_visible THEN NULL ELSE u.gender END) AS gender
         FROM circle_posts cp JOIN users u ON cp.user_id = u.id WHERE cp.id = ?`,
        [result.insertId],
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

      logger.business('校园圈帖子删除', {
        user_id: userId,
        post_id: postId,
        circle_id: circleId,
        trace_id: (req as any)._traceId,
      });
      ok(res, null);
    } catch (err: any) {
      logger.error('校园圈删除帖子失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '删除失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 点赞 / 取消点赞（切换，一人一帖只能计一票）──
  app.post('/api/v1/circle-posts/:postId/like', auth, limiter(20), async (req: Request, res: Response) => {
    try {
      if (!(req as any).isVerified) return fail(res, 403, '账号待审核，审核通过后才能点赞');
      const userId = (req as any).userId;
      const { postId } = req.params;

      // 帖子存在性
      const [postRows]: any = await pool.query('SELECT id, user_id, status FROM circle_posts WHERE id = ?', [postId]);
      if (!postRows.length || postRows[0].status !== 'active') {
        return fail(res, 404, '帖子不存在', ErrorCode.CIRCLE_POST_NOT_FOUND);
      }

      // 已点赞则取消，未点赞则点上 —— 前端据此渲染"已赞"状态，避免重复点击无限加赞的观感
      // circle_likes 是 (user_id, post_id) 复合主键，没有自增 id 列，直接按这两列查/删
      const [existing]: any = await pool.query('SELECT 1 FROM circle_likes WHERE user_id = ? AND post_id = ?', [
        userId,
        postId,
      ]);
      let liked: boolean;
      if (existing.length > 0) {
        await pool.query('DELETE FROM circle_likes WHERE user_id = ? AND post_id = ?', [userId, postId]);
        liked = false;
      } else {
        try {
          await pool.query('INSERT INTO circle_likes (user_id, post_id) VALUES (?, ?)', [userId, postId]);
        } catch (insertErr: any) {
          // 并发双击撞 (user_id, post_id) 主键 → 视为已点赞成功，而不是 500
          if (insertErr?.errno !== 1062) throw insertErr;
        }
        liked = true;
        // 互动消息：赞了别人的帖子才通知，赞自己的不通知；写入失败不影响点赞主流程
        if (postRows[0].user_id !== userId) {
          notifyInteraction(postRows[0].user_id, userId, 'circle_like', Number(postId), '赞了你的帖子').catch(() => {});
        }
      }

      // 重算点赞数（以 circle_likes 实际行数为准，避免计数漂移）
      const [countRows]: any = await pool.query('SELECT COUNT(*) AS cnt FROM circle_likes WHERE post_id = ?', [postId]);
      const count = countRows[0].cnt;
      await pool.query('UPDATE circle_posts SET like_count = ? WHERE id = ?', [count, postId]);

      logger.business('校园圈点赞切换', { user_id: userId, post_id: postId, liked, trace_id: (req as any)._traceId });
      ok(res, { liked, like_count: count });
    } catch (err: any) {
      logger.error('校园圈点赞失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败', ErrorCode.INTERNAL_ERROR);
    }
  });

  // ── 点赞列表（当前用户已点赞的帖子 id，供前端渲染"已赞"高亮）──
  app.get('/api/v1/circle-likes', auth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const [rows]: any = await pool.query(
        `SELECT cl.post_id AS id FROM circle_likes cl
         JOIN circle_posts cp ON cl.post_id = cp.id
         WHERE cl.user_id = ? AND cp.status = 'active'`,
        [userId],
      );
      ok(
        res,
        rows.map((r: any) => r.id),
      );
    } catch (err: any) {
      logger.error('校园圈点赞列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败', ErrorCode.INTERNAL_ERROR);
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
      const [postRows]: any = await pool.query('SELECT id, user_id, status FROM circle_posts WHERE id = ?', [postId]);
      if (!postRows.length || postRows[0].status !== 'active') {
        return fail(res, 404, '帖子不存在', ErrorCode.CIRCLE_POST_NOT_FOUND);
      }

      // 敏感词检测
      const sensitive = checkSensitive(trimmed);
      if (!sensitive.passed) {
        logger.security('校园圈评论敏感词命中', {
          user_id: userId,
          hit_words: sensitive.hitWords,
          trace_id: (req as any)._traceId,
        });
        return fail(res, 400, `评论包含违规词汇：${sensitive.hitWords.slice(0, 5).join('、')}`);
      }

      // 30秒内同帖同内容去重（防手抖连发）
      const [dupRows]: any = await pool.query(
        'SELECT id FROM circle_comments WHERE user_id = ? AND post_id = ? AND content = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)',
        [userId, postId, trimmed],
      );
      if (dupRows.length > 0) {
        return fail(res, 400, '请勿短时间内重复评论');
      }

      const parentId = input.parent_id && typeof input.parent_id === 'number' ? input.parent_id : null;
      const imageUrl = input.image_url?.trim().slice(0, 500) || null;
      const [result]: any = await pool.query(
        'INSERT INTO circle_comments (post_id, user_id, parent_id, content, image_url) VALUES (?, ?, ?, ?, ?)',
        [postId, userId, parentId, trimmed, imageUrl],
      );

      // 更新评论计数
      await pool.query('UPDATE circle_posts SET comment_count = comment_count + 1 WHERE id = ?', [postId]);

      logger.business('校园圈评论', {
        user_id: userId,
        post_id: postId,
        comment_id: result.insertId,
        trace_id: (req as any)._traceId,
      });

      // 互动消息：回复评论通知被回复者，一级评论通知帖子作者；评论/回复自己不通知；写入失败不影响评论主流程
      if (parentId) {
        try {
          const [parentRows]: any = await pool.query('SELECT user_id FROM circle_comments WHERE id = ?', [parentId]);
          if (parentRows.length && parentRows[0].user_id !== userId) {
            notifyInteraction(parentRows[0].user_id, userId, 'circle_reply', Number(postId), '回复了你的评论').catch(
              () => {},
            );
          }
        } catch {
          /* 通知失败不影响评论主流程 */
        }
      } else if (postRows[0].user_id !== userId) {
        notifyInteraction(postRows[0].user_id, userId, 'circle_comment', Number(postId), '评论了你的帖子').catch(
          () => {},
        );
      }

      const [newComment]: any = await pool.query(
        `SELECT cc.id, cc.post_id, cc.parent_id, cc.content, cc.image_url, cc.created_at,
                u.nickname, u.auth_status
         FROM circle_comments cc JOIN users u ON cc.user_id = u.id WHERE cc.id = ?`,
        [result.insertId],
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
        `SELECT cc.id, cc.post_id, cc.parent_id, cc.content, cc.image_url, cc.created_at,
                u.nickname, u.auth_status
         FROM circle_comments cc JOIN users u ON cc.user_id = u.id
         WHERE cc.post_id = ? AND cc.status = 'active'
         ORDER BY cc.created_at ASC`,
        [postId],
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
      const [existing]: any = await pool.query('SELECT id FROM circle_favorites WHERE user_id = ? AND post_id = ?', [
        userId,
        postId,
      ]);
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
        `SELECT cp.id, cp.circle_id, cp.content,
                (CASE WHEN cp.is_anonymous THEN NULL ELSE cp.user_id END) AS user_id,
                cp.images, cp.tags, cp.is_anonymous,
                cp.like_count, cp.comment_count, cp.created_at,
                u.nickname, u.auth_status, u.is_admin,
                (CASE WHEN cp.is_anonymous THEN NULL ELSE u.avatar_url END) AS avatar_url,
                (CASE WHEN cp.is_anonymous OR NOT u.gender_visible THEN NULL ELSE u.gender END) AS gender
         FROM circle_favorites cf
         JOIN circle_posts cp ON cf.post_id = cp.id
         JOIN users u ON cp.user_id = u.id
         WHERE cf.user_id = ? AND cp.status = 'active'
         ORDER BY cf.created_at DESC`,
        [userId],
      );
      ok(res, parseCirclePosts(rows));
    } catch (err: any) {
      logger.error('校园圈收藏列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败', ErrorCode.INTERNAL_ERROR);
    }
  });
}
